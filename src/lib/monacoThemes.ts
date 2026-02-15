/**
 * Monaco Editor themes – loaded dynamically from /themes/*.json
 *
 * themelist.json maps theme-id → display-name.
 * Individual theme files live at /themes/<Display Name>.json
 */

import type { editor } from "monaco-editor";

export interface ThemeEntry {
  id: string;
  label: string;
  /** Filename in /themes/ (e.g. "Dracula.json") */
  file: string;
}

/** Built-in Monaco themes (no JSON file needed) */
const BUILTIN_THEMES: ThemeEntry[] = [
  { id: "vs-dark", label: "VS Dark (default)", file: "" },
  { id: "vs", label: "VS Light", file: "" },
  { id: "hc-black", label: "High Contrast", file: "" },
];

const BUILTIN_IDS = new Set(BUILTIN_THEMES.map((t) => t.id));

export function isBuiltin(id: string) {
  return BUILTIN_IDS.has(id);
}

/** Cached theme data (fetched once per theme) */
const themeCache = new Map<string, editor.IStandaloneThemeData>();

/** Full theme list (populated by loadThemeList) */
let allThemes: ThemeEntry[] | null = null;

/**
 * Load the theme list from /themes/themelist.json.
 * Returns built-in + all custom themes sorted alphabetically.
 */
export async function loadThemeList(): Promise<ThemeEntry[]> {
  if (allThemes) return allThemes;

  try {
    const res = await fetch("/themes/themelist.json");
    const map: Record<string, string> = await res.json();

    const custom: ThemeEntry[] = Object.entries(map).map(([id, label]) => ({
      id,
      label,
      file: `${label}.json`,
    }));

    custom.sort((a, b) => a.label.localeCompare(b.label));
    allThemes = [...BUILTIN_THEMES, ...custom];
  } catch (err) {
    console.error("Failed to load theme list:", err);
    allThemes = [...BUILTIN_THEMES];
  }

  return allThemes;
}

/**
 * Fetch and cache a single theme's data.
 * Returns the IStandaloneThemeData or null on error.
 */
export async function fetchThemeData(
  theme: ThemeEntry
): Promise<editor.IStandaloneThemeData | null> {
  if (isBuiltin(theme.id)) return null;

  const cached = themeCache.get(theme.id);
  if (cached) return cached;

  try {
    const res = await fetch(`/themes/${encodeURIComponent(theme.file)}`);
    const data: editor.IStandaloneThemeData = await res.json();
    themeCache.set(theme.id, data);
    return data;
  } catch (err) {
    console.error(`Failed to load theme "${theme.label}":`, err);
    return null;
  }
}



