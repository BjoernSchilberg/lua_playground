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

  /* ---- REPL state ---- */
  const [replMode, setReplMode] = useState(false);
  const replBufferRef = useRef<string>("");  // multi-line accumulation
  const replHistoryRef = useRef<string[]>([]);
  const replHistoryIdxRef = useRef(-1);  // -1 = not browsing history

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
        // Clear REPL buffer on error (save to history if non-empty)
        if (replBufferRef.current.trim()) {
          replHistoryRef.current.push(replBufferRef.current);
        }
        replBufferRef.current = "";
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
      case "REPL_RESULT":
        if (msg.value !== null) {
          setConsoleLines((prev) => [...prev, { text: msg.value + "\n" }]);
        }
        // Save completed expression to history
        if (replBufferRef.current.trim()) {
          replHistoryRef.current.push(replBufferRef.current);
        }
        replBufferRef.current = "";
        setStatusAndRef("idle");
        break;
      case "REPL_INCOMPLETE":
        // Multi-line: append newline so next line is concatenated
        replBufferRef.current += "\n";
        setStatusAndRef("idle");
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

  /* ---- REPL actions ---- */

  const toggleReplMode = useCallback(() => {
    setReplMode((prev) => {
      if (!prev) {
        // Entering REPL mode
        replBufferRef.current = "";
        replHistoryRef.current = [];
        replHistoryIdxRef.current = -1;
        setConsoleLines([]);
        workerRef.current?.reset();
      } else {
        // Leaving REPL mode
        replBufferRef.current = "";
        replHistoryIdxRef.current = -1;
        workerRef.current?.reset();
      }
      return !prev;
    });
  }, []);

  const handleReplSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!replMode) return;

    /* If the Lua program called io.read(), forward as stdin */
    if (statusRef.current === "waiting_input") {
      workerRef.current?.submitStdin(inputValue);
      setConsoleLines((prev) => [...prev, { text: `? ${inputValue}\n` }]);
      setInputValue("");
      return;
    }

    const line = inputValue;
    const isMultiLine = replBufferRef.current.length > 0;
    const prompt = isMultiLine ? ">> " : "> ";
    setConsoleLines((prev) => [...prev, { text: `${prompt}${line}\n` }]);

    const fullCode = replBufferRef.current + line;

    // Keep fullCode in buffer until we know the result
    replBufferRef.current = fullCode;
    replHistoryIdxRef.current = -1;
    setInputValue("");
    workerRef.current?.replEval(fullCode);
  }, [replMode, inputValue]);

  const handleReplKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const hist = replHistoryRef.current;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hist.length === 0) return;
      const idx = replHistoryIdxRef.current;
      const next = idx === -1 ? hist.length - 1 : Math.max(0, idx - 1);
      replHistoryIdxRef.current = next;
      setInputValue(hist[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hist.length === 0) return;
      const idx = replHistoryIdxRef.current;
      if (idx === -1) return;
      const next = idx + 1;
      if (next >= hist.length) {
        replHistoryIdxRef.current = -1;
        setInputValue("");
      } else {
        replHistoryIdxRef.current = next;
        setInputValue(hist[next]);
      }
    }
  }, []);

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
    // REPL
    replMode,
    toggleReplMode,
    handleReplSubmit,
    handleReplKeyDown,
    replBufferRef,
  };
}
