/**
 * Monaco Editor themes – loaded dynamically from /themes/*.json
 *
 * themelist.json maps theme-id → display-name.
 * Individual theme files live at /themes/<Display Name>.json
 */

import type { editor } from "monaco-editor";
import basePath from "./basePath";

export interface ThemeEntry {
  id: string;
  label: string;
  /** Filename in /themes/ (e.g. "Dracula.json") */
  file: string;
}

/** Built-in Monaco themes (no JSON file needed) */
const BUILTIN_THEMES: ThemeEntry[] = [
  { id: "vs-dark", label: "VS Dark", file: "" },
  { id: "vs", label: "VS Light (default)", file: "" },
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
    const res = await fetch(`${basePath}/themes/themelist.json`);
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
    const res = await fetch(`${basePath}/themes/${encodeURIComponent(theme.file)}`);
    const data: editor.IStandaloneThemeData = await res.json();
    themeCache.set(theme.id, data);
    return data;
  } catch (err) {
    console.error(`Failed to load theme "${theme.label}":`, err);
    return null;
  }
}

/* ---- Background-color helpers ---- */

const BUILTIN_BG: Record<string, { bg: string; fg: string }> = {
  "vs-dark": { bg: "#1e1e1e", fg: "#d4d4d4" },
  vs: { bg: "#ffffff", fg: "#000000" },
  "hc-black": { bg: "#000000", fg: "#ffffff" },
};

/**
 * Extract background + foreground from theme data or built-in id.
 */
export function getThemeColors(
  themeId: string,
  data?: editor.IStandaloneThemeData | null
): { bg: string; fg: string } {
  if (BUILTIN_IDS.has(themeId)) {
    return BUILTIN_BG[themeId] ?? BUILTIN_BG["vs-dark"];
  }

  const d = data ?? themeCache.get(themeId);
  if (!d) return BUILTIN_BG["vs-dark"];

  const colors = d.colors as Record<string, string> | undefined;
  const bg =
    colors?.["editor.background"] ??
    (() => {
      // fallback: first rule with a "background" field
      const rule = d.rules?.find(
        (r) => "background" in r && (r as unknown as Record<string, unknown>).background
      );
      const raw = rule
        ? ((rule as unknown as Record<string, unknown>).background as string)
        : undefined;
      return raw ? (raw.startsWith("#") ? raw : `#${raw}`) : "#1e1e1e";
    })();
  const fg = colors?.["editor.foreground"] ?? "#d4d4d4";

  return { bg, fg };
}



