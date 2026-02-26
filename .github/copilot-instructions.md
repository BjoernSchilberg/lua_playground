# Lua Playground — Copilot Instructions

## Architecture

Browser-based Lua playground built with **Next.js 16** (static export, `output: "export"`). Three pillars:

1. **Monaco Editor** (left) — Lua code editing with vim mode, formatting (`@wasm-fmt/lua_fmt`), theming
2. **Console** (below editor) — stdout/stdin/REPL, readline-style keybindings
3. **Right panel** (render-prop) — varies by route: `IsometricWorld` (Hathi game), `MarkdownPanel` (tutorials), or both in a split view

Central orchestrator: `src/components/PlaygroundLayout.tsx` — owns all state, exposes `PlaygroundContext` to child components via a `rightPanel: (ctx) => ReactNode` render-prop pattern.

## Lua Execution Pipeline

User code runs in a **Web Worker** (`src/workers/luaWorker.ts`) via Emscripten-compiled Lua 5.4 WASM (`public/lua/lua.js`).

**Coroutine-yield scheduler**: Code is wrapped in a Lua coroutine. A C debug hook fires every 20k instructions, yielding back to the JS event loop (`setTimeout(tick, 0)`). This prevents infinite loops from freezing the browser and allows the worker to receive STOP/STDIN messages.

**Yield tags** drive the protocol: `__stdout`, `__stdin`, `__sleep:N`, `__world_init`, `__hathi:move`, `__hathi:turn`, `__hathi:speak`, `__hathi:tile`. The worker reads the tag from the Lua stack and posts typed messages (`src/lib/protocol.ts`) to the main thread.

**Key files in execution chain**: `PlaygroundLayout` → `useLuaWorker` hook → `LuaWorkerClient` (`src/lib/workerClient.ts`) → Worker (`src/workers/luaWorker.ts`) → WASM bridge.

## Hathi Game System

The Hathi API is a **Lua preamble** prepended to user code in `luaWorker.ts` (search for `HATHI_PREAMBLE`). It defines `hathi.forward()`, `hathi.turnLeft()`, etc., each calling `coroutine.yield("__hathi:*", payload)`.

**Tile codes**: `g`=grass, `w`=water, `r`=rock, `t`=tree, `b`=bananas, `c`=crate, `F`=flag, `G`=flag_hoisted, `s`=squash, `o`=tomato, `x`=void (invisible wall). Direction: 0=N, 1=E, 2=S, 3=W.

**German aliases**: Every Hathi API function has a German alias (e.g. `geheVor`, `dreheLinks`, `hisseFlagge`). Both work identically.

**Level loading**: Markdown `\`\`\`level` blocks → `MarkdownPanel` extracts rows → `useLuaWorker.loadLevel()` → worker prepends `hathi.loadLevel({...})` to user code. `#generative` tag triggers `src/lib/levelGenerator.ts` transforms before loading.

**Rendering**: `IsometricWorld.tsx` renders SVG tiles isometrically. Individual `.svg` files from `public/hathi/` are fetched, cached, and composed into one `<svg>` with depth-sorted z-ordering. Hathi animates between positions with 150ms ease-out-quad.

## Theme System

- 3 builtins (`vs-dark`, `vs`, `hc-black`) + ~50 custom themes from `public/themes/` JSON files
- `useThemePalette` hook manages theme state and derives `UiColors` (13 color fields) via `deriveUiColors(bg, fg)` in `src/lib/uiColors.ts`
- Live preview: command palette `onHighlight` applies theme immediately; `onCancel` reverts
- `UiColors` flows to every component as props — never use hardcoded colors for UI surfaces

## Content System

Tutorial/chapter content lives in `public/` folders with a `manifest.json` (`[{ slug, title, file }]`). Any folder with a manifest auto-generates routes at build time via `generateStaticParams()`.

Markdown features: code blocks get "▶ In Editor laden" button, `\`\`\`level` blocks load Hathi worlds, headings get anchors with German umlaut transliteration (ä→ae, ö→oe, ü→ue, ß→ss).

## Build & Deploy

```bash
npm run dev          # Dev server (copies monaco-editor/min/vs → public/vs via predev)
npm run build        # Static export to out/ (GitHub Pages)
npx tsc --noEmit     # Type checking (no test framework configured)
```

- **GitHub Pages**: `GITHUB_ACTIONS=true` sets `basePath: "/lua_playground"`. Post-build SPA redirect script (`scripts/create-spa-redirect.sh`) generates `404.html` fallback.
- **WASM rebuild**: `wasm-lua/build.sh` compiles Lua 5.4.6 via Emscripten → `public/lua/lua.js`
- **Monaco**: Loaded from `public/vs/` (copied from node_modules), not bundled. `basePath` import from `src/lib/basePath.ts` resolves runtime paths.
- **React Compiler** is enabled. TypeScript build errors are ignored (`ignoreBuildErrors: true`).

## Conventions

- **UI language**: Mostly German for user-facing labels, English for code/types/comments
- **State ownership**: `PlaygroundLayout` owns all shared state; child components are controlled via props
- **Worker communication**: Always through typed `MsgToWorker`/`MsgFromWorker` in `src/lib/protocol.ts` — never raw postMessage
- **No hardcoded colors**: Use `UiColors` from `useThemePalette`. Default theme is `"vs"` (light)
- **SVG tiles**: Individual files in `public/hathi/`, fetched and cached at runtime, rendered via `dangerouslySetInnerHTML`
- **Dynamic imports**: Monaco editor loaded via `next/dynamic` with SSR disabled. WASM via `/* webpackIgnore: true */` dynamic import
