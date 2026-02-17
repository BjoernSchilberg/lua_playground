"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { LuaWorkerClient } from "@/lib/workerClient";
import type { MsgFromWorker, WorkerState } from "@/lib/protocol";
import { loadThemeList, fetchThemeData, isBuiltin, getThemeColors, type ThemeEntry } from "@/lib/monacoThemes";
import CommandPalette, { type PaletteItem, type PaletteColors } from "@/components/CommandPalette";
import basePath from "@/lib/basePath";
import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

// Dynamically import Monaco to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#1e1e1e] text-neutral-500">
      Loading editor…
    </div>
  ),
});

const DEFAULT_CODE = `print("Lua WASM ready ✅")
print("Wie heißt du? ")
name = io.read()
print("Hallo " .. name)
-- Probiere es aus: Schreibe Lua-Code hier und klicke "Run"!
`;

const STORAGE_KEY = "lua_playground_scripts";

const EXAMPLES: { name: string; file: string }[] = [
  { name: "Conway's Game of Life", file: `${basePath}/examples/conway.lua` },
  { name: "Beispiel für Eingabe", file: `${basePath}/examples/input.lua` },
  { name: "Lua in 15 Minutes", file: `${basePath}/examples/LearnLuaIn15min.lua` },
];

/* ---- localStorage helpers ---- */

