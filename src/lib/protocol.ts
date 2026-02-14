/* Message protocol between the main thread and the Lua Web Worker. */

export type WorkerState =
  | "idle"
  | "running"
  | "waiting_input"
  | "stopped"
  | "error";

/* Messages sent TO the worker */
export type MsgToWorker =
  | { type: "INIT" }
  | { type: "RUN"; code: string }
  | { type: "STOP" }
  | { type: "RESET" }
  | { type: "STDIN_SUBMIT"; value: string };

/* Messages sent FROM the worker */
export type MsgFromWorker =
  | { type: "READY" }
  | { type: "STDOUT"; text: string }
  | { type: "STATUS"; state: WorkerState }
  | { type: "CONSOLE_CLEAR" }
  | { type: "STDIN_REQUEST" }
  | { type: "ERROR"; message: string; stack?: string };
