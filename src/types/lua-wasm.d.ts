/* Type declarations for the Emscripten-generated Lua WASM module */

declare module "/lua/lua.js" {
  interface LuaModuleInstance {
    cwrap: (
      name: string,
      returnType: string | null,
      argTypes: string[],
    ) => (...args: unknown[]) => unknown;
    ccall: (
      name: string,
      returnType: string | null,
      argTypes: string[],
      args: unknown[],
    ) => unknown;
    _malloc: (size: number) => number;
    _free: (ptr: number) => void;
    UTF8ToString: (ptr: number, maxBytes?: number) => string;
    stringToNewUTF8: (str: string) => number;
    lengthBytesUTF8: (str: string) => number;
    stringToUTF8: (str: string, ptr: number, maxBytes: number) => void;
    onStdout?: (text: string) => void;
    onStdinRequest?: () => void;
    stdinBuffer: string[];
  }

  interface LuaModuleOptions {
    locateFile?: (path: string, prefix: string) => string;
  }

  type LuaModuleFactory = (
    opts?: LuaModuleOptions,
  ) => Promise<LuaModuleInstance>;

  const factory: LuaModuleFactory;
  export default factory;
}
