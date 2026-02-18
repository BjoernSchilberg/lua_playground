"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PlaygroundLayout from "@/components/PlaygroundLayout";
import MarkdownPanel, { type TutorialEntry } from "@/components/MarkdownPanel";
import basePath from "@/lib/basePath";

export default function TutorialClient() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [manifest, setManifest] = useState<TutorialEntry[] | null>(null);

  useEffect(() => {
    fetch(`${basePath}/tutorial/manifest.json`)
      .then((r) => r.json())
      .then(setManifest)
      .catch(() => setManifest([]));
  }, []);

  /* Find current, previous, next entries */
  const idx = manifest?.findIndex((e) => e.slug === slug) ?? -1;
  const entry = manifest && idx >= 0 ? manifest[idx] : null;
  const navPrev = manifest && idx > 0 ? manifest[idx - 1] : null;
  const navNext = manifest && idx >= 0 && idx < (manifest?.length ?? 0) - 1 ? manifest[idx + 1] : null;

  if (manifest && !entry) {
    return (
      <div className="flex items-center justify-center h-dvh text-neutral-500 font-mono">
        Tutorial &quot;{slug}&quot; nicht gefunden.
      </div>
    );
  }

  return (
    <PlaygroundLayout
      initialCode={'-- Lade einen Code-Block aus dem Tutorial\n-- mit dem "▶ In Editor laden" Button.\n\nprint("Hallo Lua!")\n'}
      rightPanel={(ctx) =>
        entry ? (
          <MarkdownPanel
            src={entry.file}
            ui={ctx.ui}
            onLoadCode={ctx.setCode}
            navPrev={navPrev}
            navNext={navNext}
          />
        ) : (
          <div
            className="flex-1 flex items-center justify-center min-w-0 h-full"
            style={{ backgroundColor: ctx.ui.surface2, color: ctx.ui.muted }}
          >
            Lade Tutorial…
          </div>
        )
      }
    />
  );
}
