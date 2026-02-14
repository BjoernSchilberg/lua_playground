"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { LuaWorkerClient } from "@/lib/workerClient";
import type { MsgFromWorker, WorkerState } from "@/lib/protocol";

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
io.write("Wie heißt du? ")
local n = io.read()
print("Hallo", n)

print("Endlosschleife – Stop klicken")
while true do end
`;

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

export default function HomePage() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [consoleLines, setConsoleLines] = useState<
    { text: string; isError?: boolean }[]
  >([]);
  const [status, setStatus] = useState<WorkerState>("idle");
  const [inputValue, setInputValue] = useState("");
  const [ready, setReady] = useState(false);

  const workerRef = useRef<LuaWorkerClient | null>(null);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
      { text: `> ${inputValue}` },
    ]);
    setInputValue("");
  };

  const isRunning = status === "running" || status === "waiting_input";

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-neutral-200 font-mono">
      {/* ---- Header / Toolbar ---- */}
      <header className="flex items-center gap-3 px-4 py-2 bg-[#161b22] border-b border-neutral-700 shrink-0">
        <h1 className="text-lg font-bold mr-4 select-none">🌙 Lua Playground</h1>

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
          className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
        >
          ↻ Reset
        </button>

        <span
          className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status]}`}
        >
          {STATUS_LABELS[status]}
        </span>
      </header>

      {/* ---- Main: Editor + World placeholder ---- */}
      <main className="flex flex-1 min-h-0">
        {/* Editor panel */}
        <div className="flex-1 min-w-0">
          <MonacoEditor
            language="lua"
            theme="vs-dark"
            value={code}
            onChange={(v) => setCode(v ?? "")}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        </div>

        {/* World placeholder (Phase 2) */}
        <div className="w-72 bg-[#1c2333] border-l border-neutral-700 flex flex-col items-center justify-center text-neutral-500 select-none shrink-0">
          <div className="text-4xl mb-2">🌍</div>
          <div className="text-sm">Isometric World</div>
          <div className="text-xs mt-1">(Phase 2)</div>
        </div>
      </main>

      {/* ---- Console ---- */}
      <div className="h-52 bg-[#0d1117] border-t border-neutral-700 flex flex-col shrink-0">
        <div className="px-3 py-1 text-xs text-neutral-500 bg-[#161b22] border-b border-neutral-800 select-none">
          Console
        </div>
        <pre className="flex-1 overflow-y-auto px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
          {consoleLines.map((line, i) => (
            <span
              key={i}
              className={line.isError ? "text-red-400" : "text-green-400"}
            >
              {line.text}
            </span>
          ))}
          <div ref={consoleEndRef} />
        </pre>

        {/* Input line */}
        <form
          onSubmit={handleInputSubmit}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] border-t border-neutral-800"
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
            className="flex-1 bg-transparent outline-none text-sm text-neutral-200 placeholder:text-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
          />
        </form>
      </div>
    </div>
  );
}