"use client";

import { useEffect, useState, useCallback, useRef, useMemo, type ComponentProps, type ReactNode } from "react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import basePath from "@/lib/basePath";
import type { UiColors } from "@/lib/uiColors";

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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
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
}: MarkdownPanelProps) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [fontSize, setFontSize] = useState(15);
  const tocRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<string | null>(null);
  const hasScrolledInitialHash = useRef(false);

  /* Close TOC on outside click */
  useEffect(() => {
    if (!tocOpen) return;
    const handler = (e: MouseEvent) => {
      if (tocRef.current && !tocRef.current.contains(e.target as Node)) {
        setTocOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [tocOpen]);

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
      const hash = window.location.hash.slice(1);
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
  const components: ComponentProps<typeof ReactMarkdown>["components"] = {
    // Give h1/h2 elements an id so we can scroll to them
    h1({ children, ...rest }) {
      const id = slugify(extractText(children));
      return <h1 id={id} {...rest}>{children}</h1>;
    },
    h2({ children, ...rest }) {
      const id = slugify(extractText(children));
      return <h2 id={id} {...rest}>{children}</h2>;
    },
    // Wrap fenced code blocks with a "load into editor" button
    pre({ children, ...rest }) {
      return (
        <div className="md-code-wrapper">
          <pre {...rest}>{children}</pre>
        </div>
      );
    },
    code({ className, children, ...rest }) {
      const isLua = className?.includes("language-lua");

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
        if (e.key === "+" || e.key === "=") {
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
        {/* Hamburger menu */}
        {toc && toc.length > 0 && (
          <div ref={tocRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setTocOpen((v) => !v)}
              className="md-nav-link"
              style={{ background: "none", border: "none", cursor: "pointer", padding: "0 8px", font: "inherit", fontSize: 18, lineHeight: 1 }}
              title="Inhaltsverzeichnis"
            >
              ☰
            </button>
            {tocOpen && (
              <div
                className="md-toc-dropdown themed-scrollbar"
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  zIndex: 50,
                  minWidth: 260,
                  maxHeight: "60vh",
                  overflowY: "auto",
                  background: ui.surface,
                  border: `1px solid ${ui.border}`,
                  borderRadius: 6,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
                  padding: "4px 0",
                }}
              >
                {toc.map((item, i) => (
                  <React.Fragment key={i}>
                    <button
                      type="button"
                      onClick={() => { item.onSelect(); setTocOpen(false); }}
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
                        font: "inherit",
                        fontSize: 14,
                      }}
                    >
                      {item.title}
                    </button>
                    {/* Show headings for this document */}
                    {item.headings && item.headings.map((h, j) => (
                      <button
                        key={`h-${j}`}
                        type="button"
                        onClick={() => {
                          if (item.active) {
                            /* Same doc: just scroll */
                            scrollToHeading(h.id);
                            onHashChange?.(h.id);
                          } else {
                            /* Different doc: navigate first, then scroll after load */
                            pendingScrollRef.current = h.id;
                            item.onSelect();
                          }
                          setTocOpen(false);
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
                          font: "inherit",
                          fontSize: h.level === 1 ? 13 : 12,
                        }}
                      >
                        {h.text}
                      </button>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
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
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto themed-scrollbar px-6 py-4"
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
        {markdown !== null && (
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