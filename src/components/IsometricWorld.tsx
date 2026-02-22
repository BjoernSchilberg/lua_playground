"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import basePath from "@/lib/basePath";

/* ------------------------------------------------------------------ */
/*  Tile code → SVG name mapping                                      */
/* ------------------------------------------------------------------ */

const TILE_FILE: Record<string, string> = {
  g: "grass",
  w: "water",
  f: "filled",
  r: "rock",
  t: "tree",
  b: "bananas",
  c: "crate",
  F: "flag",
  G: "flag_hoisted",
  s: "squash",
  o: "tomato",
};

/** Tiles that are objects placed ON grass (need a grass base underneath) */
const OBJECT_TILES = new Set(["r", "t", "b", "c", "F", "G", "s", "o"]);

/**
 * Hathi logical direction (0=N,1=E,2=S,3=W) → SVG file index.
 * hathi_0 = forward, hathi_1 = right, hathi_2 = backward, hathi_3 = left
 * Cycling 0→1→2→3 alternates the scale-flip on each turn for smooth 90° visuals.
 */
const HATHI_FILE_INDEX = [3, 0, 1, 2];

/* ------------------------------------------------------------------ */
/*  Isometric constants                                               */
/*  All SVGs share viewBox="-80 -160 160 320"                         */
/* ------------------------------------------------------------------ */

const ISO_TILE_W = 128; // diamond width
const ISO_TILE_H = 64;  // diamond height
const SVG_VB = "-80 -160 160 320";
const SVG_W = 160;
const SVG_H = 320;

/* ------------------------------------------------------------------ */
/*  Compass rose geometry (derived from arrow_*.svg files)             */
/*  Arrow paths relative to origin; ellipse rx=56 ry=28               */
/* ------------------------------------------------------------------ */

/** Arrow triangle paths for 4 screen directions: ↗ ↘ ↙ ↖ */
const COMPASS_ARROWS = [
  "M 32 -16 L -48 16 L -32 24 Z",   // upper-right  (screen ↗)
  "M 32 16 L -48 -16 L -32 -24 Z",  // lower-right  (screen ↘)
  "M -32 16 L 48 -16 L 32 -24 Z",   // lower-left   (screen ↙)
  "M -32 -16 L 48 16 L 32 24 Z",    // upper-left   (screen ↖)
];

/** Label positions just outside the ellipse tips */
const COMPASS_LABEL_POS = [
  { x: 58, y: -22, anchor: "start" as const },   // ↗
  { x: 58, y: 30, anchor: "start" as const },    // ↘
  { x: -58, y: 30, anchor: "end" as const },     // ↙
  { x: -58, y: -22, anchor: "end" as const },    // ↖
];

const COMPASS_DIRS = ["N", "E", "S", "W"];

/* ------------------------------------------------------------------ */
/*  Isometric projection with 90° step rotation                       */
/* ------------------------------------------------------------------ */

function project(
  row: number,
  col: number,
  centerRow: number,
  centerCol: number,
  viewStep: number,
): { x: number; y: number; depth: number } {
  const dr = row - centerRow;
  const dc = col - centerCol;

  let rr: number, rc: number;
  switch (((viewStep % 4) + 4) % 4) {
    case 1:  rr =  dc; rc = -dr; break;
    case 2:  rr = -dr; rc = -dc; break;
    case 3:  rr = -dc; rc =  dr; break;
    default: rr =  dr; rc =  dc; break;
  }

  return {
    x: (rc - rr) * (ISO_TILE_W / 2),
    y: (rc + rr) * (ISO_TILE_H / 2),
    depth: rc + rr,
  };
}

/* ------------------------------------------------------------------ */
/*  SVG content cache — fetch once, extract inner content              */
/* ------------------------------------------------------------------ */

const svgCache: Record<string, string> = {};
const svgPromises: Record<string, Promise<void>> = {};

function loadSvg(name: string): Promise<void> {
  const existing = svgPromises[name];
  if (existing) return existing;
  svgPromises[name] = fetch(`${basePath}/hathi/${name}.svg`)
    .then((r) => r.text())
    .then((text) => {
      // Extract everything between <svg ...> and </svg>
      const m = text.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      svgCache[name] = m ? m[1] : text;
    })
    .catch(() => {
      svgCache[name] = "";
    });
  return svgPromises[name];
}

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

