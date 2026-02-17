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

    // Unknown yield – treat as slice
    bridge.pop(co, nresults);
    scheduleTick();
    return;
  }

  // Error
  const errMsg = bridge.tostring(co, -1) ?? "unknown Lua error";
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

      // Load user code
      const loadStatus = bridge!.load(co, msg.code);
      if (loadStatus !== 0) {
        const err = bridge!.tostring(co, -1) ?? "syntax error";
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
