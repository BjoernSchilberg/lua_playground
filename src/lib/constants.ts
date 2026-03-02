import type { WorkerState } from "./protocol";
import basePath from "./basePath";

export const DEFAULT_CODE = `print("Lua WASM ready ✅")
print("Wie heißt du? ")
name = io.read()
print("Hallo " .. name)
-- Probiere es aus: Schreibe Lua-Code hier und klicke "Run"!
`;

export const STORAGE_KEY = "lua_playground_scripts";

export interface ExampleItem {
  name: string;
  file: string;
}

export interface ExampleGroup {
  label: string;
  items: ExampleItem[];
}

export const EXAMPLE_GROUPS: ExampleGroup[] = [
  {
    label: "Hathi 🐘",
    items: [
      { name: "Hathi Demo", file: `${basePath}/examples/hathi/hathi_demo.lua` },
      { name: "Hathi Demo (einfach)", file: `${basePath}/examples/hathi/hathi_demo_simple.lua` },
    ],
  },
  {
    label: "Grundlagen",
    items: [
      { name: "Eingabe (io.read)", file: `${basePath}/examples/grundlagen/input.lua` },
      { name: "Lua in 15 Minutes", file: `${basePath}/examples/grundlagen/LearnLuaIn15min.lua` },
      { name: "_G Inspector", file: `${basePath}/examples/grundlagen/inspect_G.lua` },
    ],
  },
  {
    label: "Algorithmen",
    items: [
      { name: "Caesar-Chiffre", file: `${basePath}/examples/algorithmen/caesar.lua` },
      { name: "Conway's Game of Life", file: `${basePath}/examples/algorithmen/conway.lua` },
      { name: "Ellipse", file: `${basePath}/examples/algorithmen/ellipse.lua` },
      { name: "EAN-Barcode (PPM) 📊", file: `${basePath}/examples/algorithmen/save_barcode.lua` },
    ],
  },
  {
    label: "Daten & HTTP 🌐",
    items: [
      { name: "JSON + Wetter-API", file: `${basePath}/examples/daten/json_api.lua` },
      { name: "http_get Basics", file: `${basePath}/examples/daten/http_get.lua` },
      { name: "Pokémon-API", file: `${basePath}/examples/daten/pokemon.lua` },
      { name: "CSV-Parser", file: `${basePath}/examples/daten/csv_demo.lua` },
    ],
  },
];

/** Flat list for backward compat (if needed elsewhere) */
export const EXAMPLES: ExampleItem[] = EXAMPLE_GROUPS.flatMap((g) => g.items);

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
