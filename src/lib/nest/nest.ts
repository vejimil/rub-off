// Cutting layout on your own fabric: every piece to cut, placed on the fabric pieces (cm polygons)
// along the grain. Deterministic raster bottom-left fill on a 1 cm grid:
//   - each piece is unfolded and copied as it will be cut on a single layer ("cut 1 on fold" is
//     cut as its full width; "cut 2, mirror" as one piece and its mirror image)
//   - turns: 0° and 180° keep the grainline on the fabric's grain; 90° only when allowed
//   - pieces are dilated by a cell and the fabric eroded by one, so every cut stays clear of the
//     fabric edge and of its neighbours by at least a centimetre
// Largest piece first, each at the first free place scanning from the top-left. What doesn't fit
// is reported with the largest free rectangle left, so the answer is "12 cm short across", not a guess.

import type { Pt } from "../geom/point.ts";
import { bounds, polygonArea } from "../geom/polygon.ts";
import { cuttingLine } from "../pattern/seam.ts";
import type { Pattern, Piece } from "../pattern/types.ts";
import type { Local } from "../i18n/lang.ts";

export const CELL_CM = 1;

export interface CutPiece {
  id: string; // piece id plus copy, e.g. "sleeve#2m"
  name: string;
  nameKo: string;
  label: Local; // the name in every language
  outline: Pt[]; // cutting line, cm, grainline along +y
}

export interface Placement {
  piece: CutPiece;
  rotation: 0 | 90 | 180 | 270;
  outline: Pt[]; // on the fabric, cm
}

export interface NestResult {
  placed: Placement[];
  unplaced: { piece: CutPiece; size: [number, number]; largestFree: [number, number] }[];
  fabricAreaCm2: number;
  usedAreaCm2: number;
}

// The grainline turned to +y (down the fabric), so 0° means "along the grain".
function alongGrain(outline: Pt[], grain: [Pt, Pt]): Pt[] {
  const ang = Math.atan2(grain[1][1] - grain[0][1], grain[1][0] - grain[0][0]);
  const t = Math.PI / 2 - ang; // rotate the grain direction onto +y
  const c = Math.cos(t), s = Math.sin(t);
  return outline.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

const mirrorPts = (pts: Pt[]): Pt[] => pts.map(([x, y]): Pt => [-x, y]).reverse();

// Every piece as it will be cut on a single layer.
const pieceLabel = (p: Pattern["pieces"][number]): Local => p.names;

export function piecesToCut(pattern: Pattern): CutPiece[] {
  const out: CutPiece[] = [];
  for (const p of pattern.pieces) {
    let cut = cuttingLine(p, pattern.fabric);
    if (p.cut.onFold) cut = unfold(p, cut);
    const base = alongGrain(cut, p.grain);
    const copies = p.cut.count;
    for (let k = 0; k < copies; k++) {
      const mirrored = p.cut.mirror && k % 2 === 1;
      out.push({ id: `${p.id}#${k + 1}${mirrored ? "m" : ""}`, name: p.name, nameKo: p.nameKo, label: pieceLabel(p), outline: mirrored ? mirrorPts(base) : base });
    }
  }
  return out;
}

// A piece cut on the fold, opened out: the cutting line and its mirror across the fold line.
function unfold(p: Piece, cut: Pt[]): Pt[] {
  const fold = p.edges.find((e) => e.kind === "fold")!;
  const a = fold.pts[0], b = fold.pts[fold.pts.length - 1];
  const d = [b[0] - a[0], b[1] - a[1]], l2 = d[0] ** 2 + d[1] ** 2;
  const reflect = ([x, y]: Pt): Pt => {
    const t = ((x - a[0]) * d[0] + (y - a[1]) * d[1]) / l2;
    const px = a[0] + t * d[0], py = a[1] + t * d[1];
    return [2 * px - x, 2 * py - y];
  };
  // Both halves on the raster are enough: union happens when they are drawn into one grid.
  return [...cut, ...cut.map(reflect).reverse()];
}

interface Raster {
  w: number;
  h: number;
  data: Uint8Array;
}

function inside(poly: readonly Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Cells whose centre lies inside any of the polygons, on a grid starting at (x0, y0).
function rasterizePolys(polys: readonly Pt[][], x0: number, y0: number, w: number, h: number): Raster {
  const data = new Uint8Array(w * h);
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const x = x0 + (gx + 0.5) * CELL_CM, y = y0 + (gy + 0.5) * CELL_CM;
      if (polys.some((p) => inside(p, x, y))) data[gy * w + gx] = 1;
    }
  }
  return { w, h, data };
}

