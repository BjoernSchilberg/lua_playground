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
  set_step_mode: (mode: number) => void;
  get_current_line: () => number;
  update_hook: (co: Ptr, count: number) => void;
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
let stepping = false;  // true when in single-step mode
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
/** Extra lines injected between preamble and user code (e.g. level init) */
let extraPreambleLines = 0;

/** Whether REPL mode has been initialised (persistent VM exists) */
let replActive = false;
/** Whether the current execution was triggered by a REPL_EVAL */
let replRunning = false;

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

function hathi.forward(n)
  n = n or 1
  for i = 1, n do
    local d = hathi._dir + 1
    local nr = hathi._row + _dr[d]
    local nc = hathi._col + _dc[d]
    if nr < 0 or nr >= hathi._rows or nc < 0 or nc >= hathi._cols then
      print("⛔ Hier geht's nicht weiter!")
      coroutine.yield("__hathi:speak", "Geht nicht!")
      return false, i - 1
    end
    -- check walkable (water, rock, flags and void block)
    local tile = hathi._level[nr + 1][nc + 1]
    if tile == "w" or tile == "r" or tile == "F" or tile == "G" or tile == "x" then
      print("⛔ Hier geht's nicht weiter!")
      coroutine.yield("__hathi:speak", "Geht nicht!")
      return false, i - 1
    end
    hathi._row = nr
    hathi._col = nc
    coroutine.yield("__hathi:move", nr .. "|" .. nc .. "|" .. hathi._dir)
  end
  return true, n
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
  return tile == "w" or tile == "r" or tile == "F" or tile == "G" or tile == "x"
end

function hathi.raiseFlag()
  local d = hathi._dir + 1
  local nr = hathi._row + _dr[d]
  local nc = hathi._col + _dc[d]
  if nr < 0 or nr >= hathi._rows or nc < 0 or nc >= hathi._cols then return false end
  local tile = hathi._level[nr + 1][nc + 1]
  if tile ~= "F" then return false end
  hathi._level[nr + 1][nc + 1] = "G"
  coroutine.yield("__hathi:tile", nr .. "|" .. nc .. "|G")
  return true
end

function hathi.speak(text, audio)
  coroutine.yield("__hathi:speak", tostring(text), audio and "1" or "0")
end

-- Deutsche Aliase
hathi.geheVor       = hathi.forward
hathi.dreheLinks    = hathi.turnLeft
hathi.dreheRechts   = hathi.turnRight
hathi.hebeAuf       = hathi.pick
hathi.legeAb        = hathi.put
hathi.istWand       = hathi.isWall
hathi.hisseFlagge   = hathi.raiseFlag
hathi.sage          = hathi.speak
hathi.richtung      = hathi.getDir
hathi.zeile         = hathi.getRow
hathi.spalte        = hathi.getCol
hathi.ladeLevel     = hathi.loadLevel