export interface IsometricWorldProps {
  level: string[] | null;
  hathiRow: number;
  hathiCol: number;
  hathiDir: number;
  bgColor: string;
  /** Speech bubble text shown above Hathi (null = hidden) */
  speech?: string | null;
  /** Called when the speech bubble auto-dismisses */
  onSpeechDone?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function IsometricWorld({
  level,
  hathiRow,
  hathiCol,
  hathiDir,
  bgColor,
  speech,
  onSpeechDone,
}: IsometricWorldProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  /* SVG loading state */
  const [svgsLoaded, setSvgsLoaded] = useState(false);

  /* 90° view step (0–3) — triggers re-render */
  const [viewStep, setViewStep] = useState(0);

  /* Zoom multiplier */
  const [zoom, setZoom] = useState(1);

  /* Hathi animation */
  const [animRow, setAnimRow] = useState(hathiRow);
  const [animCol, setAnimCol] = useState(hathiCol);
  const prevPosRef = useRef({ row: hathiRow, col: hathiCol });
  const rafRef = useRef(0);

  /* ---------------------------------------------------------------- */
  /*  Load all SVGs on mount / level change                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!level) return;
    const needed = new Set<string>();
    needed.add("grass");
    for (const rowStr of level) {
      for (const ch of rowStr) {
        const f = TILE_FILE[ch];
        if (f) needed.add(f);
        // Preload hoisted variant so raiseFlag() works instantly
        if (ch === "F") needed.add("flag_hoisted");
      }
    }
    for (let d = 0; d < 4; d++) needed.add(`hathi_${d}`);

    Promise.all([...needed].map(loadSvg)).then(() => setSvgsLoaded(true));
  }, [level]);

  /* ---------------------------------------------------------------- */
  /*  Animate hathi position                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const prev = prevPosRef.current;
    if (prev.row === hathiRow && prev.col === hathiCol) {
      setAnimRow(hathiRow);
      setAnimCol(hathiCol);
      return;
    }
    prevPosRef.current = { row: hathiRow, col: hathiCol };

    const startRow = animRow;
    const startCol = animCol;
    const duration = 150;
    const t0 = performance.now();

    function tick(now: number) {
      const p = Math.min((now - t0) / duration, 1);
      const ease = 1 - (1 - p) * (1 - p); // ease-out quad
      setAnimRow(startRow + (hathiRow - startRow) * ease);
      setAnimCol(startCol + (hathiCol - startCol) * ease);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    }

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hathiRow, hathiCol]);

  /* ---------------------------------------------------------------- */
  /*  Mouse interaction: wheel = zoom, compass click = rotate         */
  /* ---------------------------------------------------------------- */

  const rotateCW  = useCallback(() => setViewStep((s) => (s + 1) % 4), []);
  const rotateCCW = useCallback(() => setViewStep((s) => ((s - 1) % 4 + 4) % 4), []);

  useEffect(() => {
    const div = containerRef.current;
    if (!div) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(0.3, Math.min(5, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    div.addEventListener("wheel", onWheel, { passive: false });
    return () => div.removeEventListener("wheel", onWheel);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Build SVG elements                                              */
  /* ---------------------------------------------------------------- */

  const { tilesBefore, tilesAfter, hathiSvgContent, hathiX, hathiY, viewBox } = useMemo(() => {
    if (!level || !svgsLoaded || level.length === 0) {
      return {
        tilesBefore: [] as React.ReactNode[],
        tilesAfter: [] as React.ReactNode[],
        hathiSvgContent: "",
        hathiX: 0,
        hathiY: 0,
        viewBox: "-200 -200 400 400",
      };
    }

    const rows = level.length;
    const cols = Math.max(...level.map((r) => r.length));
    const centerRow = (rows - 1) / 2;
    const centerCol = (cols - 1) / 2;

    // Collect all items with depth for z-sorting
    interface Item {
      key: string;
      x: number;
      y: number;
      depth: number;
      svgName: string;
    }

    const items: Item[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < level[r].length; c++) {
        const ch = level[r][c];
        const tileName = TILE_FILE[ch];
        if (!tileName) continue;

        const p = project(r, c, centerRow, centerCol, viewStep);

        // Always place grass base for object tiles, or grass/water/filled as-is
        if (OBJECT_TILES.has(ch)) {
          items.push({
            key: `grass-${r}-${c}`,
            x: p.x,
            y: p.y,
            depth: p.depth,
            svgName: "grass",
          });
          items.push({
            key: `obj-${r}-${c}`,
            x: p.x,
            y: p.y,
            depth: p.depth + 0.1,
            svgName: tileName,
          });
        } else {
          items.push({
            key: `tile-${r}-${c}`,
            x: p.x,
            y: p.y,
            depth: p.depth,
            svgName: tileName,
          });
        }
      }
    }

    // Hathi — compute position and SVG name (separate from tile items for animation)
    const displayDir = (hathiDir + viewStep) % 4;
    const hp = project(animRow, animCol, centerRow, centerCol, viewStep);
    const hathiItem = {
      x: hp.x,
      y: hp.y,
      depth: hp.depth + 0.5,
      svgName: `hathi_${HATHI_FILE_INDEX[displayDir]}`,
    };

    // Sort tiles by depth
    items.sort((a, b) => a.depth - b.depth);

    // Compute bounding box (include hathi)
    const halfW = SVG_W / 2;
    const halfH = SVG_H / 2;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const item of [...items, hathiItem]) {
      minX = Math.min(minX, item.x - halfW);
      maxX = Math.max(maxX, item.x + halfW);
      minY = Math.min(minY, item.y - halfH);
      maxY = Math.max(maxY, item.y + halfH);
    }

    const pad = 20;
    const vbX = minX - pad;
    const vbY = minY - pad;
    const vbW = (maxX - minX) + 2 * pad;
    const vbH = (maxY - minY) + 2 * pad;

    // Split tiles into before/after hathi by depth for correct z-ordering
    const beforeHathi: typeof items = [];
    const afterHathi: typeof items = [];
    for (const item of items) {
      if (item.depth <= hathiItem.depth) {
        beforeHathi.push(item);
      } else {
        afterHathi.push(item);
      }
    }

    const makeTileSvg = (item: typeof items[0]) => (
      <svg
        key={item.key}
        x={item.x - halfW}
        y={item.y - halfH}
        width={SVG_W}
        height={SVG_H}
        viewBox={SVG_VB}
        overflow="visible"
        dangerouslySetInnerHTML={{ __html: svgCache[item.svgName] || "" }}
      />
    );

    return {
      tilesBefore: beforeHathi.map(makeTileSvg),
      tilesAfter: afterHathi.map(makeTileSvg),
      hathiSvgContent: (svgCache[hathiItem.svgName] ?? "") as string,
      hathiX: hathiItem.x - halfW,
      hathiY: hathiItem.y - halfH,
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    };
  }, [level, svgsLoaded, viewStep, animRow, animCol, hathiDir]);

  /* ---------------------------------------------------------------- */
  /*  Auto-dismiss speech bubble                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!speech) return;
    const timer = setTimeout(() => onSpeechDone?.(), 1800);
    return () => clearTimeout(timer);
  }, [speech, onSpeechDone]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div
      ref={containerRef}
      className="flex-1 min-w-0 h-full overflow-hidden relative"
      style={{ backgroundColor: bgColor }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: "center center",
        }}
      >
        {tilesBefore}
        <svg
          key="hathi"
          x={hathiX}
          y={hathiY}
          width={SVG_W}
          height={SVG_H}
          viewBox={SVG_VB}
          overflow="visible"
          dangerouslySetInnerHTML={{ __html: hathiSvgContent }}
        />
        {/* Speech bubble above Hathi */}
        {speech && (
          <g transform={`translate(${hathiX + SVG_W / 2}, ${hathiY + 75})`}>
            <rect
              x="-60" y="-42" width="120" height="36" rx="12" ry="12"
              fill="white" stroke="#333" strokeWidth="10"
            />
            {/* Tail triangle pointing down */}
            <polygon points="-6,-6 6,-6 0,8" fill="white" stroke="#333" strokeWidth="1" strokeLinejoin="round" />
            {/* White rect to cover the tail's top stroke overlapping the bubble */}
            <rect x="-7" y="-10" width="14" height="6" fill="white" />
            <text
              x="0" y="-24"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="18"
              fontFamily="system-ui, sans-serif"
              fontWeight="bold"
              fill="#333"
            >
              {speech}
            </text>
          </g>
        )}
        {tilesAfter}
      </svg>

      {/* Compass rose — bottom-right corner, click to rotate */}
      <svg
        width="130"
        height="80"
        viewBox="-80 -38 160 76"
        style={{
          position: "absolute",
          right: 10,
          bottom: 10,
          filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.4))",
          cursor: "pointer",
        }}
      >
        {/* semi-transparent backdrop */}
        <rect
          x="-78" y="-36" width="156" height="72" rx="10" ry="10"
          fill="rgba(0,0,0,0.45)"
        />

