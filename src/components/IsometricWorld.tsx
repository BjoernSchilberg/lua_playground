"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Application, Container, Sprite, Assets, Texture } from "pixi.js";
import basePath from "@/lib/basePath";

/* ------------------------------------------------------------------ */
/*  Tile code → SVG filename mapping                                  */
/* ------------------------------------------------------------------ */

const TILE_FILES: Record<string, string> = {
  g: "grass.svg",
  w: "water.svg",
  f: "filled.svg",
  r: "rock.svg",
  t: "tree.svg",
  b: "bananas.svg",
  c: "crate.svg",
  F: "flag.svg",
  s: "squash.svg",
  o: "tomato.svg",
};

/** Hathi direction → SVG filename (0=N,1=E,2=S,3=W) */
const HATHI_DIR_FILES = [
  "hathi_0.svg",
  "hathi_1.svg",
  "hathi_2.svg",
  "hathi_3.svg",
];

/* ------------------------------------------------------------------ */
/*  Isometric constants                                               */
/* ------------------------------------------------------------------ */

// The SVG viewBox is "-80 -160 160 320" → tile diamond is 128×64 in the
// coordinate system; the full SVG is 160×320 to leave room for tall objects.
const ISO_TILE_W = 128; // diamond width  (2 * 64)
const ISO_TILE_H = 64;  // diamond height (2 * 32)

// SVG canvas dimensions – used for sprite sizing.
const SVG_W = 160;
const SVG_H = 320;

