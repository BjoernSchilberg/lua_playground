/*
 * lua_bridge.c – Emscripten bridge between Lua 5.4 and the browser Worker.
 *
 * Design:
 *   - EM_JS functions call back into Module.onStdout / .onStdinRequest /
 *     .stdinBuffer so there are no undefined external symbols at link time.
 *   - print / io.write are overridden in Lua to call C helpers that use
 *     host_stdout.
 *   - io.read is overridden *in pure Lua* so that a coroutine.yield("__stdin")
 *     never crosses a C call boundary (which Lua 5.4 forbids without _callk).
 *   - Timeslicing: debug.sethook on the coroutine thread, yielding "__slice"
 *     every N instructions.
 */

#include <string.h>
#include <stdlib.h>
#include <emscripten.h>

#include "lua.h"
#include "lualib.h"
#include "lauxlib.h"

/* ------------------------------------------------------------------ */
/*  EM_JS host I/O helpers (inlined JS – no extern symbols needed)    */
/* ------------------------------------------------------------------ */

EM_JS(void, host_stdout, (const char *ptr, int len), {
    var text = UTF8ToString(ptr, len);
    if (Module.onStdout) Module.onStdout(text);
});

EM_JS(void, host_stdin_request, (), {
    if (Module.onStdinRequest) Module.onStdinRequest();
});

/* Returns a malloc'd C string (caller must free) or NULL. */
EM_JS(char *, host_stdin_pop, (), {
    if (Module.stdinBuffer && Module.stdinBuffer.length > 0) {
        var val = Module.stdinBuffer.shift();
        var len = lengthBytesUTF8(val) + 1;
        var ptr = _malloc(len);
        stringToUTF8(val, ptr, len);
        return ptr;
    }
    return 0;
});

/* ------------------------------------------------------------------ */
/*  C-functions exposed to Lua                                        */
/* ------------------------------------------------------------------ */

/* __bridge_write(str) – send string to host stdout */
static int l_bridge_write(lua_State *L) {
    size_t len;
    const char *s = luaL_checklstring(L, 1, &len);
    host_stdout(s, (int)len);
    return 0;
}

/* __bridge_stdin_pop() – returns string or nil */
static int l_bridge_stdin_pop(lua_State *L) {
    char *s = host_stdin_pop();
    if (s) {
        lua_pushstring(L, s);
        free(s);
    } else {
        lua_pushnil(L);
    }
    return 1;
}

/* __bridge_stdin_request() – notify host that we need input */
static int l_bridge_stdin_req(lua_State *L) {
    (void)L;
    host_stdin_request();
    return 0;
}

/* ------------------------------------------------------------------ */
/*  Lua bootstrap code (runs in the *main* state)                     */
/* ------------------------------------------------------------------ */

static const char *BOOTSTRAP_LUA =
    /* ---- print (pure Lua – yields to host, no C frames on stack) ---- */
    "print = function(...)\n"
    "  local parts = {}\n"
    "  for i = 1, select('#', ...) do\n"
    "    if i > 1 then parts[#parts+1] = '\\t' end\n"
    "    parts[#parts+1] = tostring(select(i, ...))\n"
    "  end\n"
    "  parts[#parts+1] = '\\n'\n"
    "  coroutine.yield('__stdout', table.concat(parts))\n"
    "end\n"
    /* ---- io.write (pure Lua – yields to host) ---- */
    "io.write = function(...)\n"
    "  local parts = {}\n"
    "  for i = 1, select('#', ...) do\n"
    "    parts[#parts+1] = tostring(select(i, ...))\n"
    "  end\n"
    "  coroutine.yield('__stdout', table.concat(parts))\n"
    "end\n"
    /* ---- io.read (pure Lua – safe to yield) ---- */
    "local _spop = __bridge_stdin_pop\n"
    "local _sreq = __bridge_stdin_request\n"
    "io.read = function()\n"
    "  local v = _spop()\n"
    "  if v ~= nil then return v end\n"
    "  _sreq()\n"
    "  coroutine.yield('__stdin')\n"
    "  return _spop()\n"
    "end\n"
    /* ---- io.flush (no-op in browser) ---- */
    "io.flush = function() end\n"
    /* ---- sleep(ms) via coroutine yield ---- */
    "function sleep(ms)\n"
    "  coroutine.yield('__sleep:' .. math.floor(ms))\n"
    "end\n"
    /* ---- disable dangerous os functions ---- */
    "os.execute = nil\n"
    "os.exit = nil\n"
    "os.remove = nil\n"
    "os.rename = nil\n"
    "os.tmpname = nil\n"
;

/* ------------------------------------------------------------------ */
/*  Exported bridge API                                               */
/* ------------------------------------------------------------------ */

/*
 * lua_bridge_newstate() → lua_State*
 * Creates a fresh Lua state, opens libs, registers bridge C funcs,
 * and runs the bootstrap Lua code.
 */