function grow(r: Raster, by: number, value: 0 | 1): Raster {
  // value 1: dilate set cells; value 0: erode (grow the empty cells).
  const out = new Uint8Array(r.data);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (r.data[y * r.w + x] !== value) continue;
      for (let dy = -by; dy <= by; dy++) {
        for (let dx = -by; dx <= by; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < r.w && ny < r.h) out[ny * r.w + nx] = value;
        }
      }
    }
  }
  return { ...r, data: out };
}

const turn = (pts: readonly Pt[], deg: 0 | 90 | 180 | 270): Pt[] =>
  pts.map(([x, y]) => (deg === 0 ? [x, y] : deg === 90 ? [-y, x] : deg === 180 ? [-x, -y] : [y, -x]));

// Cells of a piece, relative to its bounding box, dilated by one cell for the gap.
function pieceCells(outline: readonly Pt[]): { cells: [number, number][]; w: number; h: number; minX: number; minY: number } {
  const b = bounds(outline);
  const w = Math.ceil((b.maxX - b.minX) / CELL_CM) + 2, h = Math.ceil((b.maxY - b.minY) / CELL_CM) + 2;
  const r = grow(rasterizePolys([outline as Pt[]], b.minX - CELL_CM, b.minY - CELL_CM, w, h), 1, 1);
  const cells: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (r.data[y * w + x]) cells.push([x, y]);
  return { cells, w, h, minX: b.minX - CELL_CM, minY: b.minY - CELL_CM };
}

export function nest(pieces: readonly CutPiece[], fabric: readonly Pt[][], opts: { allowCrossGrain?: boolean } = {}): NestResult {
  const fb = bounds(fabric.flat());
  const W = Math.ceil((fb.maxX - fb.minX) / CELL_CM), H = Math.ceil((fb.maxY - fb.minY) / CELL_CM);
  // Free cells: inside the fabric, a cell in from its edge.
  const free = grow(rasterizePolys(fabric as Pt[][], fb.minX, fb.minY, W, H), 1, 0);
  const rotations: (0 | 90 | 180 | 270)[] = opts.allowCrossGrain ? [0, 180, 90, 270] : [0, 180];

  const order = [...pieces].sort((a, b) => polygonArea(b.outline) - polygonArea(a.outline));
  const placed: Placement[] = [];
  const unplaced: NestResult["unplaced"] = [];
  for (const piece of order) {
    let best: { y: number; x: number; rot: (typeof rotations)[number]; pc: ReturnType<typeof pieceCells> } | null = null;
    for (const rot of rotations) {
      const pc = pieceCells(turn(piece.outline, rot));
      search: for (let y = 0; y + pc.h <= H; y++) {
        if (best && y > best.y) break;
        for (let x = 0; x + pc.w <= W; x++) {
          let ok = true;
          for (const [cx, cy] of pc.cells) {
            if (!free.data[(y + cy) * W + x + cx]) {
              ok = false;
              break;
            }
          }
          if (ok) {
            if (!best || y < best.y || (y === best.y && x < best.x)) best = { y, x, rot, pc };
            break search;
          }
        }
      }
    }
    if (!best) {
      const b = bounds(piece.outline);
      unplaced.push({ piece, size: [b.maxX - b.minX, b.maxY - b.minY], largestFree: largestFreeRect(free) });
      continue;
    }
    for (const [cx, cy] of best.pc.cells) free.data[(best.y + cy) * W + best.x + cx] = 0;
    const dx = fb.minX + best.x * CELL_CM - best.pc.minX, dy = fb.minY + best.y * CELL_CM - best.pc.minY;
    placed.push({ piece, rotation: best.rot, outline: turn(piece.outline, best.rot).map(([x, y]) => [x + dx, y + dy]) });
  }
  return {
    placed,
    unplaced,
    fabricAreaCm2: fabric.reduce((s, p) => s + polygonArea(p), 0),
    usedAreaCm2: placed.reduce((s, p) => s + polygonArea(p.piece.outline), 0),
  };
}

// The largest all-free rectangle (cm), by the histogram method.
function largestFreeRect(r: Raster): [number, number] {
  const heights = new Array(r.w).fill(0);
  let best: [number, number] = [0, 0];
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) heights[x] = r.data[y * r.w + x] ? heights[x] + 1 : 0;
    const stack: number[] = [];
    for (let x = 0; x <= r.w; x++) {
      const hgt = x === r.w ? 0 : heights[x];
      while (stack.length && heights[stack[stack.length - 1]] >= hgt) {
        const top = stack.pop()!;
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const w = x - left, h = heights[top];
        if (w * h > best[0] * best[1]) best = [w, h];
      }
      stack.push(x);
    }
  }
  return [best[0] * CELL_CM, best[1] * CELL_CM];
}
