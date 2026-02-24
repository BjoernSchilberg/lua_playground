# Lua Playground

## Why

Why another webbased Lua Playgroung.

This playground can handle blocking inputs (`io.read()`) and infinite while loops
```while true do end```.

It has a VSCode-based editor
([Monaco](https://microsoft.github.io/monaco-editor/)) with all the fancy
stuff, syntax highlighting, theming, and a command palette for control, vim
mode for the nerds, ...

And it has a lua REPL with simple readline support.

## Keyboard shortcuts

The lua playground is accessible from the keyboard. The most important key
combination to know is `Ctrl+Shift+P`, which brings up the Command Palette. From
here, you have access to all functionality within VS Code, including keyboard
shortcuts for the most common operations.

### LUA REPL with simple readline support

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