EMSCRIPTEN_KEEPALIVE
lua_State *lua_bridge_newstate(void) {
    lua_State *L = luaL_newstate();
    if (!L) return NULL;
    luaL_openlibs(L);

    /* Register C helpers as globals so bootstrap Lua can see them */
    lua_pushcfunction(L, l_bridge_write);
    lua_setglobal(L, "__bridge_write");

    lua_pushcfunction(L, l_bridge_stdin_pop);
    lua_setglobal(L, "__bridge_stdin_pop");

    lua_pushcfunction(L, l_bridge_stdin_req);
    lua_setglobal(L, "__bridge_stdin_request");

    /* Run bootstrap */
    if (luaL_dostring(L, BOOTSTRAP_LUA) != LUA_OK) {
        const char *err = lua_tostring(L, -1);
        host_stdout(err ? err : "bootstrap error", err ? (int)strlen(err) : 15);
        host_stdout("\n", 1);
        lua_pop(L, 1);
    }

    return L;
}

/*
 * lua_bridge_newthread(L) → lua_State* (coroutine)
 * Creates a new Lua thread (coroutine) inside the given state.
 * The thread reference stays on L's stack at index 1.
 */
EMSCRIPTEN_KEEPALIVE
lua_State *lua_bridge_newthread(lua_State *L) {
    lua_State *co = lua_newthread(L);
    return co;
}

/*
 * lua_bridge_load(co, code) → int  (0 = OK)
 * Compiles `code` as a chunk and leaves the function on co's stack.
 */
EMSCRIPTEN_KEEPALIVE
int lua_bridge_load(lua_State *co, const char *code) {
    return luaL_loadstring(co, code);
}

/*
 * lua_bridge_resume(co, from, nargs) → int  (0=OK, 1=YIELD, else error)
 * Thin wrapper around lua_resume (Lua 5.4 – 4 args).
 * Stores nresults so JS can query how many values were yielded.
 */
static int last_nresults = 0;

EMSCRIPTEN_KEEPALIVE
int lua_bridge_resume(lua_State *co, lua_State *from, int nargs) {
    last_nresults = 0;
    return lua_resume(co, from, nargs, &last_nresults);
}

/*
 * lua_bridge_get_nresults() → int
 * Returns the nresults from the most recent lua_bridge_resume call.
 * 0 after a hook yield, >= 1 after a Lua coroutine.yield(...).
 */
EMSCRIPTEN_KEEPALIVE
int lua_bridge_get_nresults(void) {
    return last_nresults;
}

/*
 * lua_bridge_tostring(co, idx) → const char*
 */
EMSCRIPTEN_KEEPALIVE
const char *lua_bridge_tostring(lua_State *co, int idx) {
    return lua_tostring(co, idx);
}

/*
 * lua_bridge_clearstack(co) – set stack top to 0
 */
EMSCRIPTEN_KEEPALIVE
void lua_bridge_clearstack(lua_State *co) {
    lua_settop(co, 0);
}

/*
 * lua_bridge_pop(co, n) – pop n values from the stack
 */
EMSCRIPTEN_KEEPALIVE
void lua_bridge_pop(lua_State *co, int n) {
    lua_pop(co, n);
}

/*
 * lua_bridge_close(L) – close the main state (frees everything incl. threads)
 */
EMSCRIPTEN_KEEPALIVE
void lua_bridge_close(lua_State *L) {
    lua_close(L);
}

/*
 * lua_bridge_setup_hook(L, co, count)
 * Sets a count-based debug hook on the coroutine thread.
 *
 * We use a C-level hook that calls lua_yield(L, 0) directly.
 * Lua 5.4 supports yielding from C hooks: luaG_traceexec checks
 * L->status == LUA_YIELD after the hook returns and handles it.
 * The hook yields 0 values (no "__slice" string), so the JS side
 * must treat a nil yield value as a timeslice signal.
 *
 * Step-mode extension:
 *   When step_mode == 1 the hook also fires on LUA_MASKLINE.
 *   On a line event it stores the current line number in
 *   `current_line` (readable via lua_bridge_get_current_line)
 *   and yields.  The JS side checks current_line to distinguish
 *   a line-step pause from a timeslice yield.
 */

static int step_mode = 0;      /* 0 = run, 1 = single-step */
static int current_line = -1;  /* -1 = no line event pending */

static void debug_hook(lua_State *L, lua_Debug *ar) {
    if (ar->event == LUA_HOOKLINE && step_mode) {
        current_line = ar->currentline;
        lua_yield(L, 0);
    } else if (ar->event == LUA_HOOKCOUNT) {
        current_line = -1;
        lua_yield(L, 0);
    }
}

EMSCRIPTEN_KEEPALIVE
int lua_bridge_setup_hook(lua_State *L, lua_State *co, int count) {
    (void)L;
    int mask = LUA_MASKCOUNT;
    if (step_mode) mask |= LUA_MASKLINE;
    lua_sethook(co, debug_hook, mask, count);
    return 0;
}

EMSCRIPTEN_KEEPALIVE
void lua_bridge_set_step_mode(int mode) {
    step_mode = mode;
}

EMSCRIPTEN_KEEPALIVE
int lua_bridge_get_current_line(void) {
    int line = current_line;
    current_line = -1;  /* auto-reset after read */
    return line;
}

/*
 * lua_bridge_update_hook(co, count)
 * Re-applies the hook with the correct mask for the current step_mode.
 * Call after changing step_mode to update an already-running coroutine.
 */
EMSCRIPTEN_KEEPALIVE
void lua_bridge_update_hook(lua_State *co, int count) {
    int mask = LUA_MASKCOUNT;
    if (step_mode) mask |= LUA_MASKLINE;
    lua_sethook(co, debug_hook, mask, count);
}
