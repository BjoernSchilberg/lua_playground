/**
 * luaWorker.ts – Web Worker that runs Lua code via the WASM bridge.
 *
 * Key points:
 *   • Loads /lua/lua.js dynamically (webpackIgnore) so Webpack doesn't bundle it.
 *   • Uses a coroutine-based scheduler: each tick calls lua_bridge_resume,
 *     then yields back to the event loop (setTimeout 0) so the browser stays
 *     responsive and can deliver STDIN_SUBMIT / STOP messages.
 *   • Yield values: "__slice" → timeslice exhausted, "__stdin" → waiting for input.
 */

import type { MsgToWorker, MsgFromWorker } from "../lib/protocol";

/** Base path for loading assets (set at build time for GitHub Pages) */
const LUA_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/* ------------------------------------------------------------------ */
/*  Types for the WASM module (cwrap results)                         */
/* ------------------------------------------------------------------ */

type Ptr = number; // opaque pointer (lua_State*)

interface LuaBridge {
  newstate: () => Ptr;
  newthread: (L: Ptr) => Ptr;
  load: (co: Ptr, code: string) => number;
  resume: (co: Ptr, from: Ptr, nargs: number) => number;
  get_nresults: () => number;
  tostring: (co: Ptr, idx: number) => string | null;
  clearstack: (co: Ptr) => void;
  pop: (co: Ptr, n: number) => void;
  close: (L: Ptr) => void;
  setup_hook: (L: Ptr, co: Ptr, count: number) => number;
}

/* ------------------------------------------------------------------ */
/*  Worker state                                                      */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Module: any = null;
let bridge: LuaBridge | null = null;

let L: Ptr = 0;   // main Lua state
let co: Ptr = 0;  // coroutine thread

let running = false;
let waitingInput = false;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

const stdinQueue: string[] = [];

let initPromise: Promise<void> | null = null;

const TIMESLICE_COUNT = 20000;

/* ------------------------------------------------------------------ */
/*  Hathi Lua preamble (injected before user code – pure Lua, no       */
/*  WASM recompile needed)                                            */
/* ------------------------------------------------------------------ */

