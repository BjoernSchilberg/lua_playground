import { useState, useRef, useCallback, useEffect } from "react";
import { LuaWorkerClient } from "@/lib/workerClient";
import type { MsgFromWorker, WorkerState } from "@/lib/protocol";
import type { editor } from "monaco-editor";
import { useSpeech } from "@/hooks/useSpeech";

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
  const [hathiSpeech, setHathiSpeech] = useState<string | null>(null);
  const [hathiSpeechAudio, setHathiSpeechAudio] = useState(false);
  const speech = useSpeech();
  const speechRef = useRef(speech);
  speechRef.current = speech;
  /** Raw level rows (with 'H') so we can re-send them to the worker on each RUN/STEP */
  const levelRowsRef = useRef<string[] | null>(null);

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
        if (msg.state === "idle") setPausedLine(null);
        break;
      case "STDIN_REQUEST":
        break;
      case "CONSOLE_CLEAR":
        setConsoleLines([]);
        break;
      case "ERROR":
        setConsoleLines((prev) => [
          ...prev,
          { text: `Error: ${msg.message}\n`, isError: true },
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
          } else if (p.kind === "speak") {
            setHathiSpeech(p.text);
            if (p.audio) {
              setHathiSpeechAudio(true);
              speechRef.current.speak({
                text: p.text,
                onEnd: () => { setHathiSpeech(null); setHathiSpeechAudio(false); },
                onError: () => { setHathiSpeech(null); setHathiSpeechAudio(false); },
              });
            } else {
              setHathiSpeechAudio(false);
            }
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
      case "FILE_SAVE": {
        const ext = msg.name.split(".").pop()?.toLowerCase() ?? "";
        const mimeMap: Record<string, string> = {
          ppm: "image/x-portable-pixmap",
          pgm: "image/x-portable-graymap",
          pbm: "image/x-portable-bitmap",
          svg: "image/svg+xml",
          txt: "text/plain",
          csv: "text/csv",
          json: "application/json",
          html: "text/html",
          lua: "text/x-lua",
        };
        const mime = mimeMap[ext] ?? "application/octet-stream";
        const blob = new Blob([msg.content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = msg.name;
        a.click();
        URL.revokeObjectURL(url);
        break;
      }
      case "REPL_RESULT":
        if (msg.value !== null) {
          setConsoleLines((prev) => [...prev, { text: msg.value + "\n" }]);
        }
        // Save completed expression to history (only for normal REPL, not debug eval)
        if (replBufferRef.current.trim()) {
          replHistoryRef.current.push(replBufferRef.current);
        }
        replBufferRef.current = "";
        // Don't set idle when debug eval — STATUS: paused follows
        if (statusRef.current !== "paused") {
          setStatusAndRef("idle");
        }
        requestAnimationFrame(() => inputRef.current?.focus());
        break;
      case "REPL_INCOMPLETE":
        // Multi-line: append newline so next line is concatenated
        replBufferRef.current += "\n";
        setStatusAndRef("idle");
        requestAnimationFrame(() => inputRef.current?.focus());
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
    const model = editorRef.current?.getModel();
    const currentCode = model?.getValue() ?? "";
    const fmt = luaFmtRef.current;
    if (fmt) {
      try {
        const formatted = fmt(currentCode);
        if (formatted !== currentCode) {
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
    return currentCode;
  };

  const handleRun = () => {
    const source = formatEditorCode();
    setPausedLine(null);
    setConsoleLines([]);
    setHathiSpeech(null);
    setHathiSpeechAudio(false);
    if (levelRowsRef.current) {
      loadLevel(levelRowsRef.current);
      requestAnimationFrame(() => {
        workerRef.current?.run(source, levelRowsRef.current ?? undefined);
      });
    } else {
      workerRef.current?.run(source);
    }
  };

  const handleStep = () => {
    if (status === "paused") {
      workerRef.current?.stepNext();
    } else {
      const source = formatEditorCode();
      setPausedLine(null);
      setConsoleLines([]);
      setHathiSpeech(null);
      setHathiSpeechAudio(false);
      if (levelRowsRef.current) {
        loadLevel(levelRowsRef.current);
        requestAnimationFrame(() => {
          workerRef.current?.step(source, levelRowsRef.current ?? undefined);
        });
      } else {
        workerRef.current?.step(source);
      }
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
    levelRowsRef.current = null;
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
        // Focus the input after entering REPL mode
        requestAnimationFrame(() => inputRef.current?.focus());
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

    /* Debug eval: evaluate in the paused coroutine's scope */
    if (statusRef.current === "paused") {
      const line = inputValue.trim();
      if (!line) return;
      setConsoleLines((prev) => [...prev, { text: `dbg> ${line}\n` }]);
      replHistoryRef.current.push(line);
      replHistoryIdxRef.current = -1;
      setInputValue("");
      workerRef.current?.debugEval(line);
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
    workerRef.current?.replEval(fullCode, levelRowsRef.current ?? undefined);
  }, [replMode, inputValue]);

  const handleReplKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const hist = replHistoryRef.current;
    const input = e.currentTarget;
    const val = input.value;
    const pos = input.selectionStart ?? 0;

    /* ---- Helper: find word boundary positions ---- */
    const wordBoundaryRight = (from: number): number => {
      let i = from;
      // skip non-word chars
      while (i < val.length && /\W/.test(val[i])) i++;
      // skip word chars
      while (i < val.length && /\w/.test(val[i])) i++;
      return i;
    };
    const wordBoundaryLeft = (from: number): number => {
      let i = from;
      // skip non-word chars backwards
      while (i > 0 && /\W/.test(val[i - 1])) i--;
      // skip word chars backwards
      while (i > 0 && /\w/.test(val[i - 1])) i--;
      return i;
    };

    /* ---- Ctrl+ shortcuts ---- */
    if (e.ctrlKey && !e.altKey) {
      switch (e.key) {
        /* Ctrl+L — clear console */
        case "l": {
          e.preventDefault();
          e.stopPropagation();
          setConsoleLines([]);
          return;
        }

        /* Ctrl+D — exit REPL (when input is empty) */
        case "d": {
          e.preventDefault();
          e.stopPropagation();
          if (!inputValue) {
            toggleReplMode();
          }
          return;
        }

        /* Ctrl+A — cursor to start of line */
        case "a": {
          e.preventDefault();
          e.stopPropagation();
          input.setSelectionRange(0, 0);
          return;
        }

        /* Ctrl+E — cursor to end of line */
        case "e": {
          e.preventDefault();
          e.stopPropagation();
          input.setSelectionRange(val.length, val.length);
          return;
        }

        /* Ctrl+F — cursor forward one char */
        case "f": {
          e.preventDefault();
          e.stopPropagation();
          const next = Math.min(pos + 1, val.length);
          input.setSelectionRange(next, next);
          return;
        }

        /* Ctrl+B — cursor backward one char */
        case "b": {
          e.preventDefault();
          e.stopPropagation();
          const prev = Math.max(pos - 1, 0);
          input.setSelectionRange(prev, prev);
          return;
        }

        /* Ctrl+K — kill to end of line */
        case "k": {
          e.preventDefault();
          e.stopPropagation();
          setInputValue(val.substring(0, pos));
          return;
        }

        /* Ctrl+U — kill to start of line */
        case "u": {
          e.preventDefault();
          e.stopPropagation();
          const rest = val.substring(pos);
          setInputValue(rest);
          requestAnimationFrame(() => input.setSelectionRange(0, 0));
          return;
        }

        /* Ctrl+W — backward kill word */
        case "w": {
          e.preventDefault();
          e.stopPropagation();
          const boundary = wordBoundaryLeft(pos);
          const newVal = val.substring(0, boundary) + val.substring(pos);
          setInputValue(newVal);
          requestAnimationFrame(() => input.setSelectionRange(boundary, boundary));
          return;
        }

        /* Ctrl+P — history back */
        case "p": {
          e.preventDefault();
          e.stopPropagation();
          if (hist.length === 0) return;
          const idx = replHistoryIdxRef.current;
          const next = idx === -1 ? hist.length - 1 : Math.max(0, idx - 1);
          replHistoryIdxRef.current = next;
          setInputValue(hist[next]);
          return;
        }

        /* Ctrl+N — history forward */
        case "n": {
          e.preventDefault();
          e.stopPropagation();
          if (hist.length === 0) return;
          const idxN = replHistoryIdxRef.current;
          if (idxN === -1) return;
          const nextN = idxN + 1;
          if (nextN >= hist.length) {
            replHistoryIdxRef.current = -1;
            setInputValue("");
          } else {
            replHistoryIdxRef.current = nextN;
            setInputValue(hist[nextN]);
          }
          return;
        }

        default:
          break;
      }
    }

    /* ---- Alt+ shortcuts (word navigation & deletion) ---- */
    if (e.altKey && !e.ctrlKey) {
      switch (e.key) {
        /* Alt+F — forward one word */
        case "f": {
          e.preventDefault();
          e.stopPropagation();
          const target = wordBoundaryRight(pos);
          input.setSelectionRange(target, target);
          return;
        }

        /* Alt+B — backward one word */
        case "b": {
          e.preventDefault();
          e.stopPropagation();
          const target = wordBoundaryLeft(pos);
          input.setSelectionRange(target, target);
          return;
        }

        /* Alt+D — kill word forward */
        case "d": {
          e.preventDefault();
          e.stopPropagation();
          const boundary = wordBoundaryRight(pos);
          const newVal = val.substring(0, pos) + val.substring(boundary);
          setInputValue(newVal);
          requestAnimationFrame(() => input.setSelectionRange(pos, pos));
          return;
        }

        /* Alt+Backspace — kill word backward */
        case "Backspace": {
          e.preventDefault();
          e.stopPropagation();
          const boundary = wordBoundaryLeft(pos);
          const newVal = val.substring(0, boundary) + val.substring(pos);
          setInputValue(newVal);
          requestAnimationFrame(() => input.setSelectionRange(boundary, boundary));
          return;
        }

        default:
          break;
      }
    }

    /* ArrowUp — history back */
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hist.length === 0) return;
      const idx = replHistoryIdxRef.current;
      const next = idx === -1 ? hist.length - 1 : Math.max(0, idx - 1);
      replHistoryIdxRef.current = next;
      setInputValue(hist[next]);
      return;
    }

    /* ArrowDown — history forward */
    if (e.key === "ArrowDown") {
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
      return;
    }
  }, [inputValue, toggleReplMode]);

  /** Parse level rows (e.g. ["HggF", "gggg"]) and set world state directly */
  const loadLevel = useCallback((rows: string[]) => {
    let startR = 0, startC = 0;
    const parsed = rows.map((row, r) => {
      let out = "";
      for (let c = 0; c < row.length; c++) {
        if (row[c] === "H") {
          startR = r;
          startC = c;
          out += "g";
        } else {
          out += row[c];
        }
      }
      return out;
    });
    levelRowsRef.current = rows;
    setWorldLevel(parsed);
    setHathiPos({ row: startR, col: startC, dir: 1 });
    setShowWorld(true);
  }, []);

  /* ---- Speed control ---- */
  const [speed, setSpeedState] = useState(1);
  const setSpeed = useCallback((factor: number) => {
    setSpeedState(factor);
    workerRef.current?.setSpeed(factor);
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
    hathiSpeech,
    setHathiSpeech,
    hathiSpeechAudio,
    pausedLine,
    setPausedLine,
    speed,
    setSpeed,
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
    loadLevel,
  };
}
