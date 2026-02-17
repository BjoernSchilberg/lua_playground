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
  s: "squash",
  o: "tomato",
};

/** Tiles that are objects placed ON grass (need a grass base underneath) */
const OBJECT_TILES = new Set(["r", "t", "b", "c", "F", "s", "o"]);

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
  /*  Mouse interaction: drag = rotate 90° steps, wheel = zoom        */
  /* ---------------------------------------------------------------- */

  const dragRef = useRef<{ startX: number; accum: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, accum: 0 };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    dragRef.current.accum = dx;
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return;
    const dx = dragRef.current.accum;
    if (dx > 60) {
      setViewStep((s) => ((s - 1) % 4 + 4) % 4);
    } else if (dx < -60) {
      setViewStep((s) => (s + 1) % 4);
    }
    dragRef.current = null;
  }, []);

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

  const { elements, viewBox } = useMemo(() => {
    if (!level || !svgsLoaded || level.length === 0) {
      return { elements: [] as React.ReactNode[], viewBox: "-200 -200 400 400" };
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

    // Add hathi
    const displayDir = ((hathiDir - viewStep) % 4 + 4) % 4;
    const hp = project(animRow, animCol, centerRow, centerCol, viewStep);
    items.push({
      key: "hathi",
      x: hp.x,
      y: hp.y,
      depth: hp.depth + 0.5,
      svgName: `hathi_${displayDir}`,
    });

    // Sort by depth
    items.sort((a, b) => a.depth - b.depth);

    // Compute bounding box
    const halfW = SVG_W / 2;
    const halfH = SVG_H / 2;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const item of items) {
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

    // Build SVG elements — each tile is a nested <svg> with the original viewBox
    const els = items.map((item) => (
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
    ));

    return {
      elements: els,
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    };
  }, [level, svgsLoaded, viewStep, animRow, animCol, hathiDir]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div
      ref={containerRef}
      className="flex-1 min-w-0 h-full overflow-hidden"
      style={{ backgroundColor: bgColor, cursor: "grab" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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
        {elements}
      </svg>
    </div>
  );
}