        {/* Clickable left half → rotate CCW */}
        <rect
          x="-78" y="-36" width="78" height="72" rx="10" ry="10"
          fill="transparent"
          onClick={rotateCCW}
          style={{ cursor: "pointer" }}
        />
        {/* Clickable right half → rotate CW */}
        <rect
          x="0" y="-36" width="78" height="72" rx="10" ry="10"
          fill="transparent"
          onClick={rotateCW}
          style={{ cursor: "pointer" }}
        />

        {/* isometric ellipse */}
        <ellipse cx="0" cy="0" rx="50" ry="25"
          fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"
          style={{ pointerEvents: "none" }}
        />

        {/* 4 arrow triangles + labels */}
        {COMPASS_ARROWS.map((d, i) => {
          const label = COMPASS_DIRS[((i - viewStep) % 4 + 4) % 4];
          const isNorth = label === "N";
          const lp = COMPASS_LABEL_POS[i];
          const isLeft = i >= 2; // arrows 2,3 are on the left side
          return (
            <g
              key={i}
              onClick={isLeft ? rotateCCW : rotateCW}
              style={{ cursor: "pointer" }}
            >
              <path
                d={d}
                fill={isNorth ? "#e74c3c" : "rgba(255,255,255,0.5)"}
                stroke={isNorth ? "#c0392b" : "rgba(255,255,255,0.15)"}
                strokeWidth="1"
              >
                <set attributeName="fill" to="#3b82f6" begin="mouseover" end="mouseout" />
              </path>
              <text
                x={lp.x} y={lp.y}
                textAnchor={lp.anchor}
                dominantBaseline="central"
                fill={isNorth ? "#e74c3c" : "rgba(255,255,255,0.7)"}
                fontWeight={isNorth ? "bold" : "normal"}
                fontSize="16"
                fontFamily="system-ui, sans-serif"
                style={{ pointerEvents: "none" }}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
