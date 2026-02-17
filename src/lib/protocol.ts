/* Message protocol between the main thread and the Lua Web Worker. */

export type WorkerState =
  | "idle"
  | "running"
  | "waiting_input"
  | "paused"
  | "stopped"
  | "error";

/* Messages sent TO the worker */
export type MsgToWorker =
  | { type: "INIT" }
  | { type: "RUN"; code: string }
  | { type: "STEP"; code: string }   // Start or step-next (code only needed on first call)
  | { type: "STEP_NEXT" }              // Advance one line while paused
  | { type: "CONTINUE" }               // Resume full-speed from paused state
  | { type: "STOP" }
  | { type: "RESET" }
  | { type: "STDIN_SUBMIT"; value: string };

/* ---- World / Hathi types ---- */

export type WorldPatch =
  | { kind: "hathi"; row: number; col: number; dir: number }
  | { kind: "tile"; row: number; col: number; tile: string };

/* Messages sent FROM the worker */
export type MsgFromWorker =
  | { type: "READY" }
  | { type: "STDOUT"; text: string }
  | { type: "STATUS"; state: WorkerState }
  | { type: "CONSOLE_CLEAR" }
  | { type: "STDIN_REQUEST" }
  | { type: "ERROR"; message: string; stack?: string }
  | { type: "SHOW_WORLD" }
  | { type: "WORLD_INIT"; level: string[]; hathiRow: number; hathiCol: number; hathiDir: number }
  | { type: "WORLD_PATCH"; patches: WorldPatch[] }
  | { type: "LINE_PAUSED"; line: number };
