import { useState, useRef, useCallback, useEffect } from "react";
import { LuaWorkerClient } from "@/lib/workerClient";
import type { MsgFromWorker, WorkerState } from "@/lib/protocol";
import type { editor } from "monaco-editor";

export function useLuaWorker(
  code: string,
  setCode: (v: string) => void,
  editorRef: React.RefObject<editor.IStandaloneCodeEditor | null>,
  luaFmtRef: React.RefObject<((code: string) => string) | null>,
) {
  const [consoleLines, setConsoleLines] = useState<
    { text: string; isError?: boolean }[]
  >([]);
  const [status, setStatus] = useState<WorkerState>("idle");
  const statusRef = useRef<WorkerState>("idle");
  const setStatusAndRef = useCallback((s: WorkerState) => {
    statusRef.current = s;
    setStatus(s);
  }, []);
  const [inputValue, setInputValue] = useState("");
  const [ready, setReady] = useState(false);

  /* ---- World panel state ---- */
  const [showWorld, setShowWorld] = useState(false);
  const [worldLevel, setWorldLevel] = useState<string[] | null>(null);
  const [hathiPos, setHathiPos] = useState({ row: 0, col: 0, dir: 1 });

  /* ---- Step debugger state ---- */
  const [pausedLine, setPausedLine] = useState<number | null>(null);

  const workerRef = useRef<LuaWorkerClient | null>(null);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* ---- Worker message handler ---- */
  const handleWorkerMsg = useCallback((msg: MsgFromWorker) => {
    switch (msg.type) {
      case "READY":
        setReady(true);
        setStatusAndRef("idle");
        break;
      case "STDOUT":
        setConsoleLines((prev) => [...prev, { text: msg.text }]);
        break;
      case "STATUS":
        setStatusAndRef(msg.state);
        break;
      case "STDIN_REQUEST":
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
      case "SHOW_WORLD":
        setShowWorld(true);
        break;
      case "WORLD_INIT":
        setWorldLevel(msg.level);
        setHathiPos({ row: msg.hathiRow, col: msg.hathiCol, dir: msg.hathiDir });
        break;
      case "WORLD_PATCH":
        for (const p of msg.patches) {
          if (p.kind === "hathi") {
            setHathiPos({ row: p.row, col: p.col, dir: p.dir });
          } else if (p.kind === "tile") {
            setWorldLevel((prev) => {
              if (!prev) return prev;
              const next = [...prev];
              const row = next[p.row];
              if (row !== undefined) {
                next[p.row] = row.substring(0, p.col) + p.tile + row.substring(p.col + 1);
              }
              return next;
            });
          }
        }
        break;
      case "LINE_PAUSED":
        setPausedLine(msg.line);
        break;
    }
  }, [setStatusAndRef]);

  /* ---- Initialize worker ---- */
  useEffect(() => {
    const client = new LuaWorkerClient(handleWorkerMsg);
    workerRef.current = client;
    client.init();
    return () => {
      client.terminate();
    };
  }, [handleWorkerMsg]);

  /* ---- Auto-scroll console ---- */
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [consoleLines]);

  /* ---- Focus input when waiting for stdin ---- */
  useEffect(() => {
    if (status === "waiting_input") {
      inputRef.current?.focus();
    }
  }, [status]);

  /* ---- Actions ---- */

  const formatEditorCode = (): string => {
    const fmt = luaFmtRef.current;
    if (fmt) {
      try {
        const formatted = fmt(code);
        if (formatted !== code) {
          const model = editorRef.current?.getModel();
          if (model) {
            model.pushEditOperations(
              [],
              [{ range: model.getFullModelRange(), text: formatted }],
              () => null,
            );
          }
          setCode(formatted);
          return formatted;
        }
      } catch {
        /* syntax error — run unformatted */
      }
    }
    return code;
  };

  const handleRun = () => {
    const source = formatEditorCode();
    setPausedLine(null);
    setConsoleLines([]);
    workerRef.current?.run(source);
  };

  const handleStep = () => {
    if (status === "paused") {
      workerRef.current?.stepNext();
    } else {
      const source = formatEditorCode();
      setPausedLine(null);
      setConsoleLines([]);
      workerRef.current?.step(source);
    }
  };

  const handleContinue = () => {
    setPausedLine(null);
    workerRef.current?.continue_();
  };

  const handleStop = () => {
    setPausedLine(null);
    workerRef.current?.stop();
  };

  const handleReset = () => {
    setPausedLine(null);
    workerRef.current?.reset();
    setInputValue("");
    setWorldLevel(null);
    setShowWorld(false);
    setHathiPos({ row: 0, col: 0, dir: 1 });
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

  return {
    // State
    consoleLines,
    setConsoleLines,
    status,
    statusRef,
    inputValue,
    setInputValue,
    ready,
    showWorld,
    setShowWorld,
    worldLevel,
    hathiPos,
    pausedLine,
    setPausedLine,
    // Refs
    workerRef,
    consoleEndRef,
    inputRef,
    // Actions
    handleRun,
    handleStep,
    handleContinue,
    handleStop,
    handleReset,
    handleInputSubmit,
  };
}
