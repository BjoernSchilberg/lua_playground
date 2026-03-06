"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import PlaygroundLayout from "@/components/PlaygroundLayout";
import type { PlaygroundContext } from "@/components/PlaygroundLayout";
import MarkdownPanel, { type TutorialEntry, type TocHeading, parseHeadings } from "@/components/MarkdownPanel";
import basePath from "@/lib/basePath";
import { parseSolution, checkSolution, type ParsedSolution, type CheckResult } from "@/lib/solutionChecker";
import Confetti from "@/components/Confetti";
import type { WorkerState } from "@/lib/protocol";

const IsometricWorld = dynamic(() => import("@/components/IsometricWorld"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-neutral-500">
      Loading world…
    </div>
  ),
});

const World3D = dynamic(() => import("@/components/world3d"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-neutral-500">
      Loading world…
    </div>
  ),
});

/* ------------------------------------------------------------------ */
/*  Solution checker watcher (rendered inside render prop)             */
/* ------------------------------------------------------------------ */

function SolutionWatcher({
  status,
  consoleLines,
  code,
  solutionData,
  setCheckResult,
  setConsoleLines,
}: {
  status: WorkerState;
  consoleLines: { text: string; isError?: boolean }[];
  code: string;
  solutionData: ParsedSolution | null;
  setCheckResult: (r: CheckResult | null) => void;
  setConsoleLines: React.Dispatch<React.SetStateAction<{ text: string; isError?: boolean }[]>>;
}) {
  const prevStatusRef = useRef<WorkerState>(status);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === "running") {
      setCheckResult(null);
      return;
    }

    if (prev === "running" && status === "idle" && solutionData && solutionData.solutions.length > 0) {
      const output = consoleLines
        .filter((l) => !l.isError)
        .map((l) => l.text)
        .join("");
      const result = checkSolution(code, output, solutionData);
      setCheckResult(result);

      const allMatch = result.codeMatch && (result.outputMatch === null || result.outputMatch);
      const msg = allMatch
        ? "\u2705 Lösung korrekt!\n"
        : "\u274C Noch nicht ganz richtig.\n";
      setConsoleLines((prev) => [...prev, { text: msg }]);
    }
  }, [status, consoleLines, code, solutionData, setCheckResult, setConsoleLines]);

  return null;
}

export default function FolderPage() {
  const params = useParams<{ folder: string }>();
  const folder = params.folder;

  const [manifest, setManifest] = useState<TutorialEntry[] | null>(null);
  const [headingsMap, setHeadingsMap] = useState<Record<string, TocHeading[]>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [worldPct, setWorldPct] = useState(50);
  const rightSplitRef = useRef<HTMLDivElement | null>(null);
  const manifestRef = useRef<TutorialEntry[] | null>(null);
  /** Suppress pushState when navigating via popstate (browser back/forward) */
  const suppressPushRef = useRef(false);

  /* ---- Solution checking state ---- */
  const [solutionData, setSolutionData] = useState<ParsedSolution | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);

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

  /* ---- Fetch solution file for current chapter ---- */
  const currentFile = manifest && manifest.length > 0 ? manifest[currentIdx]?.file : null;
  useEffect(() => {
    setSolutionData(null);
    setCheckResult(null);
    if (!currentFile) return;
    const m = currentFile.match(/chapter(\d+)/);
    if (!m) return;
    const solFile = `solution${m[1]}.md`;
    fetch(`${basePath}/${folder}/${solFile}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.text();
      })
      .then((md) => setSolutionData(parseSolution(md)))
      .catch(() => setSolutionData(null));
  }, [currentFile, folder]);

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

  const startWorldVDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const isTouch = "touches" in e;
    const startY = isTouch ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const container = rightSplitRef.current;
    if (!container) return;
    const totalH = container.getBoundingClientRect().height;
    const startPct = worldPct;

    const getY = (ev: MouseEvent | TouchEvent) =>
      "touches" in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const delta = getY(ev) - startY;
      const newPct = startPct + (delta / totalH) * 100;
      setWorldPct(Math.min(Math.max(newPct, 15), 85));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
  }, [worldPct]);

  const entry = manifest && manifest.length > 0 ? manifest[currentIdx] : null;
  const prevEntry = manifest && currentIdx > 0 ? manifest[currentIdx - 1] : null;
  const nextEntry = manifest && currentIdx < (manifest?.length ?? 0) - 1 ? manifest[currentIdx + 1] : null;

  return (
    <PlaygroundLayout
      initialCode={'-- Lade einen Code-Block aus dem Tutorial\n-- mit dem "▶ In Editor laden" Button.\n\nprint("Hallo Lua!")\n'}
      rightPanel={(ctx) => {
        const markdownPanel = entry ? (
          <MarkdownPanel
            src={entry.file}
            baseDir={folder}
            ui={ctx.ui}
            checkResult={checkResult}
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
            onLoadLevel={ctx.loadLevel}
          />
        ) : (
          <div
            className="flex-1 flex items-center justify-center min-w-0 h-full"
            style={{ backgroundColor: ctx.ui.surface2, color: ctx.ui.muted }}
          >
            {manifest === null ? "Lade…" : "Kein Manifest gefunden."}
          </div>
        );

        const WorldComponent = ctx.worldMode === "3d" ? World3D : IsometricWorld;

        const content = ctx.showWorld ? (
          <div ref={rightSplitRef} className="flex flex-col min-w-0 h-full flex-1">
            <div className="min-h-0" style={{ flex: `${worldPct} 0 0%` }}>
              <WorldComponent
                level={ctx.worldLevel}
                hathiRow={ctx.hathiPos.row}
                hathiCol={ctx.hathiPos.col}
                hathiDir={ctx.hathiPos.dir}
                bgColor={ctx.ui.surface2}
                speech={ctx.hathiSpeech}
                speechAudio={ctx.hathiSpeechAudio}
                onSpeechDone={() => ctx.setHathiSpeech(null)}
                speed={ctx.speed}
              />
            </div>
            <div
              onMouseDown={startWorldVDrag}
              onTouchStart={startWorldVDrag}
              className="relative h-0.5 cursor-row-resize hover:!bg-blue-500 active:!bg-blue-500 transition-colors shrink-0 touch-none before:absolute before:-top-2.5 before:left-0 before:right-0 before:h-6 before:content-[''] before:z-10"
              style={{ backgroundColor: ctx.ui.border }}
            />
            <div className="min-h-0 flex flex-col" style={{ flex: `${100 - worldPct} 0 0%` }}>
              {markdownPanel}
            </div>
          </div>
        ) : markdownPanel;

        return (
          <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0 }}>
            <SolutionWatcher
              status={ctx.status}
              consoleLines={ctx.consoleLines}
              code={ctx.code}
              solutionData={solutionData}
              setCheckResult={setCheckResult}
              setConsoleLines={ctx.setConsoleLines}
            />
            <Confetti active={checkResult !== null && checkResult.codeMatch && (checkResult.outputMatch === null || checkResult.outputMatch)} />
            {content}
          </div>
        );
      }}
    />
  );
}
