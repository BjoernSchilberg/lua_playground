import type { WorkerState } from "./protocol";
import basePath from "./basePath";

export const DEFAULT_CODE = `print("Lua WASM ready ✅")
print("Wie heißt du? ")
name = io.read()
print("Hallo " .. name)
-- Probiere es aus: Schreibe Lua-Code hier und klicke "Run"!
`;

export const STORAGE_KEY = "lua_playground_scripts";

export const EXAMPLES: { name: string; file: string }[] = [
  { name: "Hathi Demo 🐘", file: `${basePath}/examples/hathi_demo.lua` },
  { name: "Hathi Demo Simple 🐘", file: `${basePath}/examples/hathi_demo_simple.lua` },
  { name: "Conway's Game of Life", file: `${basePath}/examples/conway.lua` },
  { name: "Beispiel für Eingabe", file: `${basePath}/examples/input.lua` },
  { name: "Lua in 15 Minutes", file: `${basePath}/examples/LearnLuaIn15min.lua` },
  { name: "Caesar", file: `${basePath}/examples/caesar.lua` },
];

export const STATUS_LABELS: Record<WorkerState, string> = {
  idle: "Idle",
  running: "Running…",
  waiting_input: "Waiting for input…",
  paused: "Paused",
  stopped: "Stopped",
  error: "Error",
};

export const STATUS_COLORS: Record<WorkerState, string> = {
  idle: "bg-neutral-600",
  running: "bg-green-600",
  waiting_input: "bg-yellow-600",
  paused: "bg-blue-600",
  stopped: "bg-red-600",
  error: "bg-red-700",
};