const HATHI_PREAMBLE = `
-- Hathi API  (tile codes: g=grass w=water f=filled r=rock t=tree
--   b=bananas c=crate F=flag s=squash o=tomato H=hathi start on grass)
hathi = {}
hathi._row = 0
hathi._col = 0
hathi._dir = 1   -- 0=N 1=E 2=S 3=W
hathi._level = nil
hathi._rows = 0
hathi._cols = 0

local _dr = {-1, 0, 1, 0}  -- N E S W  row deltas
local _dc = { 0, 1, 0,-1}  -- N E S W  col deltas

function hathi.loadLevel(tbl)
  hathi._level = {}
  hathi._rows = #tbl
  hathi._cols = 0
  local startR, startC = 0, 0
  for r = 1, #tbl do
    local row = tbl[r]
    if #row > hathi._cols then hathi._cols = #row end
    local parsed = {}
    for c = 1, #row do
      local ch = row:sub(c, c)
      if ch == "H" then
        startR = r - 1
        startC = c - 1
        ch = "g"
      end
      parsed[c] = ch
    end
    hathi._level[r] = parsed
  end
  hathi._row = startR
  hathi._col = startC
  hathi._dir = 1  -- default East
  -- serialise level as pipe-separated rows for the host
  local rows = {}
  for r = 1, #hathi._level do
    rows[r] = table.concat(hathi._level[r])
  end
  coroutine.yield("__world_init", table.concat(rows, "|") .. "|" .. startR .. "|" .. startC .. "|" .. hathi._dir)
end

function hathi.forward()
  local d = hathi._dir + 1
  local nr = hathi._row + _dr[d]
  local nc = hathi._col + _dc[d]
  if nr < 0 or nr >= hathi._rows or nc < 0 or nc >= hathi._cols then return false end
  -- check walkable (only water and rock block)
  local tile = hathi._level[nr + 1][nc + 1]
  if tile == "w" or tile == "r" then return false end
  hathi._row = nr
  hathi._col = nc
  coroutine.yield("__hathi:move", nr .. "|" .. nc .. "|" .. hathi._dir)
  return true
end

function hathi.turnLeft()
  hathi._dir = (hathi._dir + 3) % 4
  coroutine.yield("__hathi:turn", hathi._row .. "|" .. hathi._col .. "|" .. hathi._dir)
end

function hathi.turnRight()
  hathi._dir = (hathi._dir + 1) % 4
  coroutine.yield("__hathi:turn", hathi._row .. "|" .. hathi._col .. "|" .. hathi._dir)
end

function hathi.pick()
  local r = hathi._row + 1
  local c = hathi._col + 1
  local tile = hathi._level[r][c]
  if tile == "b" or tile == "s" or tile == "o" then
    hathi._level[r][c] = "g"
    coroutine.yield("__hathi:tile", (r-1) .. "|" .. (c-1) .. "|g")
    return tile
  end
  return nil
end

function hathi.put(ch)
  local r = hathi._row + 1
  local c = hathi._col + 1
  hathi._level[r][c] = ch
  coroutine.yield("__hathi:tile", (r-1) .. "|" .. (c-1) .. "|" .. ch)
end

function hathi.getDir()
  return hathi._dir
end

function hathi.getRow()
  return hathi._row
end

function hathi.getCol()
  return hathi._col
end

function hathi.isWall()
  local d = hathi._dir + 1
  local nr = hathi._row + _dr[d]
  local nc = hathi._col + _dc[d]
  if nr < 0 or nr >= hathi._rows or nc < 0 or nc >= hathi._cols then return true end
  local tile = hathi._level[nr + 1][nc + 1]
  return tile == "w" or tile == "r"
end
`;

/** Number of lines in the preamble – subtracted from error line numbers */
const PREAMBLE_LINES = HATHI_PREAMBLE.split("\n").length - 1;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function post(msg: MsgFromWorker) {
  self.postMessage(msg);
}

function postStatus(state: MsgFromWorker extends { type: "STATUS" } ? MsgFromWorker : never) {
  post(state);
}

/* ------------------------------------------------------------------ */
/*  Init                                                              */
/* ------------------------------------------------------------------ */

async function ensureInit(): Promise<void> {
  if (Module) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Dynamic import with webpackIgnore so Webpack doesn't try to bundle the
    // Emscripten-generated JS glue.
    const factory = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await import(/* webpackIgnore: true */ `${LUA_BASE}/lua/lua.js`) as any
    ).default;

    Module = await factory({
      locateFile: (path: string) => {
        if (path.endsWith(".wasm")) return `${LUA_BASE}/lua/lua.wasm`;
        return path;
      },
    });

    // Attach host callbacks the EM_JS functions expect
    Module.onStdout = (text: string) => {
      post({ type: "STDOUT", text });
    };
    Module.onStdinRequest = () => {
      post({ type: "STDIN_REQUEST" });
    };
    Module.stdinBuffer = [] as string[];

    // Wrap C bridge functions
    bridge = {
      newstate: Module.cwrap("lua_bridge_newstate", "number", []),
      newthread: Module.cwrap("lua_bridge_newthread", "number", ["number"]),
      load: Module.cwrap("lua_bridge_load", "number", ["number", "string"]),
      resume: Module.cwrap("lua_bridge_resume", "number", [
        "number",
        "number",
        "number",
      ]),
      get_nresults: Module.cwrap("lua_bridge_get_nresults", "number", []),
      tostring: Module.cwrap("lua_bridge_tostring", "string", [
        "number",
        "number",
      ]),
      clearstack: Module.cwrap("lua_bridge_clearstack", null, ["number"]),
      pop: Module.cwrap("lua_bridge_pop", null, ["number", "number"]),
      close: Module.cwrap("lua_bridge_close", null, ["number"]),
      setup_hook: Module.cwrap("lua_bridge_setup_hook", "number", [
        "number",
        "number",
        "number",
      ]),
    };

    post({ type: "READY" });
  })();

  return initPromise;
}

