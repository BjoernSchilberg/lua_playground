"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import basePath from "@/lib/basePath";
import { DEFAULT_CODE } from "@/lib/constants";
import { useLuaWorker } from "@/hooks/useLuaWorker";
import { useThemePalette } from "@/hooks/useThemePalette";
import { usePanelResize } from "@/hooks/usePanelResize";
import Toolbar from "@/components/Toolbar";
import EditorPanel from "@/components/EditorPanel";
import ConsolePanel from "@/components/ConsolePanel";
import CommandPalette, { type PaletteColors } from "@/components/CommandPalette";
import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

// Dynamically import IsometricWorld (fetches SVGs at runtime)
const IsometricWorld = dynamic(() => import("@/components/IsometricWorld"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-neutral-500">
      Loading world…
    </div>
  ),
});

export default function HomePage() {
  /* ---- Shared state ---- */
  const [code, setCode] = useState(DEFAULT_CODE);
  const [currentFileName, setCurrentFileName] = useState("");
  const [vimEnabled, setVimEnabled] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(true);

  /* ---- Refs ---- */
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const luaFmtRef = useRef<((code: string) => string) | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vimModeRef = useRef<any>(null);
  const vimStatusRef = useRef<HTMLDivElement | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ---- Hooks ---- */
  const worker = useLuaWorker(code, setCode, editorRef, luaFmtRef);
  const resize = usePanelResize();

  const toggleVim = useCallback(() => setVimEnabled((v) => !v), []);
  const toggleLineNumbers = useCallback(() => {
    setLineNumbers((v) => {
      const next = !v;
      editorRef.current?.updateOptions({ lineNumbers: next ? "on" : "off" });
      return next;
    });
  }, []);
  const toggleWorld = useCallback(() => worker.setShowWorld((v: boolean) => !v), [worker]);
  const uploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const theme = useThemePalette({
    vimEnabled,
    lineNumbers,
    showWorld: worker.showWorld,
    currentFileName,
    setCode,
    editorRef,
    luaFmtRef,
    onRun: worker.handleRun,
    onStop: worker.handleStop,
    onReset: worker.handleReset,
    onToggleVim: toggleVim,
    onToggleLineNumbers: toggleLineNumbers,
    onToggleWorld: toggleWorld,
    onUploadClick: uploadClick,
  });

  /* ---- Register Monaco instance when editor loads ---- */
  const handleEditorMount = useCallback((editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    theme.monacoRef.current = monaco;
    editorRef.current = editorInstance;
    editorInstance.focus();

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
      id: "lua-playground.run",
      label: "Run Lua Program",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        let currentCode = editorInstance.getModel()?.getValue() ?? "";
        if (luaFmtRef.current) {
          try {
            const formatted = luaFmtRef.current(currentCode);
            if (formatted !== currentCode) {
              const model = editorInstance.getModel();
              if (model) {
                model.pushEditOperations([], [{ range: model.getFullModelRange(), text: formatted }], () => null);
              }
              currentCode = formatted;
            }
          } catch { /* syntax error — run unformatted */ }
        }
        worker.setConsoleLines([]);
        worker.workerRef.current?.run(currentCode);
      },
    });

    editorInstance.addAction({
      id: "lua-playground.step",
      label: "Step (line by line)",
      keybindings: [monaco.KeyCode.F10],
      run: () => {},
    });

    editorInstance.addAction({
      id: "lua-playground.continue",
      label: "Continue execution",
      keybindings: [monaco.KeyCode.F5],
      run: () => {},
    });

    editorInstance.addAction({
      id: "lua-playground.toggle-vim",
      label: "Toggle Vim Mode",
      run: () => setVimEnabled((v) => !v),
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Vim mode toggle ---- */
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;

    if (vimEnabled) {
      let disposed = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let instance: any = null;
      import("monaco-vim").then(({ initVimMode }) => {
        if (disposed) return;
        if (vimStatusRef.current && editorRef.current) {
          instance = initVimMode(editorRef.current, vimStatusRef.current);
          vimModeRef.current = instance;
          editorRef.current.focus();
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

  /* ---- Global keyboard shortcuts ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        theme.setPaletteOpen((prev: boolean) => {
          if (!prev) {
            theme.themeBeforePalette.current = theme.editorTheme;
          }
          return !prev;
        });
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        worker.setConsoleLines([]);
        const currentCode = editorRef.current?.getModel()?.getValue() ?? "";
        worker.workerRef.current?.run(currentCode);
      }
      if (e.key === "F10") {
        e.preventDefault();
        if (worker.statusRef.current === "paused") {
          worker.workerRef.current?.stepNext();
        } else {
          worker.setPausedLine(null);
          worker.setConsoleLines([]);
          const currentCode = editorRef.current?.getModel()?.getValue() ?? "";
          worker.workerRef.current?.step(currentCode);
        }
      }
      if (e.key === "F5") {
        e.preventDefault();
        if (worker.statusRef.current === "paused") {
          worker.setPausedLine(null);
          worker.workerRef.current?.continue_();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [theme, worker]);

  /* ---- Step debugger: highlight current line ---- */
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (worker.pausedLine !== null) {
      decorationsRef.current = ed.deltaDecorations(decorationsRef.current, [
        {
          range: {
            startLineNumber: worker.pausedLine,
            startColumn: 1,
            endLineNumber: worker.pausedLine,
            endColumn: 1,
          },
          options: {
            isWholeLine: true,
            className: "debug-line-highlight",
            glyphMarginClassName: "debug-line-glyph",
          },
        },
      ]);
      ed.revealLineInCenter(worker.pausedLine);
    } else {
      decorationsRef.current = ed.deltaDecorations(decorationsRef.current, []);
    }
  }, [worker.pausedLine]);

  /* ---- Derived ---- */
  const isRunning = worker.status === "running" || worker.status === "waiting_input";
  const isPaused = worker.status === "paused";
  const isBusy = isRunning || isPaused;
  const { ui } = theme;

  return (
    <div className="flex flex-col h-dvh font-mono transition-colors duration-200" style={{ backgroundColor: ui.bg, color: ui.fg }}>
      <Toolbar
        code={code}
        setCode={setCode}
        currentFileName={currentFileName}
        setCurrentFileName={setCurrentFileName}
        ready={worker.ready}
        isBusy={isBusy}
        isPaused={isPaused}
        status={worker.status}
        ui={ui}
        onRun={worker.handleRun}
        onStep={worker.handleStep}
        onContinue={worker.handleContinue}
        onStop={worker.handleStop}
        onReset={worker.handleReset}
        onPaletteOpen={theme.openPalette}
        fileInputRef={fileInputRef}
      />

      {/* ---- Content area: left (editor+console) | right (world) ---- */}
      <div ref={resize.containerRef} className="flex flex-1 min-h-0">

        {/* ---- Left column: Editor + Console ---- */}
        <div ref={resize.leftColRef} className="flex flex-col min-h-0 min-w-0" style={{ width: worker.showWorld ? `${resize.editorWidthPct}%` : "100%" }}>

          {/* Editor panel */}
          <div className="min-w-0 overflow-hidden flex flex-col min-h-0" style={{ flex: `${100 - resize.consolePct} 0 0%` }}>
            <EditorPanel
              code={code}
              setCode={setCode}
              editorTheme={theme.editorTheme}
              vimEnabled={vimEnabled}
              ui={ui}
              onMount={handleEditorMount}
              vimStatusRef={vimStatusRef}
            />
          </div>

          {/* Drag handle (editor↔console) */}
          <div
            onMouseDown={resize.startVDrag}
            onTouchStart={resize.startVDrag}
            className="h-3 cursor-row-resize hover:bg-blue-500 active:bg-blue-500 transition-colors shrink-0 touch-none"
            style={{ backgroundColor: ui.handle }}
          />

          {/* Console */}
          <div className="flex flex-col min-h-0 transition-colors duration-200" style={{ flex: `${resize.consolePct} 0 0%`, backgroundColor: ui.bg }}>
            <ConsolePanel
              consoleLines={worker.consoleLines}
              status={worker.status}
              inputValue={worker.inputValue}
              onInputChange={worker.setInputValue}
              onInputSubmit={worker.handleInputSubmit}
              ui={ui}
              consoleEndRef={worker.consoleEndRef}
              inputRef={worker.inputRef}
            />
          </div>
        </div>

        {/* Drag handle + World panel */}
        {worker.showWorld && (
          <>
            <div
              onMouseDown={resize.startHDrag}
              onTouchStart={resize.startHDrag}
              className="w-3 cursor-col-resize hover:bg-blue-500 active:bg-blue-500 transition-colors shrink-0 touch-none"
              style={{ backgroundColor: ui.handle }}
            />
            <IsometricWorld
              level={worker.worldLevel}
              hathiRow={worker.hathiPos.row}
              hathiCol={worker.hathiPos.col}
              hathiDir={worker.hathiPos.dir}
              bgColor={ui.surface2}
            />
          </>
        )}
      </div>

      {/* ---- Command Palette ---- */}
      <CommandPalette
        open={theme.paletteOpen}
        onClose={theme.handlePaletteCancel}
        items={theme.paletteItems}
        onSelect={theme.handlePaletteSelect}
        onHighlight={theme.handlePaletteHighlight}
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
