export interface UiColors {
  bg: string;
  fg: string;
  surface: string;
  surface2: string;
  border: string;
  handle: string;
  muted: string;
  consoleText: string;
  consoleError: string;
  btnNeutral: string;
  btnNeutralHover: string;
  btnNeutralText: string;
  isDark: boolean;
}

export function hexAdjust(hex: string, amount: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const raw = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = clamp(parseInt(raw.slice(0, 2), 16) + amount);
  const g = clamp(parseInt(raw.slice(2, 4), 16) + amount);
  const b = clamp(parseInt(raw.slice(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function luma(hex: string): number {
  const raw = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Derive a full UI palette from the editor background + foreground colours.
 */
export function deriveUiColors(bg: string, fg: string): UiColors {
  const dark = luma(bg) < 128;
  const step = dark ? 12 : -12;
  return {
    bg,
    fg,
    surface: hexAdjust(bg, step),
    surface2: hexAdjust(bg, step * 2),
    border: hexAdjust(bg, dark ? 30 : -30),
    handle: hexAdjust(bg, dark ? 40 : -40),
    muted: dark ? "#9ca3af" : "#6b7280",
    consoleText: dark ? "#4ade80" : "#166534",
    consoleError: dark ? "#f87171" : "#b91c1c",
    btnNeutral: dark ? "#404040" : "#d4d4d4",
    btnNeutralHover: dark ? "#525252" : "#c0c0c0",
    btnNeutralText: dark ? "#e5e5e5" : "#1a1a1a",
    isDark: dark,
  };
}
