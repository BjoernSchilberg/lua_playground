import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { loadThemeList, fetchThemeData, isBuiltin, getThemeColors, type ThemeEntry } from "@/lib/monacoThemes";
import { deriveUiColors } from "@/lib/uiColors";
import type { PaletteItem } from "@/components/CommandPalette";
import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

interface UseThemePaletteOptions {
  vimEnabled: boolean;
  lineNumbers: boolean;
  showWorld: boolean;
  currentFileName: string;
  setCode: (v: string) => void;
  editorRef: React.RefObject<editor.IStandaloneCodeEditor | null>;
  luaFmtRef: React.RefObject<((code: string) => string) | null>;
  /* Callbacks from other hooks/page for palette dispatch */
  onRun: () => void;
  onStep: () => void;
  onStop: () => void;
  onReset: () => void;
  onToggleVim: () => void;
  onToggleLineNumbers: () => void;
  onToggleWorld: () => void;
  onUploadClick: () => void;
}

export function useThemePalette({
  vimEnabled,
  lineNumbers,
  showWorld,
  currentFileName,
  setCode,
  editorRef,
  luaFmtRef,
  onRun,
  onStep,
  onStop,
  onReset,
  onToggleVim,
  onToggleLineNumbers,
  onToggleWorld,
  onUploadClick,
}: UseThemePaletteOptions) {
  const [editorTheme, setEditorTheme] = useState("vs-dark");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [themeList, setThemeList] = useState<ThemeEntry[]>([]);
  const monacoRef = useRef<Monaco | null>(null);
  const definedThemes = useRef(new Set<string>());

  /* ---- Adaptive UI colours ---- */
  const [themeBg, setThemeBg] = useState("#1e1e1e");
  const [themeFg, setThemeFg] = useState("#d4d4d4");
  const ui = useMemo(() => deriveUiColors(themeBg, themeFg), [themeBg, themeFg]);

  const applyThemeColors = useCallback(
    (themeId: string, data?: Parameters<typeof getThemeColors>[1]) => {
      const { bg, fg } = getThemeColors(themeId, data);
      setThemeBg(bg);
      setThemeFg(fg);
    },
    []
  );

  /* ---- Load theme list on mount ---- */
  useEffect(() => {
    loadThemeList().then(setThemeList);
  }, []);

  /* ---- Command palette items ---- */
  const paletteItems: PaletteItem[] = useMemo(
    () => [
      { id: "run:start", label: "Run", category: "Lua", shortcut: "Ctrl+Enter" },
      { id: "run:step", label: "Step (Einzelschritt)", category: "Lua", shortcut: "F10" },
      { id: "run:stop", label: "Stop", category: "Lua" },
      { id: "run:reset", label: "Reset", category: "Lua" },
      { id: "clipboard:copy", label: "Copy", category: "Clipboard", shortcut: "Ctrl+C" },
      { id: "clipboard:cut", label: "Cut", category: "Clipboard", shortcut: "Ctrl+X" },
      { id: "clipboard:paste", label: "Paste", category: "Clipboard", shortcut: "Ctrl+V" },
      { id: "file:new", label: "Neu", category: "File" },
      { id: "file:save", label: "Speichern…", category: "File" },
      { id: "file:download", label: "Download .lua", category: "File" },
      { id: "file:open", label: "Datei öffnen…", category: "File" },
      { id: "format:document", label: "Format Document", category: "Editor" },
      { id: "vim:toggle", label: vimEnabled ? "Disable Vim Mode" : "Enable Vim Mode", category: "Editor" },
      { id: "font:zoomIn", label: "Font Zoom In", category: "Editor" },
      { id: "font:zoomOut", label: "Font Zoom Out", category: "Editor" },
      { id: "font:zoomReset", label: "Font Zoom Reset", category: "Editor" },
      { id: "editor:lineNumbers", label: lineNumbers ? "Hide Line Numbers" : "Show Line Numbers", category: "Editor" },
      { id: "editor:toggleWorld", label: showWorld ? "Hide Isometric World" : "Show Isometric World", category: "Editor" },
      ...themeList.map((t) => ({ id: `theme:${t.id}`, label: t.label, category: "Theme" })),
    ],
    [themeList, vimEnabled, lineNumbers, showWorld]
  );

  const themeBeforePalette = useRef("vs-dark");

  const openPalette = useCallback(() => {
    themeBeforePalette.current = editorTheme;
    setPaletteOpen(true);
  }, [editorTheme]);

  const handlePaletteSelect = useCallback(async (id: string) => {
    if (id === "file:new") {
      setCode("");
      setPaletteOpen(false);
      return;
    }
    if (id === "file:save") {
      setPaletteOpen(false);
      // The Toolbar handles save dialog — we just close palette
      // Dispatch custom event so Toolbar can react
      window.dispatchEvent(new CustomEvent("lua-playground:open-save"));
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
      onUploadClick();
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
      onToggleVim();
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
      onToggleLineNumbers();
      setPaletteOpen(false);
      return;
    }
    if (id === "editor:toggleWorld") {
      onToggleWorld();
      setPaletteOpen(false);
      return;
    }
    if (id === "run:start") {
      onRun();
      setPaletteOpen(false);
      return;
    }
    if (id === "run:step") {
      onStep();
      setPaletteOpen(false);
      return;
    }
    if (id === "run:stop") {
      onStop();
      setPaletteOpen(false);
      return;
    }
    if (id === "run:reset") {
      onReset();
      setPaletteOpen(false);
      return;
    }
    if (id === "clipboard:copy") {
      const ed = editorRef.current;
      if (ed) {
        const sel = ed.getSelection();
        if (sel) {
          const text = ed.getModel()?.getValueInRange(sel) ?? "";
          navigator.clipboard.writeText(text).catch(() => {});
        }
      }
      setPaletteOpen(false);
      return;
    }
    if (id === "clipboard:cut") {
      const ed = editorRef.current;
      if (ed) {
        const sel = ed.getSelection();
        if (sel) {
          const text = ed.getModel()?.getValueInRange(sel) ?? "";
          navigator.clipboard.writeText(text).catch(() => {});
          ed.executeEdits("clipboard-cut", [
            { range: sel, text: "", forceMoveMarkers: true },
          ]);
        }
      }
      setPaletteOpen(false);
      return;
    }
    if (id === "clipboard:paste") {
      const ed = editorRef.current;
      if (ed) {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            const sel = ed.getSelection();
            if (sel) {
              ed.executeEdits("clipboard-paste", [
                { range: sel, text, forceMoveMarkers: true },
              ]);
            }
          }
        } catch { /* clipboard permission denied */ }
      }
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
  }, [themeList, applyThemeColors, currentFileName, setCode, editorRef, luaFmtRef, onRun, onStep, onStop, onReset, onToggleVim, onToggleLineNumbers, onToggleWorld, onUploadClick]);

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

  const handlePaletteCancel = useCallback(() => {
    setEditorTheme(themeBeforePalette.current);
    applyThemeColors(themeBeforePalette.current);
    setPaletteOpen(false);
  }, [applyThemeColors]);

  return {
    editorTheme,
    ui,
    monacoRef,
    definedThemes,
    paletteOpen,
    setPaletteOpen,
    paletteItems,
    themeBeforePalette,
    openPalette,
    handlePaletteSelect,
    handlePaletteHighlight,
    handlePaletteCancel,
    applyThemeColors,
  };
}
