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
}: ConsolePanelProps) {
  return (
    <>
      <div
        className="px-3 py-1 text-xs select-none transition-colors duration-200"
        style={{
          backgroundColor: ui.surface,
          color: ui.muted,
          borderBottom: `1px solid ${ui.border}`,
        }}
      >
        Console
      </div>
      <pre
        className="themed-scrollbar flex-1 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
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
        <span className="text-green-500 text-sm select-none">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
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
    </>
  );
}
