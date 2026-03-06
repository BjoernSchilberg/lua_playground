"use client";

import { useMemo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import GroundTile from "./GroundTile";
import WorldObject from "./WorldObject";
import Hathi3D from "./Hathi3D";

/* ------------------------------------------------------------------ */
/*  Tile codes that sit on top of a grass base                        */
/* ------------------------------------------------------------------ */

const OBJECT_TILES = new Set(["r", "t", "b", "c", "F", "G", "s", "o"]);

/** Ground-only tiles (rendered directly as coloured ground) */
const GROUND_TILES = new Set(["g", "w", "f", "x"]);

/* ------------------------------------------------------------------ */
/*  Grid → 3D coordinate mapping                                      */
/*                                                                     */
/*   Grid row → Z axis  (row 0 = −Z, increasing row = +Z)             */
/*   Grid col → X axis  (col 0 = −X, increasing col = +X)             */
/*   Y axis   → height  (0 = ground plane)                            */
/*   Each cell = 1×1 unit, centered on origin                         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Props — intentionally compatible with IsometricWorldProps          */
/* ------------------------------------------------------------------ */

export interface World3DProps {
  level: string[] | null;
  hathiRow: number;
  hathiCol: number;
  hathiDir: number;
  bgColor: string;
  speech?: string | null;
  speechAudio?: boolean;
  onSpeechDone?: () => void;
  speed?: number;
}

/* ------------------------------------------------------------------ */
/*  Scene contents (rendered inside Canvas)                           */
/* ------------------------------------------------------------------ */

function Scene({
  level,
  hathiRow,
  hathiCol,
  hathiDir,
  speed,
}: {
  level: string[];
  hathiRow: number;
  hathiCol: number;
  hathiDir: number;
  speed: number;
}) {
  const rows = level.length;
  const cols = Math.max(...level.map((r) => r.length));
  const centerX = (cols - 1) / 2;
  const centerZ = (rows - 1) / 2;

  /* Build tile elements */
  const { groundTiles, objectTiles } = useMemo(() => {
    const ground: React.ReactElement[] = [];
    const objects: React.ReactElement[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < level[r].length; c++) {
        const ch = level[r][c];
        const x = c - centerX;
        const z = r - centerZ;

        if (GROUND_TILES.has(ch)) {
          ground.push(<GroundTile key={`g-${r}-${c}`} code={ch} x={x} z={z} />);
        } else if (OBJECT_TILES.has(ch)) {
          /* Object tiles sit on grass */
          ground.push(<GroundTile key={`g-${r}-${c}`} code="g" x={x} z={z} />);
          objects.push(<WorldObject key={`o-${r}-${c}`} code={ch} x={x} z={z} />);
        }
      }
    }

    return { groundTiles: ground, objectTiles: objects };
  }, [level, rows, cols, centerX, centerZ]);

  /* Camera distance based on world size */
  const camDist = Math.max(rows, cols) * 0.9 + 2;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[camDist, camDist * 1.2, camDist * 0.5]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={camDist * 4}
        shadow-camera-left={-cols}
        shadow-camera-right={cols}
        shadow-camera-top={rows}
        shadow-camera-bottom={-rows}
      />
      <hemisphereLight
        args={["#b1e1ff", "#b97a20", 0.3]}
      />

      {/* Camera controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.12}
        minDistance={2}
        maxDistance={camDist * 3}
        maxPolarAngle={Math.PI / 2 - 0.05}
        target={[0, 0, 0]}
      />

      {/* Ground */}
      {groundTiles}

      {/* Objects */}
      {objectTiles}

      {/* Hathi */}
      <Hathi3D
        row={hathiRow}
        col={hathiCol}
        dir={hathiDir}
        centerX={centerX}
        centerZ={centerZ}
        speed={speed}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export default function World3D({
  level,
  hathiRow,
  hathiCol,
  hathiDir,
  bgColor,
  speed = 1,
}: World3DProps) {
  if (!level || level.length === 0) {
    return (
      <div
        className="flex-1 min-w-0 h-full flex items-center justify-center"
        style={{ backgroundColor: bgColor }}
      >
        <span style={{ color: "#888" }}>No level loaded</span>
      </div>
    );
  }

  const rows = level.length;
  const cols = Math.max(...level.map((r) => r.length));
  const camDist = Math.max(rows, cols) * 0.9 + 2;

  return (
    <div className="flex-1 min-w-0 h-full" style={{ backgroundColor: bgColor }}>
      <Canvas
        shadows
        camera={{
          position: [camDist * 0.7, camDist * 0.8, camDist * 0.7],
          fov: 45,
          near: 0.1,
          far: camDist * 10,
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <Scene
            level={level}
            hathiRow={hathiRow}
            hathiCol={hathiCol}
            hathiDir={hathiDir}
            speed={speed}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
