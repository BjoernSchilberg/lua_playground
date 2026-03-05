"use client";

import { useEffect, useState, useCallback, useRef, useMemo, type ComponentProps, type ReactNode } from "react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import basePath from "@/lib/basePath";
import type { UiColors } from "@/lib/uiColors";
import { generateLevel } from "@/lib/levelGenerator";

/* ------------------------------------------------------------------ */
/*  Recursively extract plain text from React children                 */
/* ------------------------------------------------------------------ */

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

/* ------------------------------------------------------------------ */
/*  Heading slug & parser for TOC                                      */
/* ------------------------------------------------------------------ */

/** German umlaut transliteration map */
const TRANSLITERATE: Record<string, string> = {
  "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
  "Ä": "Ae", "Ö": "Oe", "Ü": "Ue",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüßÄÖÜ]/g, (ch) => TRANSLITERATE[ch] ?? ch)
    .replace(/[`*_~]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface TocHeading {
  level: 1 | 2;
  text: string;
  id: string;
}

export function parseHeadings(md: string): TocHeading[] {
  const result: TocHeading[] = [];
  const regex = /^(#{1,2})\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(md)) !== null) {
    const level = match[1].length as 1 | 2;
    const text = match[2]
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\*\*([^*]*)\*\*/g, "$1")
      .replace(/\*([^*]*)\*/g, "$1");
    result.push({ level, text, id: slugify(text) });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Tutorial manifest types                                            */
/* ------------------------------------------------------------------ */

export interface TutorialEntry {
  slug: string;
  title: string;
  file: string;
}

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

export interface MarkdownPanelProps {
  /** Filename (or sub-path) inside the base directory, e.g. "einfuehrung_lua01.md" */
  src: string;
  /** Folder inside public/ that contains the .md files (default: "tutorial") */
  baseDir?: string;
  ui: UiColors;
  /** Called when user clicks "In Editor laden" on a Lua code block */
  onLoadCode: (code: string) => void;
  /** Navigation callbacks + labels */
  navPrev?: { title: string; onNavigate: () => void } | null;
  navNext?: { title: string; onNavigate: () => void } | null;
  /** Full table of contents for hamburger menu */
  toc?: { title: string; active: boolean; onSelect: () => void; headings?: TocHeading[] }[];
  /** Called to scroll to a heading after navigating to a different doc */
  onScrollToHeading?: (id: string) => void;
  /** Called when a #fragment anchor is clicked so the parent can update the URL */
  onHashChange?: (id: string) => void;
  /** Called when a ```level block is found — receives the level rows */
  onLoadLevel?: (rows: string[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function MarkdownPanel({
  src,
  baseDir = "tutorial",
  ui,
  onLoadCode,
  navPrev,
  navNext,
  toc,
  onScrollToHeading,
  onHashChange,
  onLoadLevel,
}: MarkdownPanelProps) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [fontSize, setFontSize] = useState(15);
  const [showSource, setShowSource] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<string | null>(null);
  const hasScrolledInitialHash = useRef(false);

  /* Fetch the .md file */
  const fetchMarkdown = useCallback((file: string, reset = true) => {
    if (reset) {
      setMarkdown(null);
      setError(null);
      setTocOpen(false);
    }
    fetch(`${basePath}/${baseDir}/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        setMarkdown(text);
      })
      .catch((e) => setError(e.message));
  }, []);

  /* Initial load + reload when src changes */
  useEffect(() => {
    fetchMarkdown(src);
  }, [src, fetchMarkdown]);

  /* Scroll to heading after markdown is rendered in the DOM */
  useEffect(() => {
    if (markdown === null) return;

    const scrollTarget = pendingScrollRef.current;
    if (scrollTarget) {
      pendingScrollRef.current = null;
      requestAnimationFrame(() => {
        const el = document.getElementById(scrollTarget);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    if (!hasScrolledInitialHash.current) {
      hasScrolledInitialHash.current = true;
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (hash) {
        requestAnimationFrame(() => {
          const el = document.getElementById(hash);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    }
  }, [markdown]);

  /* Re-fetch on window focus (handy for live-editing .md files) */
  useEffect(() => {
    const onFocus = () => fetchMarkdown(src, false);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [src, fetchMarkdown]);

  /* Handle deferred scroll request from parent (after doc switch) */
  useEffect(() => {
    if (onScrollToHeading) return; // managed via pendingScrollRef
  }, [onScrollToHeading]);

  /* Extract and load level blocks from markdown */
  useEffect(() => {
    if (!markdown || !onLoadLevel) return;
    const levelRegex = /```level(#\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = levelRegex.exec(markdown)) !== null) {
      const tag = match[1]; // e.g. "#generative" or undefined
      let rows = match[2].trim().split("\n").map((r) => r.trim()).filter(Boolean);
      if (rows.length > 0) {
        if (tag === "#generative") {
          rows = generateLevel(rows);
        }
        onLoadLevel(rows);
        break; // load only the first level block found
      }
    }
  }, [markdown, onLoadLevel]);

  /* Stable callback ref for code blocks */
  const handleLoadCode = useCallback(
    (code: string) => {
      onLoadCode(code);
    },
    [onLoadCode],
  );

  /* Scroll to a heading inside the content area */
  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /* Custom components for ReactMarkdown */
  const HeadingWithAnchor = useCallback(({ level, children, ...rest }: { level: number; children?: ReactNode; [k: string]: unknown }) => {
    const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    const id = slugify(extractText(children));
    return (
      <Tag id={id} className="md-heading-anchor-wrap" {...rest}>
        {children}
        <a
          href={`#${id}`}
          className="md-heading-anchor"
          aria-label="Link zu diesem Abschnitt"
          onClick={(e) => {
            e.preventDefault();
            const url = new URL(window.location.href);
            url.hash = id;
            window.history.replaceState(window.history.state, "", url.toString());
            onHashChange?.(id);
            const el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            navigator.clipboard?.writeText(url.toString());
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-.8 9.45a.75.75 0 01-1.06-1.06l-1.25 1.25a2 2 0 11-2.83-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25z"/>
          </svg>
        </a>
      </Tag>
    );
  }, [onHashChange]);

  const components: ComponentProps<typeof ReactMarkdown>["components"] = {
    h1({ children, ...rest }) { return <HeadingWithAnchor level={1} {...rest}>{children}</HeadingWithAnchor>; },
    h2({ children, ...rest }) { return <HeadingWithAnchor level={2} {...rest}>{children}</HeadingWithAnchor>; },
    h3({ children, ...rest }) { return <HeadingWithAnchor level={3} {...rest}>{children}</HeadingWithAnchor>; },
    // Wrap fenced code blocks with a "load into editor" button
    pre({ children, ...rest }) {
      // Hide level blocks entirely (content is loaded via useEffect)
      const child = React.Children.toArray(children)[0];
      if (React.isValidElement(child)) {
        const cls = (child.props as { className?: string }).className ?? "";
        if (cls.includes("language-level")) return null;
      }
      return (
        <div className="md-code-wrapper">
          <pre {...rest}>{children}</pre>
        </div>
      );
    },
    code({ className, children, ...rest }) {
      const isLua = className?.includes("language-lua");
      const isLevel = className?.includes("language-level");

      // Hide level blocks (they are loaded via useEffect)
      if (isLevel) return null;

      // Inline code (no className from highlight)
      if (!className) {
        return (
          <code className="md-inline-code" {...rest}>
            {children}
          </code>
        );
      }

      return (
        <>
          {isLua && (
            <button
              type="button"
              className="md-load-btn"
              onClick={() => handleLoadCode(extractText(children))}
              title="Code in den Editor laden"
            >
              ▶ In Editor laden
            </button>
          )}
          <code className={className} {...rest}>
            {children}
          </code>
        </>
      );
    },
  };

  /* Navigation button helper */
  const navBtn = (nav: { title: string; onNavigate: () => void } | null | undefined, label: string, align: "left" | "right") => {
    if (!nav) return <span />;
    return (
      <button
        type="button"
        onClick={nav.onNavigate}
        className="md-nav-link"
        style={{ textAlign: align, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
      >
        {align === "left" ? `\u2190 ${label}: ${nav.title}` : `${label}: ${nav.title} \u2192`}
      </button>
    );
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Escape" && tocOpen) {
          setTocOpen(false);
        } else if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          setFontSize((s) => Math.min(24, s + 1));
        } else if (e.key === "-") {
          e.preventDefault();
          setFontSize((s) => Math.max(10, s - 1));
        } else if (e.key === "0") {
          e.preventDefault();
          setFontSize(15);
        }
      }}
      className="flex-1 min-w-0 h-full flex flex-col overflow-hidden transition-colors duration-200 outline-none"
      style={{
        position: "relative",
        zIndex: 0,
        backgroundColor: ui.surface2,
        color: ui.fg,
        ["--md-bg" as string]: ui.surface2,
        ["--md-fg" as string]: ui.fg,
        ["--md-code-bg" as string]: ui.bg,
        ["--md-border" as string]: ui.border,
        ["--md-muted" as string]: ui.muted,
        ["--md-link" as string]: ui.isDark ? "#60a5fa" : "#2563eb",
        ["--md-btn-bg" as string]: ui.btnNeutral,
        ["--md-btn-fg" as string]: ui.btnNeutralText,
        ["--md-btn-hover" as string]: ui.btnNeutralHover,
        ["--scrollbar-thumb" as string]: ui.handle,
        ["--scrollbar-thumb-hover" as string]: ui.border,
      }}
    >
      {/* Navigation top */}
      <div className="md-nav-bar" style={{ borderBottom: `1px solid ${ui.border}`, position: "relative" }}>
        {/* Hamburger / close toggle */}
        {toc && toc.length > 0 && (
          <button
            type="button"
            onClick={() => setTocOpen((v) => !v)}
            className="md-nav-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 8px", font: "inherit", fontSize: 18, lineHeight: 1 }}
            title="Inhaltsverzeichnis"
          >
            {tocOpen ? "✕" : "☰"}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {/* Font size controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button
            type="button"
            onClick={() => setFontSize((s) => Math.max(10, s - 1))}
            className="md-nav-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 4px", font: "inherit", fontSize: 16, lineHeight: 1 }}
            title="Schrift verkleinern"
          >
            A−
          </button>
          <button
            type="button"
            onClick={() => setFontSize(15)}
            className="md-nav-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", font: "inherit", fontSize: 11, lineHeight: 1, opacity: fontSize === 15 ? 0.4 : 1 }}
            title="Schriftgröße zurücksetzen"
          >
            {fontSize}px
          </button>
          <button
            type="button"
            onClick={() => setFontSize((s) => Math.min(24, s + 1))}
            className="md-nav-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: "0 4px", font: "inherit", fontSize: 16, lineHeight: 1 }}
            title="Schrift vergrößern"
          >
            A+
          </button>
        </div>
        <span style={{ flex: 1 }} />
        {/* Source toggle */}
        <button
          type="button"
          onClick={() => setShowSource((v) => !v)}
          className="md-nav-link"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0 8px",
            font: "inherit",
            fontSize: 14,
            lineHeight: 1,
            opacity: showSource ? 1 : 0.6,
          }}
          title={showSource ? "Gerenderte Ansicht" : "Markdown-Quelltext anzeigen"}
        >
          {showSource ? "Aa" : "M↓"}
        </button>
      </div>

      {/* TOC sidebar + Content */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {tocOpen && toc && toc.length > 0 && (
          <nav
            className="themed-scrollbar"
            style={{
              width: 240,
              flexShrink: 0,
              overflowY: "auto",
              borderRight: `1px solid ${ui.border}`,
              background: ui.surface,
              padding: "4px 0",
              ["--scrollbar-thumb" as string]: ui.handle,
              ["--scrollbar-thumb-hover" as string]: ui.border,
            }}
          >
            {toc.map((item, i) => (
              <React.Fragment key={i}>
                <button
                  type="button"
                  onClick={() => item.onSelect()}
                  className="md-toc-item"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 14px",
                    background: item.active ? (ui.isDark ? "#2563eb" : "#dbeafe") : "transparent",
                    color: item.active ? (ui.isDark ? "#fff" : "#1e40af") : ui.fg,
                    fontWeight: item.active ? 600 : 400,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 14,
                  }}
                >
                  {item.title}
                </button>
                {item.headings && item.headings.map((h, j) => (
                  <button
                    key={`h-${j}`}
                    type="button"
                    onClick={() => {
                      if (item.active) {
                        scrollToHeading(h.id);
                        onHashChange?.(h.id);
                      } else {
                        pendingScrollRef.current = h.id;
                        item.onSelect();
                      }
                    }}
                    className="md-toc-item md-toc-heading"
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      paddingLeft: h.level === 1 ? 28 : 42,
                      paddingRight: 14,
                      paddingTop: 4,
                      paddingBottom: 4,
                      background: "transparent",
                      color: ui.muted,
                      fontWeight: h.level === 1 ? 500 : 400,
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: h.level === 1 ? 13 : 12,
                    }}
                  >
                    {h.text}
                  </button>
                ))}
              </React.Fragment>
            ))}
          </nav>
        )}

      {/* Content */}
      <div
        ref={contentRef}
        className="flex-1 min-w-0 overflow-y-auto themed-scrollbar px-6 py-4"
        style={{ fontSize }}
        onClick={(e) => {
          // Intercept clicks on #fragment links and scroll within the panel
          const target = (e.target as HTMLElement).closest("a");
          if (!target) return;
          const href = target.getAttribute("href");
          if (!href || !href.startsWith("#")) return;
          e.preventDefault();
          const id = href.slice(1);
          const el = document.getElementById(id);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          onHashChange?.(id);
        }}
      >
        {error && (
          <div className="text-red-500 p-4">
            Fehler beim Laden: {error}
          </div>
        )}
        {markdown === null && !error && (
          <div className="text-neutral-500 p-4">Lade Tutorial…</div>
        )}
        {markdown !== null && !showSource && (
          <div className={`markdown-body ${ui.isDark ? "hljs-dark" : "hljs-light"}`}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeHighlight]}
              components={components}
              urlTransform={(url) => {
                // Fragment-only links stay as-is (in-page anchors)
                if (url.startsWith("#")) return url;
                if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) {
                  return url;
                }
                // Resolve relative to the directory containing the .md file
                const filePath = `${baseDir}/${src}`;
                const dir = filePath.substring(0, filePath.lastIndexOf("/") + 1);
                return `${basePath}/${dir}${url}`;
              }}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        )}
        {markdown !== null && showSource && (
          <pre
            className="themed-scrollbar"
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: fontSize - 1,
              lineHeight: 1.6,
              color: ui.fg,
              margin: 0,
              padding: 0,
              background: "transparent",
              userSelect: "text",
            }}
          >{markdown}</pre>
        )}
      </div>
      </div>

      {/* Navigation bottom */}
      {(navPrev || navNext) && (
        <div className="md-nav-bar" style={{ borderTop: `1px solid ${ui.border}` }}>
          {navBtn(navPrev, "Zurück", "left")}
          {navBtn(navNext, "Weiter", "right")}
        </div>
      )}
    </div>
  );
}