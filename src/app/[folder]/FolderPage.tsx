"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import PlaygroundLayout from "@/components/PlaygroundLayout";
import MarkdownPanel, { type TutorialEntry, type TocHeading, parseHeadings } from "@/components/MarkdownPanel";
import basePath from "@/lib/basePath";

export default function FolderPage() {
  const params = useParams<{ folder: string }>();
  const folder = params.folder;

  const [manifest, setManifest] = useState<TutorialEntry[] | null>(null);
  const [headingsMap, setHeadingsMap] = useState<Record<string, TocHeading[]>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const manifestRef = useRef<TutorialEntry[] | null>(null);
  /** Suppress pushState when navigating via popstate (browser back/forward) */
  const suppressPushRef = useRef(false);

  /* ---- Fetch manifest ---- */
  useEffect(() => {
    fetch(`${basePath}/${folder}/manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(async (data: TutorialEntry[]) => {
        manifestRef.current = data;

        /* Determine initial document from URL path or ?slug= query param */
        const b = basePath || "";
        const searchParams = new URLSearchParams(window.location.search);
        const querySlug = searchParams.get("slug");
        const pathAfterBase = window.location.pathname.replace(
          new RegExp(`^${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`), ""
        );
        // pathAfterBase is e.g. "tutorial/einfuehrung-lua05_01" or just "tutorial"
        const parts = pathAfterBase.split("/").filter(Boolean);
        // parts[0] = folder, parts[1] = slug (optional)
        const urlSlug = querySlug || parts[1] || null;
        let startIdx = 0;
        if (urlSlug) {
          const found = data.findIndex((e) => e.slug === urlSlug);
          if (found >= 0) startIdx = found;
        }

        setManifest(data);
        setCurrentIdx(startIdx);

        /* Clean up ?slug= query param if present, replacing with the proper path */
        if (querySlug) {
          const cleanPath = `${b}/${folder}/${data[startIdx].slug}${window.location.hash}`;
          window.history.replaceState({ idx: startIdx }, "", cleanPath);
        }

        /* Fetch all markdown files in parallel and parse headings */
        const entries = await Promise.all(
          data.map(async (entry) => {
            try {
              const r = await fetch(`${basePath}/${folder}/${entry.file}`);
              if (!r.ok) return [entry.file, []] as const;
              const md = await r.text();
              return [entry.file, parseHeadings(md)] as const;
            } catch {
              return [entry.file, []] as const;
            }
          }),
        );
        setHeadingsMap(Object.fromEntries(entries));
      })
      .catch(() => setManifest([]));
  }, [folder]);

  /* ---- Update URL when currentIdx changes ---- */
  useEffect(() => {
    if (!manifest || manifest.length === 0) return;
    const entry = manifest[currentIdx];
    if (!entry) return;
    const b = basePath || "";
    const newPath = `${b}/${folder}/${entry.slug}`;
    if (suppressPushRef.current) {
      suppressPushRef.current = false;
      return;
    }
    const currentPath = window.location.pathname;
    if (currentPath === newPath) {
      // Same path: just update state, keep existing hash
      window.history.replaceState({ idx: currentIdx }, "", newPath + window.location.hash);
    } else {
      // Different path: push new entry, clear old hash
      window.history.pushState({ idx: currentIdx }, "", newPath);
    }
  }, [currentIdx, manifest, folder]);

  /* ---- Handle browser back/forward ---- */
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (e.state && typeof e.state.idx === "number") {
        suppressPushRef.current = true;
        setCurrentIdx(e.state.idx);
      } else {
        // Try to find slug from URL
        const data = manifestRef.current;
        if (!data) return;
        const b = basePath || "";
        const pathAfterBase = window.location.pathname.replace(
          new RegExp(`^${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`), ""
        );
        const parts = pathAfterBase.split("/").filter(Boolean);
        const urlSlug = parts[1] ?? null;
        if (urlSlug) {
          const found = data.findIndex((e) => e.slug === urlSlug);
          if (found >= 0) {
            suppressPushRef.current = true;
            setCurrentIdx(found);
          }
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  /* ---- Callback to update URL hash when heading is clicked ---- */
  const handleHashChange = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.hash = id;
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  const goNext = useCallback(() => setCurrentIdx((i) => i + 1), []);
  const goPrev = useCallback(() => setCurrentIdx((i) => i - 1), []);

  const entry = manifest && manifest.length > 0 ? manifest[currentIdx] : null;
  const prevEntry = manifest && currentIdx > 0 ? manifest[currentIdx - 1] : null;
  const nextEntry = manifest && currentIdx < (manifest?.length ?? 0) - 1 ? manifest[currentIdx + 1] : null;

  return (
    <PlaygroundLayout
      initialCode={'-- Lade einen Code-Block aus dem Tutorial\n-- mit dem "▶ In Editor laden" Button.\n\nprint("Hallo Lua!")\n'}
      rightPanel={(ctx) =>
        entry ? (
          <MarkdownPanel
            src={entry.file}
            baseDir={folder}
            ui={ctx.ui}
            onLoadCode={(code) => {
              const trimmed = ctx.code.trimEnd();
              ctx.setCode(trimmed ? trimmed + "\n\n" + code : code);
            }}
            navPrev={prevEntry ? { title: prevEntry.title, onNavigate: goPrev } : null}
            navNext={nextEntry ? { title: nextEntry.title, onNavigate: goNext } : null}
            toc={manifest ? manifest.map((m, i) => ({
              title: m.title,
              active: i === currentIdx,
              onSelect: () => setCurrentIdx(i),
              headings: headingsMap[m.file] ?? [],
            })) : undefined}
            onHashChange={handleHashChange}
          />
        ) : (
          <div
            className="flex-1 flex items-center justify-center min-w-0 h-full"
            style={{ backgroundColor: ctx.ui.surface2, color: ctx.ui.muted }}
          >
            {manifest === null ? "Lade…" : "Kein Manifest gefunden."}
          </div>
        )
      }
    />
  );
}
