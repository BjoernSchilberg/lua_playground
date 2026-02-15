#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

LUA_SRC=lua-5.4.6/src
BRIDGE=bridge/lua_bridge.c
OUT_DIR=dist

# All Lua core + stdlib .c files (excluding lua.c and luac.c)
LUA_C_FILES=(
  "$LUA_SRC/lapi.c"
  "$LUA_SRC/lauxlib.c"
  "$LUA_SRC/lbaselib.c"
  "$LUA_SRC/lcode.c"
  "$LUA_SRC/lcorolib.c"
  "$LUA_SRC/lctype.c"
  "$LUA_SRC/ldblib.c"
  "$LUA_SRC/ldebug.c"
  "$LUA_SRC/ldo.c"
  "$LUA_SRC/ldump.c"
  "$LUA_SRC/lfunc.c"
  "$LUA_SRC/lgc.c"
  "$LUA_SRC/linit.c"
  "$LUA_SRC/liolib.c"
  "$LUA_SRC/llex.c"
  "$LUA_SRC/lmathlib.c"
  "$LUA_SRC/lmem.c"
  "$LUA_SRC/loadlib.c"
  "$LUA_SRC/lobject.c"
  "$LUA_SRC/lopcodes.c"
  "$LUA_SRC/loslib.c"
  "$LUA_SRC/lparser.c"
  "$LUA_SRC/lstate.c"
  "$LUA_SRC/lstring.c"
  "$LUA_SRC/lstrlib.c"
  "$LUA_SRC/ltable.c"
  "$LUA_SRC/ltablib.c"
  "$LUA_SRC/ltm.c"
  "$LUA_SRC/lundump.c"
  "$LUA_SRC/lutf8lib.c"
  "$LUA_SRC/lvm.c"
  "$LUA_SRC/lzio.c"
)

mkdir -p "$OUT_DIR"

echo "==> Building Lua 5.4.6 WASM module..."

emcc -O2 \
  "${LUA_C_FILES[@]}" \
  "$BRIDGE" \
  -I "$LUA_SRC" \
  -DLUA_USE_POSIX=0 \
  -sWASM=1 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME=LuaModule \
  -sENVIRONMENT='web,worker' \
  -sALLOW_MEMORY_GROWTH=1 \
  -sFILESYSTEM=0 \
  -sINVOKE_RUN=0 \
  -sNO_EXIT_RUNTIME=1 \
  -sSTACK_SIZE=1048576 \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_lua_bridge_newstate","_lua_bridge_newthread","_lua_bridge_load","_lua_bridge_resume","_lua_bridge_get_nresults","_lua_bridge_tostring","_lua_bridge_clearstack","_lua_bridge_pop","_lua_bridge_close","_lua_bridge_setup_hook"]' \
  -sEXPORTED_RUNTIME_METHODS='["UTF8ToString","stringToNewUTF8","lengthBytesUTF8","stringToUTF8","ccall","cwrap"]' \
  --no-entry \
  -o "$OUT_DIR/lua.mjs"

echo "==> Build complete: $OUT_DIR/lua.mjs + $OUT_DIR/lua.wasm"

# Copy to public/lua/ for serving
PUBLIC_LUA="$SCRIPT_DIR/../public/lua"
mkdir -p "$PUBLIC_LUA"
cp "$OUT_DIR/lua.mjs" "$PUBLIC_LUA/lua.js"
cp "$OUT_DIR/lua.wasm" "$PUBLIC_LUA/lua.wasm"

echo "==> Copied to public/lua/lua.js + public/lua/lua.wasm"
echo "Done."