/** Convert grid (row, col) → screen pixel (x, y) for isometric layout */
function gridToScreen(row: number, col: number): { x: number; y: number } {
  return {
    x: (col - row) * (ISO_TILE_W / 2),
    y: (col + row) * (ISO_TILE_H / 2),
  };
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
  const appRef = useRef<Application | null>(null);
  const worldContainerRef = useRef<Container | null>(null);
  const hathiSpriteRef = useRef<Sprite | null>(null);
  const tileSpritesRef = useRef<Sprite[][]>([]);
  const texturesRef = useRef<Record<string, Texture>>({});

  /* ready = true once PixiJS app is initialised AND textures are loaded */
  const [ready, setReady] = useState(false);

  // Animation state
  const animRef = useRef<{
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    progress: number;
    duration: number;
    active: boolean;
  }>({
    fromX: 0, fromY: 0, toX: 0, toY: 0,
    progress: 0, duration: 150, active: false,
  });

  /* ---- Initialise PixiJS Application + load textures ---- */
  useEffect(() => {
    const div = containerRef.current;
    if (!div) return;

    let destroyed = false;
    const app = new Application();
    appRef.current = app;

    (async () => {
      try {
        await app.init({
          resizeTo: div,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });
        if (destroyed) return;

        div.appendChild(app.canvas);

        // World container (we scale & position this to fit the grid)
        const wc = new Container();
        wc.sortableChildren = true;
        app.stage.addChild(wc);
        worldContainerRef.current = wc;

        // Load all tile + hathi textures
        const loaded: Record<string, Texture> = {};
        for (const [code, file] of Object.entries(TILE_FILES)) {
          const url = `${basePath}/hathi/${file}`;
          try {
            loaded[`tile_${code}`] = await Assets.load<Texture>(url);
          } catch (err) {
            console.warn(`[IsometricWorld] Failed to load tile ${code}:`, err);
          }
        }
        for (let d = 0; d < 4; d++) {
          const url = `${basePath}/hathi/${HATHI_DIR_FILES[d]}`;
          try {
            loaded[`hathi_${d}`] = await Assets.load<Texture>(url);
          } catch (err) {
            console.warn(`[IsometricWorld] Failed to load hathi_${d}:`, err);
          }
        }
        if (destroyed) return;
        texturesRef.current = loaded;

        console.log(`[IsometricWorld] Loaded ${Object.keys(loaded).length} textures`);

        // Ticker for animation
        app.ticker.add(() => {
          const a = animRef.current;
          if (!a.active) return;
          const hs = hathiSpriteRef.current;
          if (!hs) return;

          a.progress += app.ticker.deltaMS;
          const t = Math.min(a.progress / a.duration, 1);
          // ease-out quad
          const ease = 1 - (1 - t) * (1 - t);
          hs.x = a.fromX + (a.toX - a.fromX) * ease;
          hs.y = a.fromY + (a.toY - a.fromY) * ease;

          if (t >= 1) {
            a.active = false;
            hs.x = a.toX;
            hs.y = a.toY;
          }
        });

        // Signal that we're ready to render levels
        setReady(true);
      } catch (err) {
        console.error("[IsometricWorld] Init failed:", err);
      }
    })();

    return () => {
      destroyed = true;
      try {
        app.destroy(true, { children: true });
      } catch {
        /* ignore */
      }
      appRef.current = null;
      worldContainerRef.current = null;
      hathiSpriteRef.current = null;
      tileSpritesRef.current = [];
      texturesRef.current = {};
      setReady(false);
    };
  }, []);

  /* ---- Build/rebuild the grid when level changes OR when ready ---- */
  const buildGrid = useCallback(
    (lvl: string[], hRow: number, hCol: number, hDir: number) => {
      const wc = worldContainerRef.current;
      const app = appRef.current;
      if (!wc || !app) return;

      // Clear previous sprites
      wc.removeChildren();
      tileSpritesRef.current = [];
      hathiSpriteRef.current = null;

      const rows = lvl.length;
      const cols = Math.max(...lvl.map((r) => r.length));

      console.log(`[IsometricWorld] Building grid ${rows}×${cols}`);

      // Create tile sprites
      for (let r = 0; r < rows; r++) {
        const rowSprites: Sprite[] = [];
        for (let c = 0; c < cols; c++) {
          const ch = lvl[r]?.[c] ?? "g";
          const tex = texturesRef.current[`tile_${ch}`] ?? texturesRef.current["tile_g"];
          if (!tex) {
            console.warn(`[IsometricWorld] No texture for tile '${ch}' at (${r},${c})`);
            continue;
          }

          const sprite = new Sprite(tex);
          sprite.width = SVG_W;
          sprite.height = SVG_H;
          sprite.anchor.set(0.5, 0.5);

          const pos = gridToScreen(r, c);
          sprite.x = pos.x;
          sprite.y = pos.y;
          sprite.zIndex = r + c;

          wc.addChild(sprite);
          rowSprites.push(sprite);
        }
        tileSpritesRef.current.push(rowSprites);
      }

      // Create hathi sprite
      const hathiTex = texturesRef.current[`hathi_${hDir}`];
      if (hathiTex) {
        const hs = new Sprite(hathiTex);
        hs.width = SVG_W;
        hs.height = SVG_H;
        hs.anchor.set(0.5, 0.5);
        const pos = gridToScreen(hRow, hCol);
        hs.x = pos.x;
        hs.y = pos.y;
        hs.zIndex = hRow + hCol + 0.5;
        wc.addChild(hs);
        hathiSpriteRef.current = hs;
      } else {
        console.warn(`[IsometricWorld] No texture for hathi dir ${hDir}`);
      }

      // Fit world to canvas
      fitWorld(app, wc, rows, cols);
    },
    []
  );

  /* Trigger grid build whenever level data OR ready state changes */
  useEffect(() => {
    if (!ready || !level) return;
    buildGrid(level, hathiRow, hathiCol, hathiDir);
    // We only want to rebuild on level change or initial ready, not on every
    // hathi position change (that's handled by the animation effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, level, buildGrid]);

  /* ---- Update hathi position / direction (animate) ---- */
  useEffect(() => {
    const hs = hathiSpriteRef.current;
    if (!hs) return;

    // Update texture for direction
    const hathiTex = texturesRef.current[`hathi_${hathiDir}`];
    if (hathiTex) {
      hs.texture = hathiTex;
    }

    // Animate to new position
    const target = gridToScreen(hathiRow, hathiCol);
    const a = animRef.current;
    a.fromX = hs.x;
    a.fromY = hs.y;
    a.toX = target.x;
    a.toY = target.y;
    a.progress = 0;
    a.duration = 150;
    a.active = true;

    // Update z-index
    hs.zIndex = hathiRow + hathiCol + 0.5;
  }, [hathiRow, hathiCol, hathiDir]);

  /* ---- Handle container resize ---- */
  useEffect(() => {
    const div = containerRef.current;
    const app = appRef.current;
    const wc = worldContainerRef.current;
    if (!div || !app || !wc || !level) return;

    const rows = level.length;
    const cols = Math.max(...level.map((r) => r.length));

    const observer = new ResizeObserver(() => {
      app.renderer.resize(div.clientWidth, div.clientHeight);
      fitWorld(app, wc, rows, cols);
    });

    observer.observe(div);
    return () => observer.disconnect();
  }, [level, ready]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-w-0 h-full overflow-hidden"
      style={{ backgroundColor: bgColor }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Helper: scale & centre the world container to fit the canvas      */
/* ------------------------------------------------------------------ */

function fitWorld(app: Application, wc: Container, rows: number, cols: number) {
  const corners = [
    gridToScreen(0, 0),
    gridToScreen(0, cols - 1),
    gridToScreen(rows - 1, 0),
    gridToScreen(rows - 1, cols - 1),
  ];

  const halfW = SVG_W / 2;
  const halfH = SVG_H / 2;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of corners) {
    minX = Math.min(minX, p.x - halfW);
    maxX = Math.max(maxX, p.x + halfW);
    minY = Math.min(minY, p.y - halfH);
    maxY = Math.max(maxY, p.y + halfH);
  }

  const gridW = maxX - minX;
  const gridH = maxY - minY;
  const canvasW = app.screen.width;
  const canvasH = app.screen.height;

  const padding = 20;
  const scale = Math.min(
    (canvasW - padding * 2) / gridW,
    (canvasH - padding * 2) / gridH,
    2,
  );

  wc.scale.set(scale);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  wc.x = canvasW / 2 - cx * scale;
  wc.y = canvasH / 2 - cy * scale;
}
