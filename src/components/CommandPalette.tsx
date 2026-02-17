"use client";

import { useState, useRef, useEffect, useMemo } from "react";

export interface PaletteItem {
  id: string;
  label: string;
  /** Optional category shown as grey prefix */
  category?: string;
  /** Optional keyboard shortcut hint shown right-aligned */
  shortcut?: string;
}

export interface PaletteColors {
  bg: string;
  fg: string;
  border: string;
  muted: string;
  activeBg: string;
  activeFg: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  onSelect: (id: string) => void;
  /** Called whenever the highlighted (active) item changes */
  onHighlight?: (id: string) => void;
  placeholder?: string;
  /** Theme-adaptive colors */
  colors?: PaletteColors;
}

const DEFAULT_COLORS: PaletteColors = {
  bg: "#1c2128",
  fg: "#d4d4d4",
  border: "#525252",
  muted: "#737373",
  activeBg: "#2563eb",
  activeFg: "#ffffff",
};

export default function CommandPalette({
  open,
  onClose,
  items,
  onSelect,
  onHighlight,
  placeholder = "Type to search…",
  colors = DEFAULT_COLORS,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      // Small delay so the dialog renders before focus
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Filter items
  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q))
    );
  }, [items, query]);

  // Clamp active index
  useEffect(() => {
    setActiveIdx((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered]);

  // Scroll active item into view + notify highlight
  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
    if (filtered[activeIdx] && onHighlight) {
      onHighlight(filtered[activeIdx].id);
    }
  }, [activeIdx, filtered, onHighlight]);

  const handleKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[activeIdx]) {
          onSelect(filtered[activeIdx].id);
          onClose();
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[100] flex justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Palette panel */}
      <div
        className="w-[480px] max-w-[90vw] rounded-lg shadow-2xl flex flex-col overflow-hidden self-start"
        style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKey}
      >
        {/* Search input */}
        <div className="px-3 py-2" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: colors.fg }}
          />
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm" style={{ color: colors.muted }}>No matches</div>
          )}
          {filtered.map((item, i) => {
            const isActive = i === activeIdx;
            return (
              <div
                key={item.id}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => { onSelect(item.id); onClose(); }}
                className="px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2"
                style={{
                  backgroundColor: isActive ? colors.activeBg : "transparent",
                  color: isActive ? colors.activeFg : colors.fg,
                }}
              >
                {item.category && (
                  <span className="text-xs" style={{ color: isActive ? colors.activeFg : colors.muted, opacity: isActive ? 0.7 : 1 }}>
                    {item.category}:
                  </span>
                )}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <kbd
                    className="ml-auto text-[11px] rounded px-1.5 py-0.5 font-sans"
                    style={{
                      backgroundColor: isActive ? 'rgba(255,255,255,0.15)' : `${colors.border}66`,
                      color: isActive ? colors.activeFg : colors.muted,
                    }}
                  >
                    {item.shortcut}
                  </kbd>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