function hathi.help()
  local methods = {
    {"forward(n)",    "geheVor(n)",     "n Schritte vor (Standard: 1)"},
    {"turnLeft()",    "dreheLinks()",   "Nach links drehen"},
    {"turnRight()",   "dreheRechts()",  "Nach rechts drehen"},
    {"pick()",        "hebeAuf()",      "Gegenstand aufheben"},
    {"put(ch)",       "legeAb(ch)",     "Gegenstand ablegen"},
    {"isWall()",      "istWand()",      "Ist vor Hathi eine Wand?"},
    {"raiseFlag()",   "hisseFlagge()",  "Flagge vor Hathi hissen"},
    {"speak(t,a)",    "sage(t,a)",      "Sprechblase (a=true fuer Audio)"},
    {"getDir()",      "richtung()",     "Blickrichtung (0=N 1=O 2=S 3=W)"},
    {"getRow()",      "zeile()",        "Aktuelle Zeile"},
    {"getCol()",      "spalte()",       "Aktuelle Spalte"},
    {"loadLevel(t)",  "ladeLevel(t)",   "Level laden"},
    {"help()",        "hilfe()",        "Diese Hilfe anzeigen"},
  }
  print("╔══════════════════════════════════════════════════════════════╗")
  print("║                    Hathi – Befehle                         ║")
  print("╠════════════════╤═════════════════╤═════════════════════════╣")
  print("║ Englisch       │ Deutsch         │ Beschreibung            ║")
  print("╠════════════════╪═════════════════╪═════════════════════════╣")
  for _, m in ipairs(methods) do
    local en  = m[1] .. string.rep(" ", 14 - #m[1])
    local de  = m[2] .. string.rep(" ", 15 - #m[2])
    local desc = m[3] .. string.rep(" ", 23 - #m[3])
    print("║ " .. en .. " │ " .. de .. " │ " .. desc .. " ║")
  end
  print("╚════════════════╧═════════════════╧═════════════════════════╝")
end
hathi.hilfe = hathi.help
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
      set_step_mode: Module.cwrap("lua_bridge_set_step_mode", null, ["number"]),
      get_current_line: Module.cwrap("lua_bridge_get_current_line", "number", []),
      update_hook: Module.cwrap("lua_bridge_update_hook", null, ["number", "number"]),
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
  stepping = false;
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
    if (replRunning) {
      // REPL mode: collect return values for auto-print
      const nresults = bridge.get_nresults();
      if (nresults > 0) {
        const parts: string[] = [];
        for (let i = -nresults; i <= -1; i++) {
          parts.push(bridge.tostring(co, i) ?? "nil");
        }
        post({ type: "REPL_RESULT", value: parts.join("\t") });
      } else {
        // No return value — still signal completion so the client clears its buffer
        post({ type: "REPL_RESULT", value: null });
      }
      replRunning = false;
    }
    running = false;
    waitingInput = false;
    post({ type: "STATUS", state: "idle" });
    return;
  }

  if (status === 1) {
    // LUA_YIELD
    const nresults = bridge.get_nresults();

    if (nresults === 0) {
      // Hook yield – either timeslice (current_line == -1) or line-step
      const hookLine = bridge.get_current_line();
      if (hookLine >= 0) {
        // Line-step yield: pause and report user line number
        const userLine = hookLine - PREAMBLE_LINES - extraPreambleLines;
        if (userLine <= 0) {
          // Still in preamble – auto-continue
          scheduleTick();
          return;
        }
        // Pause execution and report line to UI
        post({ type: "LINE_PAUSED", line: userLine });
        post({ type: "STATUS", state: "paused" });
        return; // stop scheduling – wait for STEP_NEXT or CONTINUE
      }
      // Normal timeslice yield
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

    if (yieldTag === "__hathi:speak") {
      const text = nresults >= 2 ? (bridge.tostring(co, -nresults + 1) ?? "") : "";
      const audioFlag = nresults >= 3 ? (bridge.tostring(co, -nresults + 2) === "1") : false;
      bridge.pop(co, nresults);
      post({ type: "WORLD_PATCH", patches: [{ kind: "speak", text, audio: audioFlag }] });
      // If audio requested, estimate ~80ms per char; otherwise fixed 1.2s
      const delay = audioFlag ? Math.max(1500, text.length * 80) : 1200;
      schedulerTimer = setTimeout(tick, delay);
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
  if (!replRunning) {
    errMsg = errMsg.replace(/\]:([0-9]+):/, (_m, ln) => {
      const corrected = Math.max(1, parseInt(ln, 10) - PREAMBLE_LINES - extraPreambleLines);
      return `]:${corrected}:`;
    });
  }
  bridge.clearstack(co);
  running = false;
  replRunning = false;
  post({ type: "ERROR", message: errMsg });
  post({ type: "STATUS", state: replActive ? "idle" : "error" });
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

      // Load user code (prepend hathi preamble + optional level init)
      const levelInit = msg.level
        ? `hathi.loadLevel({${msg.level.map((r) => `"${r}"`).join(",")}})
`
        : "";
      extraPreambleLines = levelInit ? levelInit.split("\n").length - 1 : 0;
      const fullCode = HATHI_PREAMBLE + levelInit + msg.code;
      const loadStatus = bridge!.load(co, fullCode);
      if (loadStatus !== 0) {
        let err = bridge!.tostring(co, -1) ?? "syntax error";
        // Correct line numbers by subtracting preamble lines
        err = err.replace(/\]:([0-9]+):/, (_m, ln) => {
          const corrected = Math.max(1, parseInt(ln, 10) - PREAMBLE_LINES - extraPreambleLines);
          return `]:${corrected}:`;
        });
        bridge!.clearstack(co);
        post({ type: "ERROR", message: err });
        post({ type: "STATUS", state: "error" });
        return;
      }

      // Normal run – disable step mode
      bridge!.set_step_mode(0);
      stepping = false;
      bridge!.setup_hook(L, co, TIMESLICE_COUNT);

      // Go
      running = true;
      waitingInput = false;
      post({ type: "STATUS", state: "running" });
      scheduleTick();
      break;
    }

    case "STEP": {
      await ensureInit();

      // Stop any previous run
      stopScheduler();
      stdinQueue.length = 0;
      Module.stdinBuffer.length = 0;

      // Fresh VM
      newVM();

      // Load user code (prepend hathi preamble + optional level init)
      const stepLevelInit = msg.level
        ? `hathi.loadLevel({${msg.level.map((r) => `"${r}"`).join(",")}})
`
        : "";
      extraPreambleLines = stepLevelInit ? stepLevelInit.split("\n").length - 1 : 0;
      const stepFullCode = HATHI_PREAMBLE + stepLevelInit + msg.code;
      const stepLoadStatus = bridge!.load(co, stepFullCode);
      if (stepLoadStatus !== 0) {
        let err = bridge!.tostring(co, -1) ?? "syntax error";
        err = err.replace(/\]:([0-9]+):/, (_m, ln) => {
          const corrected = Math.max(1, parseInt(ln, 10) - PREAMBLE_LINES - extraPreambleLines);
          return `]:${corrected}:`;
        });
        bridge!.clearstack(co);
        post({ type: "ERROR", message: err });
        post({ type: "STATUS", state: "error" });
        return;
      }

      // Enable step mode
      bridge!.set_step_mode(1);
      stepping = true;
      bridge!.setup_hook(L, co, TIMESLICE_COUNT);

      // Go – tick will pause at first user line
      running = true;
      waitingInput = false;
      post({ type: "STATUS", state: "running" });
      scheduleTick();
      break;
    }

    case "STEP_NEXT": {
      // Resume one step while already paused
      if (!bridge || !co) break;
      bridge.set_step_mode(1);
      stepping = true;
      bridge.update_hook(co, TIMESLICE_COUNT);
      running = true;
      post({ type: "STATUS", state: "running" });
      scheduleTick();
      break;
    }

    case "CONTINUE": {
      // Resume full-speed execution from paused state
      if (!bridge || !co) break;
      bridge.set_step_mode(0);
      stepping = false;
      bridge.update_hook(co, TIMESLICE_COUNT);
      running = true;
      post({ type: "STATUS", state: "running" });
      scheduleTick();
      break;
    }

    case "STOP": {
      stopScheduler();
      if (replActive) {
        // In REPL mode: clean up the running coroutine but keep the VM alive
        if (co && bridge) {
          bridge.clearstack(co);
          bridge.pop(L, 1); // pop the dead thread from the main stack
          co = 0;
        }
        replRunning = false;
        post({ type: "STATUS", state: "idle" });
      } else {
        post({ type: "STATUS", state: "stopped" });
      }
      break;
    }

    case "RESET": {
      stopScheduler();
      stdinQueue.length = 0;
      if (Module) Module.stdinBuffer.length = 0;
      replActive = false;
      replRunning = false;
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

    case "REPL_EVAL": {
      await ensureInit();

      // Stop any previous run
      stopScheduler();

      // Create persistent VM on first REPL use (or if destroyed)
      if (!L || !replActive) {
        if (L) {
          try { bridge!.close(L); } catch { /* ignore */ }
        }
        L = bridge!.newstate();
        // Run the Hathi preamble once so hathi.* is available in REPL.
        // No hook needed – the preamble only defines functions/tables.
        const preambleCo = bridge!.newthread(L);
        const preambleStatus = bridge!.load(preambleCo, HATHI_PREAMBLE);
        if (preambleStatus === 0) {
          bridge!.resume(preambleCo, L, 0);
        }
        // Pop the preamble thread from the stack
        bridge!.pop(L, 1);

        // If a level was provided, inject hathi.loadLevel() into the REPL VM
        if (msg.level) {
          const levelCode = `hathi.loadLevel({${msg.level.map((r) => `"${r}"`).join(",")}})`;
          const lvCo = bridge!.newthread(L);
          const lvStatus = bridge!.load(lvCo, levelCode);
          if (lvStatus === 0) {
            // Need hook so the coroutine.yield inside loadLevel works
            bridge!.set_step_mode(0);
            bridge!.setup_hook(L, lvCo, TIMESLICE_COUNT);
            // Run until finished (loadLevel yields __world_init, then finishes)
            let rs = bridge!.resume(lvCo, L, 0);
            while (rs === 1) {
              // Consume yields (like __world_init) without posting to UI
              const nr = bridge!.get_nresults();
              if (nr > 0) bridge!.pop(lvCo, nr);
              rs = bridge!.resume(lvCo, L, 0);
            }
          }
          bridge!.pop(L, 1); // pop level thread
        }

        replActive = true;
      }

      const code = msg.code;

      // Try as expression first (auto-print): "return <code>"
      co = bridge!.newthread(L);
      let loadStatus = bridge!.load(co, `return ${code}`);

      if (loadStatus !== 0) {
        // Expression failed — try as statement
        bridge!.clearstack(co);
        bridge!.pop(L, 1); // pop dead thread
        co = bridge!.newthread(L);
        loadStatus = bridge!.load(co, code);
      }

      if (loadStatus !== 0) {
        // Check for incomplete input (<eof> at the end of error)
        const errStr = bridge!.tostring(co, -1) ?? "";
        bridge!.clearstack(co);
        bridge!.pop(L, 1); // pop dead thread
        co = 0;

        if (errStr.includes("<eof>")) {
          // Incomplete — signal UI to request continuation
          post({ type: "REPL_INCOMPLETE" });
          return;
        }

        // Real syntax error
        post({ type: "ERROR", message: errStr });
        post({ type: "STATUS", state: "idle" });
        return;
      }

      // Set up timeslice hook and run
      bridge!.set_step_mode(0);
      bridge!.setup_hook(L, co, TIMESLICE_COUNT);

      running = true;
      replRunning = true;
      waitingInput = false;
      post({ type: "STATUS", state: "running" });
      scheduleTick();
      break;
    }
  }
};
