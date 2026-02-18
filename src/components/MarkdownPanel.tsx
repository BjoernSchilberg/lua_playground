"use client";

import { useEffect, useState, useCallback, type ComponentProps, type ReactNode } from "react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
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
  /** Filename inside public/tutorial/, e.g. "einfuehrung_lua01.md" */
  src: string;
  ui: UiColors;
  /** Called when user clicks "In Editor laden" on a Lua code block */
  onLoadCode: (code: string) => void;
  /** Navigation to previous/next tutorial */
  navPrev?: TutorialEntry | null;
  navNext?: TutorialEntry | null;
  /** Base URL for navigation links (default: "tutorial") */
  navBase?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function MarkdownPanel({
  src,
  ui,
  onLoadCode,
  navPrev,
  navNext,
  navBase = "tutorial",
}: MarkdownPanelProps) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Fetch the .md file */
  useEffect(() => {
    setMarkdown(null);
    setError(null);
    fetch(`${basePath}/tutorial/${src}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(setMarkdown)
      .catch((e) => setError(e.message));
  }, [src]);

  /* Stable callback ref for code blocks */
  const handleLoadCode = useCallback(
    (code: string) => {
      onLoadCode(code);
    },
    [onLoadCode],
  );

  /* Custom components for ReactMarkdown */
  const components: ComponentProps<typeof ReactMarkdown>["components"] = {
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

  /* Navigation link helper */
  const navLink = (entry: TutorialEntry | null | undefined, label: string, align: "left" | "right") => {
    if (!entry) return <span />;
    return (
      <a
        href={`${basePath}/${navBase}/${entry.slug}`}
        className="md-nav-link"
        style={{ textAlign: align }}
      >
        {align === "left" ? `← ${label}: ${entry.title}` : `${label}: ${entry.title} →`}
      </a>
    );
  };

  return (
    <div
      className="flex-1 min-w-0 h-full flex flex-col overflow-hidden transition-colors duration-200"
      style={{
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
      {(navPrev || navNext) && (
        <div className="md-nav-bar" style={{ borderBottom: `1px solid ${ui.border}` }}>
          {navLink(navPrev, "Zurück", "left")}
          {navLink(navNext, "Weiter", "right")}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto themed-scrollbar px-6 py-4">
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
              rehypePlugins={[rehypeHighlight]}
              components={components}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* Navigation bottom */}
      {(navPrev || navNext) && (
        <div className="md-nav-bar" style={{ borderTop: `1px solid ${ui.border}` }}>
          {navLink(navPrev, "Zurück", "left")}
          {navLink(navNext, "Weiter", "right")}
        </div>
      )}
    </div>
  );
}
