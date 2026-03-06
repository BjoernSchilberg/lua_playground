"use client";

import { useMemo } from "react";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Ground tiles — colors matched to SVG sprites                       */
/* ------------------------------------------------------------------ */

/** Top surface color (from SVG fill) */
const TOP_COLORS: Record<string, string> = {
  g: "green",       // grass.svg fill
  w: "dodgerblue",  // water.svg fill
  f: "#7a7a7a",     // stone
  x: "#2a2a2a",     // void
};

/** Side color (slightly darker for depth) */
const SIDE_COLORS: Record<string, string> = {
  g: "#006600",     // darker green for depth band
  w: "#1070cc",     // darker blue for depth
  f: "#5e5e5e",
  x: "#1a1a1a",
};

const BLOCK_H = 0.25;
const WATER_Y = -0.06;

/* Shared box geometry */
const GEO = new THREE.BoxGeometry(1, BLOCK_H, 1);

interface GroundTileProps {
  code: string;
  x: number;
  z: number;
}

export default function GroundTile({ code, x, z }: GroundTileProps) {
  const topColor = TOP_COLORS[code] ?? TOP_COLORS.g;
  const sideColor = SIDE_COLORS[code] ?? SIDE_COLORS.g;
  const isWater = code === "w";

  /* BoxGeometry face order: +x, -x, +y, -y, +z, -z */
  const materials = useMemo(() => {
    const side = new THREE.MeshLambertMaterial({ color: sideColor });
    const top = new THREE.MeshLambertMaterial({ color: topColor });
    const bottom = new THREE.MeshLambertMaterial({ color: sideColor });
    if (isWater) {
      for (const m of [side, top, bottom]) {
        m.transparent = true;
        m.opacity = 0.75;
      }
    }
    return [side, side, top, bottom, side, side];
  }, [topColor, sideColor, isWater]);

  return (
    <mesh
      position={[x, isWater ? WATER_Y : 0, z]}
      receiveShadow
      geometry={GEO}
      material={materials}
    />
  );
}
