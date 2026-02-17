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

/** Tiles that are objects placed ON grass (need a grass base underneath) */
const OBJECT_TILES = new Set(["r", "t", "b", "c", "F", "s", "o"]);

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

const ISO_TILE_W = 128; // diamond width  (2 × 64)
const ISO_TILE_H = 64;  // diamond height (2 × 32)

const SVG_W = 160;
const SVG_H = 320;

/* ------------------------------------------------------------------ */
/*  Isometric projection with 90° step rotation                       */
/*                                                                    */
/*  viewStep 0 = standard view                                        */
/*  viewStep 1 = rotated 90° CW  (viewing from the right)             */
/*  viewStep 2 = rotated 180°    (viewing from behind)                */
/*  viewStep 3 = rotated 270° CW (viewing from the left)              */
/*                                                                    */
/*  At exact 90° multiples the rotated coords are still integers, so  */
/*  the diamond tiles tessellate perfectly — no gaps.                  */
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

  // Rotate (dr, dc) by viewStep × 90° in the ground plane
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
  const texturesRef = useRef<Record<string, Texture>>({});

  /** Grid dimensions for the current level */
  const gridInfoRef = useRef({ rows: 0, cols: 0, centerRow: 0, centerCol: 0 });

  /* ready = true once PixiJS app is initialised AND textures are loaded */
  const [ready, setReady] = useState(false);

  /* Current 90° view step (0–3). State so changes trigger grid rebuild. */
  const [viewStep, setViewStep] = useState(0);

  /* Zoom level multiplier (1 = fit-to-canvas) */
  const zoomRef = useRef(1);

  /* Hathi move animation state */
  const animRef = useRef<{
    fromRow: number;
    fromCol: number;
    toRow: number;
    toCol: number;
    progress: number;
    duration: number;
    active: boolean;
  }>({
    fromRow: 0, fromCol: 0, toRow: 0, toCol: 0,
    progress: 0, duration: 150, active: false,
  });

  /* Ref copy of viewStep so the ticker can read it synchronously */
  const viewStepRef = useRef(0);
  useEffect(() => { viewStepRef.current = viewStep; }, [viewStep]);

  /* ---------------------------------------------------------------- */
  /*  Fit world container into canvas (scale + centre)                */
  /* ---------------------------------------------------------------- */

  const applyFit = useCallback(() => {
    const wc = worldContainerRef.current;
    const app = appRef.current;
    if (!wc || !app) return;

    const { rows, cols, centerRow, centerCol } = gridInfoRef.current;
    const step = viewStepRef.current;
    const zoom = zoomRef.current;

    const halfW = SVG_W / 2;
    const halfH = SVG_H / 2;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = project(r, c, centerRow, centerCol, step);
        minX = Math.min(minX, p.x - halfW);
        maxX = Math.max(maxX, p.x + halfW);
        minY = Math.min(minY, p.y - halfH);
        maxY = Math.max(maxY, p.y + halfH);
      }
    }

    const gridW = maxX - minX || 1;
    const gridH = maxY - minY || 1;
    const canvasW = app.screen.width;
    const canvasH = app.screen.height;

    const padding = 20;
    const baseScale = Math.min(
      (canvasW - padding * 2) / gridW,
      (canvasH - padding * 2) / gridH,
      2,
    );

    const scale = baseScale * zoom;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    wc.pivot.set(cx, cy);
    wc.scale.set(scale);
    wc.rotation = 0;
    wc.x = canvasW / 2;
    wc.y = canvasH / 2;
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Initialise PixiJS Application + load textures                   */
  /* ---------------------------------------------------------------- */

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

        const wc = new Container();
        wc.sortableChildren = true;
        app.stage.addChild(wc);
        worldContainerRef.current = wc;

        // Load all tile + hathi textures at high resolution
        const svgRes = Math.max(window.devicePixelRatio || 1, 2) * 1.5;
        const loaded: Record<string, Texture> = {};
        for (const [code, file] of Object.entries(TILE_FILES)) {
          const url = `${basePath}/hathi/${file}`;
          try {
            loaded[`tile_${code}`] = await Assets.load<Texture>({
              src: url,
              data: { resolution: svgRes },
            });
          } catch (err) {
            console.warn(`[IsometricWorld] Failed to load tile ${code}:`, err);
          }
        }
        for (let d = 0; d < 4; d++) {
          const url = `${basePath}/hathi/${HATHI_DIR_FILES[d]}`;
          try {
            loaded[`hathi_${d}`] = await Assets.load<Texture>({
              src: url,
              data: { resolution: svgRes },
            });
          } catch (err) {
            console.warn(`[IsometricWorld] Failed to load hathi_${d}:`, err);
          }
        }
        if (destroyed) return;
        texturesRef.current = loaded;

        console.log(`[IsometricWorld] Loaded ${Object.keys(loaded).length} textures`);

        // Ticker for hathi move animation
        app.ticker.add(() => {
          const a = animRef.current;
          if (!a.active) return;
          const hs = hathiSpriteRef.current;
          if (!hs) return;

          a.progress += app.ticker.deltaMS;
          const t = Math.min(a.progress / a.duration, 1);
          const ease = 1 - (1 - t) * (1 - t); // ease-out quad

          const curRow = a.fromRow + (a.toRow - a.fromRow) * ease;
          const curCol = a.fromCol + (a.toCol - a.fromCol) * ease;

          const { centerRow, centerCol } = gridInfoRef.current;
          const step = viewStepRef.current;
          const p = project(curRow, curCol, centerRow, centerCol, step);
          hs.x = p.x;
          hs.y = p.y;
          hs.zIndex = p.depth + 0.5;

          if (t >= 1) {
            a.active = false;
          }
        });

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
      texturesRef.current = {};
      setReady(false);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Build / rebuild the grid                                        */
  /* ---------------------------------------------------------------- */

  const buildGrid = useCallback(
    (lvl: string[], hRow: number, hCol: number, hDir: number, step: number) => {
      const wc = worldContainerRef.current;
      const app = appRef.current;
      if (!wc || !app) return;

      // Cancel any running hathi animation
      animRef.current.active = false;

      wc.removeChildren();
      hathiSpriteRef.current = null;

      const rows = lvl.length;
      const cols = Math.max(...lvl.map((r) => r.length));
      const centerRow = (rows - 1) / 2;
      const centerCol = (cols - 1) / 2;
      gridInfoRef.current = { rows, cols, centerRow, centerCol };

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ch = lvl[r]?.[c] ?? "g";
          const p = project(r, c, centerRow, centerCol, step);

          // Grass base for object tiles
          if (OBJECT_TILES.has(ch)) {
            const grassTex = texturesRef.current["tile_g"];
            if (grassTex) {
              const base = new Sprite(grassTex);
              base.width = SVG_W;
              base.height = SVG_H;
              base.anchor.set(0.5, 0.5);
              base.x = p.x;
              base.y = p.y;
              base.zIndex = p.depth;
              wc.addChild(base);
            }
          }

          const tex = texturesRef.current[`tile_${ch}`] ?? texturesRef.current["tile_g"];
          if (!tex) continue;

          const sprite = new Sprite(tex);
          sprite.width = SVG_W;
          sprite.height = SVG_H;
          sprite.anchor.set(0.5, 0.5);
          sprite.x = p.x;
          sprite.y = p.y;
          const depOff = OBJECT_TILES.has(ch) ? 0.1 : 0;
          sprite.zIndex = p.depth + depOff;
          wc.addChild(sprite);
        }
      }

      // Hathi sprite — adjust displayed direction for view rotation
      const displayDir = ((hDir - step) % 4 + 4) % 4;
      const hathiTex = texturesRef.current[`hathi_${displayDir}`];
      if (hathiTex) {
        const hs = new Sprite(hathiTex);
        hs.width = SVG_W;
        hs.height = SVG_H;
        hs.anchor.set(0.5, 0.5);
        const hp = project(hRow, hCol, centerRow, centerCol, step);
        hs.x = hp.x;
        hs.y = hp.y;
        hs.zIndex = hp.depth + 0.5;
        wc.addChild(hs);
        hathiSpriteRef.current = hs;

        // Sync animation ref so future moves start from correct position
        animRef.current.toRow = hRow;
        animRef.current.toCol = hCol;
      }

      applyFit();
    },
    [applyFit],
  );

  /* Trigger grid build whenever level, ready, or viewStep changes */
  useEffect(() => {
    if (!ready || !level) return;
    buildGrid(level, hathiRow, hathiCol, hathiDir, viewStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, level, viewStep, buildGrid]);

  /* ---------------------------------------------------------------- */
  /*  Update hathi position / direction (animate)                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const hs = hathiSpriteRef.current;
    if (!hs) return;

    const step = viewStepRef.current;

    // Update texture for direction (adjusted for view rotation)
    const displayDir = ((hathiDir - step) % 4 + 4) % 4;
    const hathiTex = texturesRef.current[`hathi_${displayDir}`];
    if (hathiTex) {
      hs.texture = hathiTex;
    }

    // Determine start position
    const fromRow = animRef.current.toRow;
    const fromCol = animRef.current.toCol;
    const moved = fromRow !== hathiRow || fromCol !== hathiCol;

    if (moved) {
      const a = animRef.current;
      a.fromRow = fromRow;
      a.fromCol = fromCol;
      a.toRow = hathiRow;
      a.toCol = hathiCol;
      a.progress = 0;
      a.duration = 150;
      a.active = true;
    } else {
      // Just snap position (e.g. direction change only)
      const { centerRow, centerCol } = gridInfoRef.current;
      const p = project(hathiRow, hathiCol, centerRow, centerCol, step);
      hs.x = p.x;
      hs.y = p.y;
      hs.zIndex = p.depth + 0.5;
      animRef.current.toRow = hathiRow;
      animRef.current.toCol = hathiCol;
    }
  }, [hathiRow, hathiCol, hathiDir]);

  /* ---------------------------------------------------------------- */
  /*  Handle container resize                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const div = containerRef.current;
    const app = appRef.current;
    if (!div || !app) return;

    const observer = new ResizeObserver(() => {
      app.renderer?.resize(div.clientWidth, div.clientHeight);
      applyFit();
    });

    observer.observe(div);
    return () => observer.disconnect();
  }, [ready, applyFit]);

  /* ---------------------------------------------------------------- */
  /*  Mouse interaction: drag = rotate 90° steps, wheel = zoom        */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const div = containerRef.current;
    if (!div) return;

    let dragging = false;
    let dragAccum = 0;
    const DRAG_THRESHOLD = 60; // px needed to trigger a 90° step

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      dragAccum = 0;
      div.setPointerCapture(e.pointerId);
      div.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;

      dragAccum += e.movementX;

      // When accumulated drag exceeds threshold, fire a 90° step
      if (dragAccum > DRAG_THRESHOLD) {
        dragAccum -= DRAG_THRESHOLD;
        setViewStep((s) => ((s - 1) % 4 + 4) % 4); // drag right → rotate CCW
      } else if (dragAccum < -DRAG_THRESHOLD) {
        dragAccum += DRAG_THRESHOLD;
        setViewStep((s) => (s + 1) % 4);            // drag left → rotate CW
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      div.releasePointerCapture(e.pointerId);
      div.style.cursor = "grab";
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomRef.current = Math.min(Math.max(zoomRef.current * zoomFactor, 0.3), 5);
      applyFit();
    };

    div.style.cursor = "grab";
    div.addEventListener("pointerdown", onPointerDown);
    div.addEventListener("pointermove", onPointerMove);
    div.addEventListener("pointerup", onPointerUp);
    div.addEventListener("pointercancel", onPointerUp);
    div.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      div.removeEventListener("pointerdown", onPointerDown);
      div.removeEventListener("pointermove", onPointerMove);
      div.removeEventListener("pointerup", onPointerUp);
      div.removeEventListener("pointercancel", onPointerUp);
      div.removeEventListener("wheel", onWheel);
    };
  }, [applyFit]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-w-0 h-full overflow-hidden"
      style={{ backgroundColor: bgColor }}
    />
  );
}
