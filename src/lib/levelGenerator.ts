/**
 * levelGenerator.ts – Generates random variations of a level template.
 *
 * When a level block is tagged with `#generative`, the template is used
 * as a blueprint and randomly transformed to produce a unique variant
 * each time the level is loaded.
 *
 * Supported transformations:
 *   • Mirror horizontally (flip columns)
 *   • Mirror vertically (flip rows)
 *   • Rotate 90° / 180° / 270°
 *   • Stretch grass paths (extend runs of 'g' by 0–2 tiles)
 *
 * Invariants preserved:
 *   • Exactly one 'H' (Hathi start) exists
 *   • Exactly one 'F' (flag / goal) exists
 *   • Walkable connectivity between H and F is maintained
 *   • 'x' (void) tiles remain void
 */

type Grid = string[][];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function toGrid(rows: string[]): Grid {
  return rows.map((r) => [...r]);
}

function fromGrid(grid: Grid): string[] {
  return grid.map((r) => r.join(""));
}

/** Deep-clone a grid */
function clone(grid: Grid): Grid {
  return grid.map((r) => [...r]);
}

/* ------------------------------------------------------------------ */
/*  Transformations                                                   */
/* ------------------------------------------------------------------ */

/** Mirror horizontally (left ↔ right) */
function mirrorH(grid: Grid): Grid {
  return grid.map((row) => [...row].reverse());
}

/** Mirror vertically (top ↔ bottom) */
function mirrorV(grid: Grid): Grid {
  return [...grid].reverse().map((row) => [...row]);
}

/** Rotate 90° clockwise */
function rotate90(grid: Grid): Grid {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const result: Grid = [];
  for (let c = 0; c < cols; c++) {
    const newRow: string[] = [];
    for (let r = rows - 1; r >= 0; r--) {
      newRow.push(grid[r][c] ?? "x");
    }
    result.push(newRow);
  }
  return result;
}

/** Rotate 180° */
function rotate180(grid: Grid): Grid {
  return rotate90(rotate90(grid));
}

/** Rotate 270° clockwise (= 90° counter-clockwise) */
function rotate270(grid: Grid): Grid {
  return rotate90(rotate90(rotate90(grid)));
}

/* ------------------------------------------------------------------ */
/*  Grass stretching                                                  */
/* ------------------------------------------------------------------ */

/**
 * Stretch horizontal runs of walkable grass ('g') by 0–2 extra tiles.
 * Preserves special tiles (H, F, objects) and void (x).
 * All rows are padded to equal length with 'x' afterwards.
 */
function stretchGrass(grid: Grid): Grid {
  const stretched: Grid = [];

  for (const row of grid) {
    const newRow: string[] = [];
    let i = 0;
    while (i < row.length) {
      const ch = row[i];
      newRow.push(ch);

      // After a grass tile, maybe insert 0–2 extra grass tiles
      if (ch === "g") {
        // Count the current run length
        let runEnd = i + 1;
        while (runEnd < row.length && row[runEnd] === "g") runEnd++;
        const runLen = runEnd - i;

        // Only stretch runs of 2+ grass tiles (leave single tiles alone)
        if (runLen >= 2) {
          const extra = Math.floor(Math.random() * 3); // 0, 1, or 2
          for (let e = 0; e < extra; e++) newRow.push("g");
        }

        // Copy rest of this run
        for (let j = i + 1; j < runEnd; j++) {
          newRow.push(row[j]);
        }
        i = runEnd;
        continue;
      }
      i++;
    }
    stretched.push(newRow);
  }

  // Also try vertical stretching: duplicate rows that are all-grass
  const vertStretched: Grid = [];
  for (const row of stretched) {
    vertStretched.push([...row]);
    const allGrassOrX = row.every((ch) => ch === "g" || ch === "x");
    const hasGrass = row.some((ch) => ch === "g");
    if (allGrassOrX && hasGrass && Math.random() < 0.4) {
      vertStretched.push([...row]);
    }
  }

  // Pad all rows to equal length with 'x'
  const maxLen = Math.max(...vertStretched.map((r) => r.length));
  for (const row of vertStretched) {
    while (row.length < maxLen) row.push("x");
  }

  return vertStretched;
}

/* ------------------------------------------------------------------ */
/*  BFS connectivity check                                            */
/* ------------------------------------------------------------------ */

/** Check that H can reach F through walkable tiles */
function isConnected(grid: Grid): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  let startR = -1, startC = -1;
  let endR = -1, endC = -1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
      if (grid[r][c] === "H") { startR = r; startC = c; }
      if (grid[r][c] === "F") { endR = r; endC = c; }
    }
  }

  if (startR < 0 || endR < 0) return false;

  // BFS — walkable tiles are everything except x, w, r
  const visited = new Set<string>();
  const queue: [number, number][] = [[startR, startC]];
  visited.add(`${startR},${startC}`);

  const walkable = (ch: string) => ch !== "x" && ch !== "w" && ch !== "r";

  while (queue.length > 0) {
    const [cr, cc] = queue.shift()!;
    if (cr === endR && cc === endC) return true;

    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = cr + dr;
      const nc = cc + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      const tile = grid[nr]?.[nc] ?? "x";
      // F (flag) is the goal — reachable by adjacency, not by walking onto it
      if (!walkable(tile) && tile !== "F") continue;
      visited.add(key);
      queue.push([nr, nc]);
    }
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Generate a random variation of the given level template.
 * Returns the transformed rows as string[].
 *
 * Tries up to 20 random transformations and picks the first one
 * that preserves H→F connectivity. Falls back to the original
 * template if no valid variant is found.
 */
export function generateLevel(templateRows: string[]): string[] {
  const original = toGrid(templateRows);

  // Available rigid transformations (identity excluded — we always want a change)
  const rigidTransforms: ((g: Grid) => Grid)[] = [
    (g) => g,               // identity (in case stretch alone changes it)
    mirrorH,
    mirrorV,
    rotate90,
    rotate180,
    rotate270,
    (g) => mirrorH(rotate90(g)),
    (g) => mirrorV(rotate90(g)),
  ];

  for (let attempt = 0; attempt < 20; attempt++) {
    // Pick a random rigid transform
    const transform = rigidTransforms[Math.floor(Math.random() * rigidTransforms.length)];
    let grid = clone(original);

    // Apply rigid transform
    grid = transform(grid);

    // Optionally stretch grass (50% chance)
    if (Math.random() < 0.5) {
      grid = stretchGrass(grid);
    }

    // Verify connectivity
    if (isConnected(grid)) {
      return fromGrid(grid);
    }
  }

  // Fallback: return original unchanged
  return templateRows;
}
