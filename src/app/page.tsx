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

const World3D = dynamic(() => import("@/components/world3d"), {
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
      rightPanel={(ctx) => {
        if (!ctx.showWorld) return null;
        const WorldComponent = ctx.worldMode === "3d" ? World3D : IsometricWorld;
        return (
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
        );
      }}
    />
  );
}