/* ------------------------------------------------------------------ */
/*  VM lifecycle                                                      */
/* ------------------------------------------------------------------ */

function newVM() {
  if (L && bridge) {
    try {
      bridge.close(L);
    } catch {
      /* ignore */
    }
  }
  L = bridge!.newstate();
  co = bridge!.newthread(L);
}

function destroyVM() {
  if (L && bridge) {
    try {
      bridge.close(L);
    } catch {
      /* ignore */
    }
  }
  L = 0;
  co = 0;
}

/* ------------------------------------------------------------------ */
/*  Scheduler                                                         */
/* ------------------------------------------------------------------ */

function stopScheduler() {
  running = false;
  waitingInput = false;
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}

function scheduleTick() {
  if (!running) return;
  schedulerTimer = setTimeout(tick, 0);
}

function tick() {
  if (!running || !bridge) return;

  const status = bridge.resume(co, L, 0);

  if (status === 0) {
    // LUA_OK – script finished
    running = false;
    waitingInput = false;
    post({ type: "STATUS", state: "idle" });
    return;
  }

  if (status === 1) {
    // LUA_YIELD
    const nresults = bridge.get_nresults();

    if (nresults === 0) {
      // Hook yield (C-level timeslice) – no values on stack
      scheduleTick();
      return;
    }

    // Lua-level yield – read the values and pop them
    // coroutine.yield(tag, ...) pushes values on the stack:
    //   stack[-nresults] = tag, stack[-nresults+1] = arg1, ...
    const yieldTag = bridge.tostring(co, -nresults);

    if (yieldTag === "__stdout") {
      // print / io.write yielded text as second argument
      const text = nresults >= 2 ? (bridge.tostring(co, -nresults + 1) ?? "") : "";
      bridge.pop(co, nresults);
      post({ type: "STDOUT", text });
      scheduleTick();
      return;
    }

    if (yieldTag && yieldTag.startsWith("__sleep:")) {
      // Sleep request – resume after the requested delay
      const ms = parseInt(yieldTag.slice(8), 10) || 0;
      bridge.pop(co, nresults);
      schedulerTimer = setTimeout(tick, ms);
      return;
    }

    if (yieldTag === "__stdin") {
      // Lua wants input – wait for STDIN_SUBMIT from UI
      bridge.pop(co, nresults);
      waitingInput = true;
      post({ type: "STATUS", state: "waiting_input" });
      return;
    }

    /* ---- Hathi / World yield tags ---- */

    if (yieldTag === "__world_init") {
      // payload: "row1|row2|...|startR|startC|dir"
      const payload = nresults >= 2 ? (bridge.tostring(co, -nresults + 1) ?? "") : "";
      bridge.pop(co, nresults);
      const parts = payload.split("|");
      const dir = parseInt(parts.pop()!, 10);
      const startC = parseInt(parts.pop()!, 10);
      const startR = parseInt(parts.pop()!, 10);
      const level = parts;
      post({ type: "SHOW_WORLD" });
      post({ type: "WORLD_INIT", level, hathiRow: startR, hathiCol: startC, hathiDir: dir });
      scheduleTick();
      return;
    }

    if (yieldTag === "__hathi:move") {
      const payload = nresults >= 2 ? (bridge.tostring(co, -nresults + 1) ?? "") : "";
      bridge.pop(co, nresults);
      const [r, c, d] = payload.split("|").map(Number);
      post({ type: "WORLD_PATCH", patches: [{ kind: "hathi", row: r, col: c, dir: d }] });
      // Small delay so animation is visible
      schedulerTimer = setTimeout(tick, 150);
      return;
    }

    if (yieldTag === "__hathi:turn") {
      const payload = nresults >= 2 ? (bridge.tostring(co, -nresults + 1) ?? "") : "";
      bridge.pop(co, nresults);
      const [r, c, d] = payload.split("|").map(Number);
      post({ type: "WORLD_PATCH", patches: [{ kind: "hathi", row: r, col: c, dir: d }] });
      schedulerTimer = setTimeout(tick, 100);
      return;
    }

    if (yieldTag === "__hathi:tile") {
      const payload = nresults >= 2 ? (bridge.tostring(co, -nresults + 1) ?? "") : "";
      bridge.pop(co, nresults);
      const parts = payload.split("|");
      const row = parseInt(parts[0], 10);
      const col = parseInt(parts[1], 10);
      const tile = parts[2];
      post({ type: "WORLD_PATCH", patches: [{ kind: "tile", row, col, tile }] });
      scheduleTick();
      return;
    }

    // Unknown yield – treat as slice
    bridge.pop(co, nresults);
    scheduleTick();
    return;
  }

  // Error — correct line number for preamble offset
  let errMsg = bridge.tostring(co, -1) ?? "unknown Lua error";
  errMsg = errMsg.replace(/\]:([0-9]+):/, (_m, ln) => {
    const corrected = Math.max(1, parseInt(ln, 10) - PREAMBLE_LINES);
    return `]:${corrected}:`;
  });
  bridge.clearstack(co);
  running = false;
  post({ type: "ERROR", message: errMsg });
  post({ type: "STATUS", state: "error" });
}

