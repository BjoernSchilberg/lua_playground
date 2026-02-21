# Lua Playground

## Why

Why another webbased Lua Playgroung.

This playground can handle blocking inputs (`io.read()`) and infinite while loops
```while true do end```.
It has a VSCode-based editor
([Monaco](https://microsoft.github.io/monaco-editor/)) with all the fancy
stuff, syntax highlighting, theming, and a command palette for control, vim
mode for the nerds, ...

LUA REPL with simple readline support:

- Ctrl+A — cursor to start of line
- Ctrl+E — cursor to end of line
- Ctrl+K — kill text from cursor to end of line
- Ctrl+U — kill text from cursor to start of line
- Ctrl+L — clear console
- Ctrl+D — exit REPL-Mode (only if input is empty, prevents accidental closing)
- Ctrl+P / Ctrl+N — History-Navigation (Aliases for ↑/↓)

- Ctrl+F — move cursor forward  a character 
- Ctrl+B — move cursor backward a character

- Alt+F — move cursor forward one word
- Alt+B — move cursor backward one word
- Alt+D — delete word forward (kill word)
- Alt+Backspace — delete word backward (backward kill word)
- CTRL+W


## Development


This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

### Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Check type errors

```shell
npx tsc --noEmit 2>&1
```

Check Static Export sucessful

```shell
npm run build
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

### Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
