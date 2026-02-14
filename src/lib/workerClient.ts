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

  run(code: string) {
    this.post({ type: "RUN", code });
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

  terminate() {
    this.worker.terminate();
  }
}
