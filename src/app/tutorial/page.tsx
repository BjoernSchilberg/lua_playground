"use client";

import { useEffect, useState, useCallback } from "react";
import PlaygroundLayout from "@/components/PlaygroundLayout";
import MarkdownPanel, { type TutorialEntry } from "@/components/MarkdownPanel";
import basePath from "@/lib/basePath";

export default function TutorialPage() {
  const [manifest, setManifest] = useState<TutorialEntry[] | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    fetch(`${basePath}/tutorial/manifest.json`)
      .then((r) => r.json())
      .then((data: TutorialEntry[]) => {
        setManifest(data);
        setCurrentIdx(0);
      })
      .catch(() => setManifest([]));
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
            ui={ctx.ui}
            onLoadCode={ctx.setCode}
            navPrev={prevEntry ? { title: prevEntry.title, onNavigate: goPrev } : null}
            navNext={nextEntry ? { title: nextEntry.title, onNavigate: goNext } : null}
          />
        ) : (
          <div
            className="flex-1 flex items-center justify-center min-w-0 h-full"
            style={{ backgroundColor: ctx.ui.surface2, color: ctx.ui.muted }}
          >
            {manifest === null ? "Lade Tutorial…" : "Kein Tutorial gefunden."}
          </div>
        )
      }
    />
  );
}
