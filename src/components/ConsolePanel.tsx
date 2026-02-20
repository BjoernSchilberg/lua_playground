import type { UiColors } from "@/lib/uiColors";
import type { WorkerState } from "@/lib/protocol";
import React from "react";

interface ConsolePanelProps {
  consoleLines: { text: string; isError?: boolean }[];
  status: WorkerState;
  inputValue: string;
  onInputChange: (v: string) => void;
  onInputSubmit: (e: React.FormEvent) => void;
  ui: UiColors;
  consoleEndRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  /* REPL */
  replMode?: boolean;
  onToggleRepl?: () => void;
  onReplKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  replBuffer?: string;
}

export default function ConsolePanel({
  consoleLines,
  status,
  inputValue,
  onInputChange,
  onInputSubmit,
  ui,
  consoleEndRef,
  inputRef,
  replMode = false,
  onToggleRepl,
  onReplKeyDown,
  replBuffer = "",
}: ConsolePanelProps) {
  const isMultiLine = replBuffer.length > 0;
  const inputEnabled = replMode
    ? status === "idle" || status === "error" || status === "waiting_input"
    : status === "waiting_input";

  return (
    <>
      <div
        className="px-3 py-1 text-xs select-none transition-colors duration-200 flex items-center justify-between"
        style={{
          backgroundColor: ui.surface,
          color: ui.muted,
          borderBottom: `1px solid ${ui.border}`,
        }}
      >
        <span>{replMode ? "REPL" : "Console"}</span>
        {onToggleRepl && (
          <button
            onClick={onToggleRepl}
            className="px-2 py-0.5 rounded text-[10px] font-semibold transition-colors"
            style={{
              backgroundColor: replMode ? "#2563eb" : ui.surface2 ?? ui.border,
              color: replMode ? "#fff" : ui.muted,
            }}
          >
            {replMode ? "Exit REPL" : "REPL"}
          </button>
        )}
      </div>
      <pre
        className="themed-scrollbar flex-1 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap overflow-y-auto"
        style={{
          "--scrollbar-thumb": ui.handle,
          "--scrollbar-thumb-hover": ui.border,
        } as React.CSSProperties}
      >
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
        onSubmit={onInputSubmit}
        className="flex items-center gap-2 px-3 py-1.5 transition-colors duration-200"
        style={{ backgroundColor: ui.surface, borderTop: `1px solid ${ui.border}` }}
      >
        <span className="text-green-500 text-sm select-none">
          {replMode
            ? status === "waiting_input"
              ? "?"
              : isMultiLine
                ? ">>"
                : ">"
            : ">"}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={replMode ? onReplKeyDown : undefined}
          disabled={!inputEnabled}
          placeholder={
            replMode
              ? status === "waiting_input"
                ? "Waiting for input (io.read)…"
                : isMultiLine
                  ? "Continue input…"
                  : "Type Lua and press Enter…"
              : status === "waiting_input"
                ? "Type input and press Enter…"
                : "Input disabled"
          }
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ color: ui.fg }}
        />
      </form>
    </>
  );
}
