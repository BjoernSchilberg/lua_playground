"use client";

import dynamic from "next/dynamic";
import PlaygroundLayout from "@/components/PlaygroundLayout";

const IsometricWorld = dynamic(() => import("@/components/IsometricWorld"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-neutral-500">
      Loading world…
    </div>
  ),
});

export default function HomePage() {
  return (
    <PlaygroundLayout
      rightPanel={(ctx) =>
        ctx.showWorld ? (
          <IsometricWorld
            level={ctx.worldLevel}
            hathiRow={ctx.hathiPos.row}
            hathiCol={ctx.hathiPos.col}
            hathiDir={ctx.hathiPos.dir}
            bgColor={ctx.ui.surface2}
          />
        ) : null
      }
    />
  );
}

