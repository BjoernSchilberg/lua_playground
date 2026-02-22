"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import basePath from "@/lib/basePath";
import { DEFAULT_CODE } from "@/lib/constants";
import { useLuaWorker } from "@/hooks/useLuaWorker";
import { useThemePalette } from "@/hooks/useThemePalette";
import { usePanelResize } from "@/hooks/usePanelResize";
import Toolbar from "@/components/Toolbar";
import EditorPanel from "@/components/EditorPanel";
import ConsolePanel from "@/components/ConsolePanel";
import CommandPalette, { type PaletteColors } from "@/components/CommandPalette";
import type { UiColors } from "@/lib/uiColors";
import type { Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

/* ------------------------------------------------------------------ */
/*  Context passed to the right-panel render prop                     */
/* ------------------------------------------------------------------ */

export interface PlaygroundContext {
  code: string;
  setCode: (v: string) => void;
  handleRun: () => void;
  setConsoleLines: (lines: { text: string; stream: "stdout" | "stderr" }[]) => void;
  ui: UiColors;
  showWorld: boolean;
  setShowWorld: (v: boolean | ((prev: boolean) => boolean)) => void;
  /** World data (for IsometricWorld rendering on the main page) */
  worldLevel: string[] | null;
  hathiPos: { row: number; col: number; dir: number };
  /** Load a level from parsed rows (e.g. ["HggF"]) into the world panel */
  loadLevel: (rows: string[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

export interface PlaygroundLayoutProps {
  /** Render the right panel. Return `null` to hide it entirely. */
  rightPanel: (ctx: PlaygroundContext) => ReactNode;
  /** Initial code to show in the editor (defaults to DEFAULT_CODE). */
  initialCode?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function PlaygroundLayout({
  rightPanel,
  initialCode,
}: PlaygroundLayoutProps) {
  /* ---- Shared state ---- */
  const [code, setCode] = useState(initialCode ?? DEFAULT_CODE);
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

  /* ---- External code setter: updates both React state AND editor model ---- */
  const setCodeExt = useCallback((v: string) => {
    setCode(v);
    const model = editorRef.current?.getModel();
    if (model && model.getValue() !== v) {
      model.setValue(v);
    }
  }, []);

  /* ---- Hooks ---- */
  const worker = useLuaWorker(code, setCodeExt, editorRef, luaFmtRef);
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
    setCode: setCodeExt,
    editorRef,
    luaFmtRef,
    onRun: worker.handleRun,
    onStep: worker.handleStep,
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

  /* ---- Context for right panel render prop ---- */
  const ctx: PlaygroundContext = {
    code,
    setCode: setCodeExt,
    handleRun: worker.handleRun,
    setConsoleLines: worker.setConsoleLines,
    ui,
    showWorld: worker.showWorld,
    setShowWorld: worker.setShowWorld,
    worldLevel: worker.worldLevel,
    hathiPos: worker.hathiPos,
    loadLevel: worker.loadLevel,
  };

  const rightContent = rightPanel(ctx);
  const showRight = rightContent !== null;

  return (
    <div ref={resize.containerRef} className="flex h-dvh font-mono transition-colors duration-200" style={{ backgroundColor: ui.bg, color: ui.fg }}>

      {/* ---- Left column: Toolbar + Editor + Console ---- */}
      <div className="flex flex-col min-h-0 min-w-0" style={{ width: showRight ? `${resize.editorWidthPct}%` : "100%" }}>
        <Toolbar
          code={code}
          setCode={setCodeExt}
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

        {/* Editor + Console area (for VDrag height measurement) */}
        <div ref={resize.leftColRef} className="flex flex-col min-h-0 flex-1">

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
              onContextMenu={theme.openPalette}
            />
          </div>

          {/* Drag handle (editor↔console) */}
          <div
            onMouseDown={resize.startVDrag}
            onTouchStart={resize.startVDrag}
            className="h-0.5 cursor-row-resize hover:!bg-blue-500 active:!bg-blue-500 transition-colors shrink-0 touch-none"
            style={{ backgroundColor: ui.handle }}
          />

          {/* Console */}
          <div className="flex flex-col min-h-0 transition-colors duration-200" style={{ flex: `${resize.consolePct} 0 0%`, backgroundColor: ui.bg }}>
            <ConsolePanel
              consoleLines={worker.consoleLines}
              status={worker.status}
              inputValue={worker.inputValue}
              onInputChange={worker.setInputValue}
              onInputSubmit={worker.replMode ? worker.handleReplSubmit : worker.handleInputSubmit}
              ui={ui}
              consoleEndRef={worker.consoleEndRef}
              inputRef={worker.inputRef}
              replMode={worker.replMode}
              onToggleRepl={worker.toggleReplMode}
              onReplKeyDown={worker.handleReplKeyDown}
              replBuffer={worker.replBufferRef.current}
            />
          </div>
        </div>
      </div>

      {/* ---- Right panel (drag handle + content) ---- */}
      {showRight && (
        <>
          <div
            onMouseDown={resize.startHDrag}
            onTouchStart={resize.startHDrag}
            className="w-0.5 cursor-col-resize hover:!bg-blue-500 active:!bg-blue-500 transition-colors shrink-0 touch-none"
            style={{ backgroundColor: ui.handle }}
          />
          {rightContent}
        </>
      )}

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