function getSavedScripts(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveScript(name: string, code: string) {
  const scripts = getSavedScripts();
  scripts[name] = code;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

function deleteScript(name: string) {
  const scripts = getSavedScripts();
  delete scripts[name];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

const STATUS_LABELS: Record<WorkerState, string> = {
  idle: "Idle",
  running: "Running…",
  waiting_input: "Waiting for input…",
  stopped: "Stopped",
  error: "Error",
};

const STATUS_COLORS: Record<WorkerState, string> = {
  idle: "bg-neutral-600",
  running: "bg-green-600",
  waiting_input: "bg-yellow-600",
  stopped: "bg-red-600",
  error: "bg-red-700",
};

/* ---- Color helpers for adaptive UI ---- */

function hexAdjust(hex: string, amount: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const raw = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = clamp(parseInt(raw.slice(0, 2), 16) + amount);
  const g = clamp(parseInt(raw.slice(2, 4), 16) + amount);
  const b = clamp(parseInt(raw.slice(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function luma(hex: string): number {
  const raw = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Derive a full UI palette from the editor background + foreground colours.
 */
function deriveUiColors(bg: string, fg: string) {
  const dark = luma(bg) < 128;
  const step = dark ? 12 : -12;
  return {
    bg,
    fg,
    surface: hexAdjust(bg, step),        // header, console header, input bar
    surface2: hexAdjust(bg, step * 2),    // menus, world placeholder
    border: hexAdjust(bg, dark ? 30 : -30),
    handle: hexAdjust(bg, dark ? 40 : -40),
    muted: dark ? "#9ca3af" : "#6b7280",  // muted text
    consoleText: dark ? "#4ade80" : "#166534",   // green-400 / green-800
    consoleError: dark ? "#f87171" : "#b91c1c",  // red-400 / red-700
    btnNeutral: dark ? "#404040" : "#d4d4d4",       // neutral button bg
    btnNeutralHover: dark ? "#525252" : "#c0c0c0",  // neutral button hover
    btnNeutralText: dark ? "#e5e5e5" : "#1a1a1a",   // neutral button text
    isDark: dark,
  };
}

export default function HomePage() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [consoleLines, setConsoleLines] = useState<
    { text: string; isError?: boolean }[]
  >([]);
  const [status, setStatus] = useState<WorkerState>("idle");
  const [inputValue, setInputValue] = useState("");
  const [ready, setReady] = useState(false);

  /* ---- File menu state ---- */
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [currentFileName, setCurrentFileName] = useState("");

  /* ---- Theme / Command Palette state ---- */
  const [editorTheme, setEditorTheme] = useState("vs-dark");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [themeList, setThemeList] = useState<ThemeEntry[]>([]);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const definedThemes = useRef(new Set<string>());

  /* ---- Lua formatter ---- */
  const luaFmtRef = useRef<((code: string) => string) | null>(null);

  /* ---- Vim mode state ---- */
  const [vimEnabled, setVimEnabled] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vimModeRef = useRef<any>(null);
  const vimStatusRef = useRef<HTMLDivElement | null>(null);

  /* ---- Line numbers state ---- */
  const [lineNumbers, setLineNumbers] = useState(true);

  /* ---- World panel state ---- */
  const [showWorld, setShowWorld] = useState(false);

  // Restore vim preference after hydration
  useEffect(() => {
    if (localStorage.getItem("lua_playground_vim") === "true") {
      setVimEnabled(true);
    }
  }, []);

  /* ---- Adaptive UI colours derived from editor theme ---- */
  const [themeBg, setThemeBg] = useState("#1e1e1e");
  const [themeFg, setThemeFg] = useState("#d4d4d4");
  const ui = useMemo(() => deriveUiColors(themeBg, themeFg), [themeBg, themeFg]);

  /** Update the UI palette from a theme id (+ optional pre-fetched data) */
  const applyThemeColors = useCallback(
    (themeId: string, data?: Parameters<typeof getThemeColors>[1]) => {
      const { bg, fg } = getThemeColors(themeId, data);
      setThemeBg(bg);
      setThemeFg(fg);
    },
    []
  );

  /* ---- Resizable panel state ---- */
  const [editorWidthPct, setEditorWidthPct] = useState(70); // % of main width for editor
  const [consolePct, setConsolePct] = useState(30); // % of available height for console
  const mainRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const workerRef = useRef<LuaWorkerClient | null>(null);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /* ---- Register Monaco instance when editor loads ---- */
  const handleEditorMount = useCallback((editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editorInstance;

    /* Register Lua formatting provider (lazy-load WASM formatter) */
    import("@wasm-fmt/lua_fmt/web").then(async (mod) => {
      await mod.default(`${basePath}/lua_fmt_bg.wasm`);
      const { format } = mod;
      luaFmtRef.current = format;
      monaco.languages.registerDocumentFormattingEditProvider("lua", {
        provideDocumentFormattingEdits(model: editor.ITextModel) {
          try {
            const formatted = format(model.getValue());
            return [{ range: model.getFullModelRange(), text: formatted }];
          } catch {
            // Syntax error in Lua code — skip formatting
            return [];
          }
        },
      });
    });

    /* Register actions in Monaco's built-in Command Palette (F1) */
    editorInstance.addAction({
      id: "lua-playground.format-document",
      label: "Format Document",
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: (ed) => {
        const action = ed.getAction("editor.action.formatDocument");
        if (action) {
          action.run();
        } else if (luaFmtRef.current) {
          try {
            const model = ed.getModel();
            if (model) {
              const formatted = luaFmtRef.current(model.getValue());
              model.pushEditOperations([], [{ range: model.getFullModelRange(), text: formatted }], () => null);
            }
          } catch { /* syntax error — ignore */ }
        }
      },
    });

    editorInstance.addAction({
      id: "lua-playground.toggle-vim",
      label: "Toggle Vim Mode",
      run: () => {
        setVimEnabled((v) => !v);
      },
    });

    editorInstance.addAction({
      id: "lua-playground.fontZoomIn",
      label: "Font Zoom In",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal],
      run: (ed) => ed.getAction("editor.action.fontZoomIn")?.run(),
    });

    editorInstance.addAction({
      id: "lua-playground.fontZoomOut",
      label: "Font Zoom Out",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus],
      run: (ed) => ed.getAction("editor.action.fontZoomOut")?.run(),
    });

    editorInstance.addAction({
      id: "lua-playground.fontZoomReset",
      label: "Font Zoom Reset",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0],
      run: (ed) => ed.getAction("editor.action.fontZoomReset")?.run(),
    });
  }, []);

  /* ---- Load theme list on mount ---- */
  useEffect(() => {
    loadThemeList().then(setThemeList);
  }, []);

  /* ---- Vim mode toggle effect ---- */
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    localStorage.setItem("lua_playground_vim", String(vimEnabled));

    if (vimEnabled) {
      let disposed = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let instance: any = null;
      // Dynamic import to avoid SSR window access
      import("monaco-vim").then(({ initVimMode }) => {
        if (disposed) return;
        if (vimStatusRef.current && editorRef.current) {
          instance = initVimMode(editorRef.current, vimStatusRef.current);
          vimModeRef.current = instance;
        }
      });
      return () => {
        disposed = true;
        instance?.dispose();
        vimModeRef.current?.dispose();
        vimModeRef.current = null;
      };
    } else {
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
    }
  }, [vimEnabled]);

  /* ---- Command Palette items ---- */
  const paletteItems: PaletteItem[] = useMemo(
    () => [
      {
        id: "run:start",
        label: "Run",
        category: "Lua",
      },
      {
        id: "run:stop",
        label: "Stop",
        category: "Lua",
      },
      {
        id: "run:reset",
        label: "Reset",
        category: "Lua",
      },
      {
        id: "file:new",
        label: "Neu",
        category: "File",
      },
      {
        id: "file:save",
        label: "Speichern…",
        category: "File",
      },
      {
        id: "file:download",
        label: "Download .lua",
        category: "File",
      },
      {
        id: "file:open",
        label: "Datei öffnen…",
        category: "File",
      },
      {
        id: "format:document",
        label: "Format Document",
        category: "Editor",
      },
      {
        id: "vim:toggle",
        label: vimEnabled ? "Disable Vim Mode" : "Enable Vim Mode",
        category: "Editor",
      },
      {
        id: "font:zoomIn",
        label: "Font Zoom In",
        category: "Editor",
      },
      {
        id: "font:zoomOut",
        label: "Font Zoom Out",
        category: "Editor",
      },
      {
        id: "font:zoomReset",
        label: "Font Zoom Reset",
        category: "Editor",
      },
      {
        id: "editor:lineNumbers",
        label: lineNumbers ? "Hide Line Numbers" : "Show Line Numbers",
        category: "Editor",
      },
      {
        id: "editor:toggleWorld",
        label: showWorld ? "Hide Isometric World" : "Show Isometric World",
        category: "Editor",
      },
      ...themeList.map((t) => ({
        id: `theme:${t.id}`,
        label: t.label,
        category: "Theme",
      })),
    ],
    [themeList, vimEnabled, lineNumbers, showWorld]
  );

  const themeBeforePalette = useRef("vs-dark");

  const handlePaletteSelect = useCallback(async (id: string) => {
    if (id === "file:new") {
      setCode("");
      setCurrentFileName("");
      setPaletteOpen(false);
      return;
    }
    if (id === "file:save") {
      setPaletteOpen(false);
      setShowFileMenu(true);
      setSaveDialogOpen(true);
      return;
    }
    if (id === "file:download") {
      const currentCode = editorRef.current?.getModel()?.getValue() ?? "";
      const blob = new Blob([currentCode], { type: "text/x-lua" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = currentFileName || "script";
      a.download = baseName.endsWith(".lua") ? baseName : `${baseName}.lua`;
      a.click();
      URL.revokeObjectURL(url);
      setPaletteOpen(false);
      return;
    }
    if (id === "file:open") {
      handleUploadClick();
      setPaletteOpen(false);
      return;
    }
    if (id === "format:document") {
      const ed = editorRef.current;
      if (ed) {
        const action = ed.getAction("editor.action.formatDocument");
        if (action) {
          await action.run();
        } else if (luaFmtRef.current) {
          // Fallback: apply formatting directly
          try {
            const model = ed.getModel();
            if (model) {
              const formatted = luaFmtRef.current(model.getValue());
              model.pushEditOperations([], [{ range: model.getFullModelRange(), text: formatted }], () => null);
            }
          } catch { /* syntax error — ignore */ }
        }
      }
      setPaletteOpen(false);
      return;
    }
    if (id === "vim:toggle") {
      setVimEnabled((v) => !v);
      setPaletteOpen(false);
      return;
    }
    if (id.startsWith("font:zoom")) {
      const ed = editorRef.current;
      if (ed) {
        if (id === "font:zoomIn") ed.getAction("editor.action.fontZoomIn")?.run();
        if (id === "font:zoomOut") ed.getAction("editor.action.fontZoomOut")?.run();
        if (id === "font:zoomReset") ed.getAction("editor.action.fontZoomReset")?.run();
      }
      setPaletteOpen(false);
      return;
    }
    if (id === "editor:lineNumbers") {
      setLineNumbers((v) => {
        const next = !v;
        editorRef.current?.updateOptions({ lineNumbers: next ? "on" : "off" });
        return next;
      });
      setPaletteOpen(false);
      return;
    }
    if (id === "editor:toggleWorld") {
      setShowWorld((v) => !v);
      setPaletteOpen(false);
      return;
    }
    if (id === "run:start") {
      setConsoleLines([]);
      const currentCode = editorRef.current?.getModel()?.getValue() ?? "";
      workerRef.current?.run(currentCode);
      setPaletteOpen(false);
      return;
    }
    if (id === "run:stop") {
      handleStop();
      setPaletteOpen(false);
      return;
    }
    if (id === "run:reset") {
      handleReset();
      setPaletteOpen(false);
      return;
    }
    if (!id.startsWith("theme:")) return;
    const themeId = id.slice(6);

    if (isBuiltin(themeId)) {
      setEditorTheme(themeId);
      applyThemeColors(themeId);
      themeBeforePalette.current = themeId;
      setPaletteOpen(false);
      return;
    }

    const monaco = monacoRef.current;
    if (!monaco) return;

    let data = null;
    if (!definedThemes.current.has(themeId)) {
      const entry = themeList.find((t) => t.id === themeId);
      if (!entry) return;
      data = await fetchThemeData(entry);
      if (!data) return;
      monaco.editor.defineTheme(themeId, data);
      definedThemes.current.add(themeId);
    }

    setEditorTheme(themeId);
    applyThemeColors(themeId, data);
    themeBeforePalette.current = themeId;
    setPaletteOpen(false);
  }, [themeList, applyThemeColors, currentFileName]);

  /** Apply theme live as the user navigates the palette */
  const handlePaletteHighlight = useCallback(async (id: string) => {
    if (!id.startsWith("theme:")) return;
    const themeId = id.slice(6);

    if (isBuiltin(themeId)) {
      setEditorTheme(themeId);
      applyThemeColors(themeId);
      return;
    }

    const monaco = monacoRef.current;
    if (!monaco) return;

    let data = null;
    if (!definedThemes.current.has(themeId)) {
      const entry = themeList.find((t) => t.id === themeId);
      if (!entry) return;
      data = await fetchThemeData(entry);
      if (!data) return;
      monaco.editor.defineTheme(themeId, data);
      definedThemes.current.add(themeId);
    }

    setEditorTheme(themeId);
    applyThemeColors(themeId, data);
  }, [themeList, applyThemeColors]);

  /** Restore previous theme when palette is cancelled */
  const handlePaletteCancel = useCallback(() => {
    setEditorTheme(themeBeforePalette.current);
    applyThemeColors(themeBeforePalette.current);
    setPaletteOpen(false);
  }, [applyThemeColors]);

  /* ---- Keyboard shortcut: Ctrl/Cmd+Shift+P ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setPaletteOpen((prev) => {
          if (!prev) {
            // Opening: remember current theme
            themeBeforePalette.current = editorTheme;
          } else {
            // Closing via shortcut: restore
            setEditorTheme(themeBeforePalette.current);
          }
          return !prev;
        });
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editorTheme]);

  // Auto-scroll console
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLines]);

  // Focus input when waiting for stdin
  useEffect(() => {
    if (status === "waiting_input") {
      inputRef.current?.focus();
    }
  }, [status]);

  // Refresh saved script list when menu opens
  useEffect(() => {
    if (showFileMenu) {
      setSavedNames(Object.keys(getSavedScripts()));
    }
  }, [showFileMenu]);

  // Close menu on outside click
  useEffect(() => {
    if (!showFileMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowFileMenu(false);
        setSaveDialogOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFileMenu]);

  /* ---- Drag resize helpers ---- */

  const startHDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const isTouch = "touches" in e;
    const startX = isTouch ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const startPct = editorWidthPct;
    const main = mainRef.current;
    if (!main) return;
    const totalW = main.getBoundingClientRect().width;

    const getX = (ev: MouseEvent | TouchEvent) =>
      "touches" in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const delta = getX(ev) - startX;
      const newPct = startPct + (delta / totalW) * 100;
      setEditorWidthPct(Math.min(Math.max(newPct, 20), 90));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
  }, [editorWidthPct]);

  const startVDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const isTouch = "touches" in e;
    const startY = isTouch ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const startPct = consolePct;
    const container = containerRef.current;
    if (!container) return;
    const totalH = container.getBoundingClientRect().height;

    const getY = (ev: MouseEvent | TouchEvent) =>
      "touches" in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const delta = startY - getY(ev); // up = bigger console
      const newPct = startPct + (delta / totalH) * 100;
      setConsolePct(Math.min(Math.max(newPct, 10), 70));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
  }, [consolePct]);

  const handleWorkerMsg = useCallback((msg: MsgFromWorker) => {
    switch (msg.type) {
      case "READY":
        setReady(true);
        setStatus("idle");
        break;
      case "STDOUT":
        setConsoleLines((prev) => [...prev, { text: msg.text }]);
        break;
      case "STATUS":
        setStatus(msg.state);
        break;
      case "STDIN_REQUEST":
        // Status is set via STATUS message from worker
        break;
      case "CONSOLE_CLEAR":
        setConsoleLines([]);
        break;
      case "ERROR":
        setConsoleLines((prev) => [
          ...prev,
          { text: `Error: ${msg.message}`, isError: true },
        ]);
        break;
    }
  }, []);

  // Initialize worker
  useEffect(() => {
    const client = new LuaWorkerClient(handleWorkerMsg);
    workerRef.current = client;
    client.init();
    return () => {
      client.terminate();
    };
  }, [handleWorkerMsg]);

  /* ---- Actions ---- */

  const handleRun = () => {
    setConsoleLines([]);
    workerRef.current?.run(code);
  };

  const handleStop = () => {
    workerRef.current?.stop();
  };

  const handleReset = () => {
    workerRef.current?.reset();
    setInputValue("");
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "waiting_input") return;
    workerRef.current?.submitStdin(inputValue);
    setConsoleLines((prev) => [
      ...prev,
      { text: `> ${inputValue}\n` },
    ]);
    setInputValue("");
  };

  /* ---- File actions ---- */

  const handleSave = () => {
    const trimmed = saveName.trim();
    if (!trimmed) return;
    saveScript(trimmed, code);
    setCurrentFileName(trimmed);
    setSavedNames(Object.keys(getSavedScripts()));
    setSaveDialogOpen(false);
    setSaveName("");
    setShowFileMenu(false);
  };

  const handleLoad = (name: string) => {
    const scripts = getSavedScripts();
    if (scripts[name]) {
      setCode(scripts[name]);
      setCurrentFileName(name);
    }
    setShowFileMenu(false);
  };

  const handleDelete = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    deleteScript(name);
    setSavedNames(Object.keys(getSavedScripts()));
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/x-lua" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = currentFileName || "script";
    a.download = baseName.endsWith(".lua") ? baseName : `${baseName}.lua`;
    a.click();
    URL.revokeObjectURL(url);
    setShowFileMenu(false);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
    setShowFileMenu(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCode(reader.result);
        setCurrentFileName(file.name.replace(/\.lua$/, ""));
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be loaded again
    e.target.value = "";
  };

  const handleLoadExample = async (file: string) => {
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setCode(text);
    } catch (err) {
      console.error("Failed to load example:", err);
    }
    setShowFileMenu(false);
  };

  const isRunning = status === "running" || status === "waiting_input";

  return (
    <div className="flex flex-col h-dvh font-mono transition-colors duration-200" style={{ backgroundColor: ui.bg, color: ui.fg }}>
      {/* ---- Header / Toolbar ---- */}
      <header className="flex items-center gap-3 px-4 py-2 shrink-0 transition-colors duration-200" style={{ backgroundColor: ui.surface, borderBottom: `1px solid ${ui.border}` }}>
        <h1 className="text-lg font-bold mr-4 select-none">
          <span
            className="cursor-pointer hover:opacity-75 transition-opacity"
            onClick={() => { themeBeforePalette.current = editorTheme; setPaletteOpen(true); }}
            title="Command Palette (Ctrl+Shift+P)"
          >🌙</span>{" "}Lua Playground
        </h1>

        {/* ---- File menu ---- */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => { setShowFileMenu((v) => !v); setSaveDialogOpen(false); }}
            className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-sm font-semibold transition-colors"
          >
            📁 File
          </button>

          {showFileMenu && (
            <div className="absolute left-0 top-full mt-1 w-72 rounded shadow-xl z-50 text-sm" style={{ backgroundColor: ui.surface2, border: `1px solid ${ui.border}` }}>
              {/* New */}
              <button
                onClick={() => { setCode(""); setCurrentFileName(""); setShowFileMenu(false); }}
                className="w-full text-left px-3 py-2 hover:bg-neutral-700 transition-colors"
              >
                📝 Neu
              </button>

              {/* Save */}
              {!saveDialogOpen ? (
                <button
                  onClick={() => setSaveDialogOpen(true)}
                  className="w-full text-left px-3 py-2 hover:bg-neutral-700 transition-colors"
                >
                  💾 Speichern…
                </button>
              ) : (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSave(); }}
                  className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700"
                >
                  <input
                    autoFocus
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="Name eingeben…"
                    className="flex-1 bg-neutral-800 rounded px-2 py-1 text-sm outline-none text-neutral-200 placeholder:text-neutral-500"
                  />
                  <button
                    type="submit"
                    disabled={!saveName.trim()}
                    className="px-2 py-1 rounded bg-green-700 hover:bg-green-600 disabled:opacity-40 text-xs font-semibold"
                  >
                    OK
                  </button>
                </form>
              )}

              {/* Download */}
              <button
                onClick={handleDownload}
                className="w-full text-left px-3 py-2 hover:bg-neutral-700 transition-colors"
              >
                ⬇ Download .lua
              </button>

              {/* Upload */}
              <button
                onClick={handleUploadClick}
                className="w-full text-left px-3 py-2 hover:bg-neutral-700 transition-colors border-b border-neutral-700"
              >
                ⬆ Datei öffnen…
              </button>

              {/* Saved scripts */}
              {savedNames.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-neutral-500 text-xs font-semibold uppercase tracking-wide">
                    Gespeicherte Skripte
                  </div>
                  {savedNames.map((name) => (
                    <div
                      key={name}
                      onClick={() => handleLoad(name)}
                      className="flex items-center justify-between px-3 py-1.5 hover:bg-neutral-700 cursor-pointer transition-colors"
                    >
                      <span className="truncate">{name}</span>
                      <button
                        onClick={(e) => handleDelete(name, e)}
                        className="ml-2 text-red-400 hover:text-red-300 text-xs shrink-0"
                        title="Löschen"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* Examples */}
              {EXAMPLES.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-neutral-500 text-xs font-semibold uppercase tracking-wide border-t border-neutral-700">
                    Beispiele
                  </div>
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex.file}
                      onClick={() => handleLoadExample(ex.file)}
                      className="w-full text-left px-3 py-1.5 hover:bg-neutral-700 transition-colors"
                    >
                      📄 {ex.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Hidden file input for upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".lua,.txt"
          className="hidden"
          onChange={handleFileChange}
        />

        <button
          onClick={handleRun}
          disabled={!ready || isRunning}
          className="px-3 py-1 rounded bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
        >
          ▶ Run
        </button>
        <button
          onClick={handleStop}
          disabled={!isRunning}
          className="px-3 py-1 rounded bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
        >
          ⏹ Stop
        </button>
        <button
          onClick={handleReset}
          disabled={!ready}
          className="px-3 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
          style={{ backgroundColor: ui.btnNeutral, color: ui.btnNeutralText }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = ui.btnNeutralHover}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ui.btnNeutral}
        >
          ↻ Reset
        </button>

        <span
          className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${status !== "idle" ? STATUS_COLORS[status] : ""}`}
          style={{
            color: ui.btnNeutralText,
            ...(status === "idle" ? { backgroundColor: ui.btnNeutral } : {}),
          }}
        >
          {STATUS_LABELS[status]}
        </span>

      </header>

      {/* ---- Content area (main + console, split vertically) ---- */}
      <div ref={containerRef} className="flex flex-col flex-1 min-h-0">

        {/* ---- Main: Editor + World placeholder (split horizontally) ---- */}
        <main ref={mainRef} className="flex min-h-0" style={{ flex: `${100 - consolePct} 0 0%` }}>
          {/* Editor panel */}
          <div className="min-w-0 overflow-hidden flex flex-col" style={{ width: showWorld ? `${editorWidthPct}%` : "100%" }}>
            <div className="flex-1 min-h-0">
              <MonacoEditor
                language="lua"
                theme={editorTheme}
                value={code}
                onChange={(v) => setCode(v ?? "")}
                onMount={handleEditorMount}
                options={{
                  fontSize: 20,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  automaticLayout: true,
                  tabSize: 2,
                  cursorStyle: "block",
                  mouseWheelZoom: true,
                }}
              />
            </div>
            {/* Vim statusbar */}
            {vimEnabled && (
              <div
                ref={vimStatusRef}
                className="px-3 py-0.5 text-xs font-mono select-none shrink-0"
                style={{
                  backgroundColor: ui.surface,
                  color: ui.fg,
                  borderTop: `1px solid ${ui.border}`,
                }}
              />
            )}
          </div>

          {/* Vertical drag handle + World panel (toggle via Cmd+Shift+P) */}
          {showWorld && (
            <>
              <div
                onMouseDown={startHDrag}
                onTouchStart={startHDrag}
                className="w-3 cursor-col-resize hover:bg-blue-500 active:bg-blue-500 transition-colors shrink-0 touch-none"
                style={{ backgroundColor: ui.handle }}
              />

              <div className="flex-1 min-w-0 flex flex-col items-center justify-center select-none" style={{ backgroundColor: ui.surface2, color: ui.muted }}>
                <div className="text-4xl mb-2">🌍</div>
                <div className="text-sm">Isometric World</div>
                <div className="text-xs mt-1">(Phase 2)</div>
              </div>
            </>
          )}
        </main>

        {/* Horizontal drag handle */}
        <div
          onMouseDown={startVDrag}
          onTouchStart={startVDrag}
          className="h-3 cursor-row-resize hover:bg-blue-500 active:bg-blue-500 transition-colors shrink-0 touch-none"
          style={{ backgroundColor: ui.handle }}
        />

        {/* ---- Console ---- */}
        <div className="flex flex-col min-h-0 transition-colors duration-200" style={{ flex: `${consolePct} 0 0%`, backgroundColor: ui.bg }}>
          <div className="px-3 py-1 text-xs select-none transition-colors duration-200" style={{ backgroundColor: ui.surface, color: ui.muted, borderBottom: `1px solid ${ui.border}` }}>
            Console
          </div>
          <pre className="flex-1 overflow-y-auto px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
            {consoleLines.map((line, i) => (
              <span
                key={i}
                style={{ color: line.isError ? ui.consoleError : ui.consoleText }}
              >
                {line.text}
              </span>
            ))}
            <div ref={consoleEndRef} />
          </pre>

          {/* Input line */}
          <form
            onSubmit={handleInputSubmit}
            className="flex items-center gap-2 px-3 py-1.5 transition-colors duration-200"
            style={{ backgroundColor: ui.surface, borderTop: `1px solid ${ui.border}` }}
          >
            <span className="text-green-500 text-sm select-none">&gt;</span>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={status !== "waiting_input"}
              placeholder={
                status === "waiting_input"
                  ? "Type input and press Enter…"
                  : "Input disabled"
              }
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ color: ui.fg }}
            />
          </form>
        </div>

      </div>

      {/* ---- Command Palette ---- */}
      <CommandPalette
        open={paletteOpen}
        onClose={handlePaletteCancel}
        items={paletteItems}
        onSelect={handlePaletteSelect}
        onHighlight={handlePaletteHighlight}
        placeholder="Search commands…"
        colors={{
          bg: ui.surface2,
          fg: ui.fg,
          border: ui.border,
          muted: ui.muted,
          activeBg: "#2563eb",
          activeFg: "#ffffff",
        } satisfies PaletteColors}
      />
    </div>
  );
}
