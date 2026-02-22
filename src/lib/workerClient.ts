import type { MsgToWorker, MsgFromWorker } from "./protocol";

/**
 * Thin wrapper around the Lua Web Worker.
 * Keeps the `new URL(...)` inline in the `new Worker()` call
 * so Webpack 5 detects and emits the worker as a separate entry.
 */
export class LuaWorkerClient {
  private worker: Worker;

  constructor(onMsg: (msg: MsgFromWorker) => void) {
    this.worker = new Worker(
      new URL("../workers/luaWorker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (e: MessageEvent<MsgFromWorker>) => {
      onMsg(e.data);
    };
    this.worker.onerror = (e) => {
      console.error("[LuaWorkerClient] worker error", e);
    };
  }

  private post(msg: MsgToWorker) {
    this.worker.postMessage(msg);
  }

  init() {
    this.post({ type: "INIT" });
  }

  run(code: string, level?: string[]) {
    this.post({ type: "RUN", code, level });
  }

  /** Start execution in step mode (pauses at first user line) */
  step(code: string, level?: string[]) {
    this.post({ type: "STEP", code, level });
  }

  /** Advance one line while paused */
  stepNext() {
    this.post({ type: "STEP_NEXT" });
  }

  /** Resume full-speed execution from paused state */
  continue_() {
    this.post({ type: "CONTINUE" });
  }

  stop() {
    this.post({ type: "STOP" });
  }

  reset() {
    this.post({ type: "RESET" });
  }

  submitStdin(value: string) {
    this.post({ type: "STDIN_SUBMIT", value });
  }

  replEval(code: string) {
    this.post({ type: "REPL_EVAL", code });
  }

  terminate() {
    this.worker.terminate();
  }
}
