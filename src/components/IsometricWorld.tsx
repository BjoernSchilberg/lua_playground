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
  /** Whether the speech is being played as audio (skip auto-dismiss timer) */
  speechAudio?: boolean;
  /** Called when the speech bubble auto-dismisses */
  onSpeechDone?: () => void;
  /** Speed factor for animation (1 = normal) */
  speed?: number;
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
  speechAudio,
  onSpeechDone,
  speed = 1,
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
  /** Source position of current animation (for stable z-ordering) */
  const animSourceRef = useRef({ row: hathiRow, col: hathiCol });
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
    prevPosRef.current = { row: hathiRow, col: hathiCol };

    // No change — just sync (e.g. direction-only update)
    if (prev.row === hathiRow && prev.col === hathiCol) {
      setAnimRow(hathiRow);
      setAnimCol(hathiCol);
      animSourceRef.current = { row: hathiRow, col: hathiCol };
      return;
    }

    // Large jump (level reset) — snap instantly, don't animate
    const dr = Math.abs(hathiRow - prev.row);
    const dc = Math.abs(hathiCol - prev.col);
    if (dr > 1 || dc > 1 || dr + dc > 1) {
      cancelAnimationFrame(rafRef.current);
      setAnimRow(hathiRow);
      setAnimCol(hathiCol);
      animSourceRef.current = { row: hathiRow, col: hathiCol };
      return;
    }

    // Remember source position for stable z-ordering during animation
    animSourceRef.current = { row: prev.row, col: prev.col };

    const startRow = animRow;
    const startCol = animCol;
    const duration = Math.max(10, Math.round(150 / speed));
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

  const { tilesBefore, tilesAfter, hathiSvgContent, hathiX, hathiY, viewBox, vbY: viewBoxTop } = useMemo(() => {
    if (!level || !svgsLoaded || level.length === 0) {
      return {
        tilesBefore: [] as React.ReactNode[],
        tilesAfter: [] as React.ReactNode[],
        hathiSvgContent: "",
        hathiX: 0,
        hathiY: 0,
        viewBox: "-200 -200 400 400",
        vbY: -200,
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
    // Use max(source, target) depth + offset for z-sorting.
    // This ensures Hathi is always drawn ON TOP of both the tile it's leaving
    // and the tile it's walking to, regardless of movement direction.
    // With animated depth alone, a crossover pop was visible mid-animation;
    // with target depth alone, the opposite direction had a pop at the start.
    const src = animSourceRef.current;
    const hpSrc = project(src.row, src.col, centerRow, centerCol, viewStep);
    const hpTgt = project(hathiRow, hathiCol, centerRow, centerCol, viewStep);
    const sortDepth = Math.max(hpSrc.depth, hpTgt.depth) + 0.15;
    const hathiItem = {
      x: hp.x,
      y: hp.y,
      depth: sortDepth,
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
      vbY,
    };
  }, [level, svgsLoaded, viewStep, animRow, animCol, hathiRow, hathiCol, hathiDir]);

  /* ---------------------------------------------------------------- */
  /*  Auto-dismiss speech bubble                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!speech || speechAudio) return; // audio: dismissed by utterance.onend
    const timer = setTimeout(() => onSpeechDone?.(), 7500); // 7.5sec.
    return () => clearTimeout(timer);
  }, [speech, speechAudio, onSpeechDone]);

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
        {speech && (() => {
          const bubbleW = 240;
          const tailTipY = hathiY + 83;
          const foX = hathiX + SVG_W / 2 - bubbleW / 2;
          // Clamp top to viewBox so bubble stays inside the panel
          const minY = viewBoxTop + 4;
          const idealFoY = tailTipY - 300;
          const foY = Math.max(idealFoY, minY);
          const foH = tailTipY - foY;
          return (
            <foreignObject x={foX} y={foY} width={bubbleW} height={foH} style={{ overflow: "visible", pointerEvents: "none" }}>
              <div style={{
                width: "100%", height: "100%",
                display: "flex", flexDirection: "column",
                justifyContent: "flex-end", alignItems: "center",
              }}>
                <div className="speech-bubble" style={{
                  background: "white",
                  border: "3px solid #333",
                  borderRadius: "12px",
                  padding: "10px 12px",
                  maxWidth: `${bubbleW - 20}px`,
                  maxHeight: `${foH - 30}px`,
                  fontSize: "16px",
                  fontFamily: "system-ui, sans-serif",
                  fontWeight: "bold",
                  color: "#333",
                  textAlign: "left",
                  overflowWrap: "break-word",
                  wordBreak: "break-word",
                  pointerEvents: "auto",
                }}>
                  {speech}
                </div>
                {/* Tail triangle via CSS borders */}
                <div style={{
                  width: 0, height: 0,
                  borderLeft: "8px solid transparent",
                  borderRight: "8px solid transparent",
                  borderTop: "10px solid #333",
                  position: "relative",
                }}>
                  <div style={{
                    position: "absolute",
                    top: "-12px",
                    left: "-6px",
                    width: 0, height: 0,
                    borderLeft: "6px solid transparent",
                    borderRight: "6px solid transparent",
                    borderTop: "8px solid white",
                  }} />
                </div>
              </div>
            </foreignObject>
          );
        })()}
        {tilesAfter}
      </svg>

      {/* Compass rose — bottom-right corner, click to rotate */}
      <svg
        width="65"
        height="40"
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
          fill="rgba(0,0,0,0.25)"
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