/* ------------------------------------------------------------------ */
/*  Message handler                                                   */
/* ------------------------------------------------------------------ */

self.onmessage = async (e: MessageEvent<MsgToWorker>) => {
  const msg = e.data;

  switch (msg.type) {
    case "INIT": {
      await ensureInit();
      post({ type: "STATUS", state: "idle" });
      break;
    }

    case "RUN": {
      await ensureInit();

      // Stop any previous run
      stopScheduler();
      stdinQueue.length = 0;
      Module.stdinBuffer.length = 0;

      // Fresh VM
      newVM();

      // Load user code (prepend hathi preamble)
      const fullCode = HATHI_PREAMBLE + "\n" + msg.code;
      const loadStatus = bridge!.load(co, fullCode);
      if (loadStatus !== 0) {
        let err = bridge!.tostring(co, -1) ?? "syntax error";
        // Correct line numbers by subtracting preamble lines
        err = err.replace(/\]:([0-9]+):/, (_m, ln) => {
          const corrected = Math.max(1, parseInt(ln, 10) - PREAMBLE_LINES);
          return `]:${corrected}:`;
        });
        bridge!.clearstack(co);
        post({ type: "ERROR", message: err });
        post({ type: "STATUS", state: "error" });
        return;
      }

      // Install timeslice hook
      bridge!.setup_hook(L, co, TIMESLICE_COUNT);

      // Go
      running = true;
      waitingInput = false;
      post({ type: "STATUS", state: "running" });
      scheduleTick();
      break;
    }

    case "STOP": {
      stopScheduler();
      post({ type: "STATUS", state: "stopped" });
      break;
    }

    case "RESET": {
      stopScheduler();
      stdinQueue.length = 0;
      if (Module) Module.stdinBuffer.length = 0;
      destroyVM();
      post({ type: "CONSOLE_CLEAR" });
      post({ type: "STATUS", state: "idle" });
      break;
    }

    case "STDIN_SUBMIT": {
      if (waitingInput && running) {
        // Coroutine is paused at yield("__stdin"), waiting for _spop().
        // Push directly to stdinBuffer so the Lua _spop() finds it on resume.
        if (Module) Module.stdinBuffer.push(msg.value);
        waitingInput = false;
        post({ type: "STATUS", state: "running" });
        scheduleTick();
      } else {
        // Not waiting yet – queue for later. When io.read() runs,
        // _spop() reads from stdinBuffer, so put it there.
        if (Module) Module.stdinBuffer.push(msg.value);
      }
      break;
    }
  }
};
