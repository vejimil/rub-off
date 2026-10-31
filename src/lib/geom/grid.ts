// Binary masks on a pixel grid: SAM masks rasterized onto the photo, and the operations the scale
// and outline steps share. Pure functions, no I/O.

import { decodeMaskToRaster, type SegmentationMaskRecord } from "@meta-sam/parser";
import type { Pt } from "./point.ts";

export interface Grid {
  width: number;
  height: number;
  data: Uint8Array; // row-major, 1 = inside
}

export type Box = [number, number, number, number]; // left, top, right, bottom (half-open), px

// Rasterize onto an image-sized grid divided by `step` (step 1 = full resolution). The SAM raster
// covers the record's half-open box, is height-first, and may be coarser than the box.
export function rasterize(record: SegmentationMaskRecord, width: number, height: number, step = 1): Grid {
  const gw = Math.ceil(width / step), gh = Math.ceil(height / step);
  const data = new Uint8Array(gw * gh);
  const { mask, bounds } = record;
  const raster = decodeMaskToRaster(mask);
  const bw = bounds.right - bounds.left, bh = bounds.bottom - bounds.top;
  if (bw <= 0 || bh <= 0) return { width: gw, height: gh, data };
  for (let gy = Math.floor(Math.max(0, bounds.top) / step); gy < Math.min(gh, Math.ceil(bounds.bottom / step)); gy++) {
    const y = gy * step + step / 2;
    if (y < bounds.top || y >= bounds.bottom) continue;
    const my = Math.min(mask.height - 1, Math.floor(((y - bounds.top) * mask.height) / bh));
    for (let gx = Math.floor(Math.max(0, bounds.left) / step); gx < Math.min(gw, Math.ceil(bounds.right / step)); gx++) {
      const x = gx * step + step / 2;
      if (x < bounds.left || x >= bounds.right) continue;
      const mx = Math.min(mask.width - 1, Math.floor(((x - bounds.left) * mask.width) / bw));
      if (raster[my * mask.width + mx]) data[gy * gw + gx] = 1;
    }
  }
  return { width: gw, height: gh, data };
}

export const emptyGrid = (width: number, height: number): Grid => ({ width, height, data: new Uint8Array(width * height) });

export const area = (g: Grid) => g.data.reduce((s, v) => s + v, 0);

export function union(a: Grid, b: Grid): Grid {
  const data = new Uint8Array(a.data.length);
  for (let i = 0; i < data.length; i++) data[i] = a.data[i] | b.data[i];
  return { width: a.width, height: a.height, data };
}

export function unionAll(grids: readonly Grid[], width: number, height: number): Grid {
  const data = new Uint8Array(width * height);
  for (const g of grids) g.data.forEach((v, i) => (data[i] |= v));
  return { width, height, data };
}

// Cells set in both grids (same size).
export function intersect(a: Grid, b: Grid): Grid {
  const data = new Uint8Array(a.data.length);
  for (let i = 0; i < data.length; i++) data[i] = a.data[i] & b.data[i];
  return { width: a.width, height: a.height, data };
}

// Cells set in a but not in b.
export function subtract(a: Grid, b: Grid): Grid {
  const data = new Uint8Array(a.data.length);
  for (let i = 0; i < data.length; i++) data[i] = a.data[i] & (b.data[i] ^ 1);
  return { width: a.width, height: a.height, data };
}

// Everything the outside can't reach is filled: holes (like a sheet's notch) disappear.
export function fillHoles(g: Grid): Grid {
  const { width: w, height: h } = g;
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!g.data[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i - x) / w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = outside[i] ? 0 : 1;
  return { width: w, height: h, data };
}

// 8-connected components, largest first.
export function components(g: Grid): Grid[] {
  const { width: w, height: h } = g;
  const label = new Int32Array(w * h);
  const sizes: number[] = [0];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!g.data[start] || label[start]) continue;
    const id = sizes.length;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (g.data[j] && !label[j]) {
            label[j] = id;
            stack.push(j);
          }
        }
      }
    }
    sizes.push(size);
  }
  const order = sizes.map((_, id) => id).slice(1).sort((a, b) => sizes[b] - sizes[a]);
  return order.map((id) => {
    const data = new Uint8Array(w * h);
    for (let i = 0; i < data.length; i++) if (label[i] === id) data[i] = 1;
    return { width: w, height: h, data };
  });
}

// The largest 8-connected component, so a stray speck can't become the outline.
export const largestComponent = (g: Grid): Grid => components(g)[0] ?? emptyGrid(g.width, g.height);

// Square dilation by r cells, separable (rows then columns).
export function dilate(g: Grid, r: number): Grid {
  const { width: w, height: h } = g;
  const rows = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -Infinity;
    for (let x = 0; x < w; x++) {
      if (g.data[y * w + x]) last = x;
      if (x - last <= r) rows[y * w + x] = 1;
    }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) {
      if (g.data[y * w + x]) last = x;
      if (last - x <= r) rows[y * w + x] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) {
      if (rows[y * w + x]) last = y;
      if (y - last <= r) out[y * w + x] = 1;
    }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) {
      if (rows[y * w + x]) last = y;
      if (last - y <= r) out[y * w + x] = 1;
    }
  }
  return { width: w, height: h, data: out };
}

export function centroid(g: Grid): [number, number] | null {
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < g.data.length; i++) {
    if (!g.data[i]) continue;
    sx += i % g.width;
    sy += Math.floor(i / g.width);
    n++;
  }
  return n === 0 ? null : [sx / n, sy / n];
}

export function gridBox(g: Grid): Box | null {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (let i = 0; i < g.data.length; i++) {
    if (!g.data[i]) continue;
    const x = i % g.width, y = Math.floor(i / g.width);
    if (x < l) l = x;
    if (x > r) r = x;
    if (y < t) t = y;
    if (y > b) b = y;
  }
  return r < l ? null : [l, t, r + 1, b + 1];
}

// Moore-neighbour tracing of the outer boundary, clockwise on screen, in pixel centres.
const MOORE: readonly Pt[] = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];

export function traceOuter(g: Grid): Pt[] {
  const { width: w, height: h, data } = g;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] === 1;
  let start = -1;
  for (let i = 0; i < data.length && start < 0; i++) if (data[i]) start = i;
  if (start < 0) return [];
  const sx = start % w, sy = (start - sx) / w;
  const out: Pt[] = [[sx, sy]];
  // The start pixel's west neighbour is background (raster order), so the search starts there.
  let cx = sx, cy = sy, dir = 0, firstMove = -1;
  for (let guard = 0; guard < 4 * data.length; guard++) {
    let move = -1;
    for (let k = 0; k < 8 && move < 0; k++) {
      const d = (dir + k) % 8;
      if (at(cx + MOORE[d][0], cy + MOORE[d][1])) move = d;
    }
    if (move < 0) return out; // a single pixel
    // Jacob's stopping criterion: back at the start, about to repeat the first move.
    if (cx === sx && cy === sy) {
      if (move === firstMove) return out;
      if (firstMove < 0) firstMove = move;
    }
    cx += MOORE[move][0];
    cy += MOORE[move][1];
    // Resume the clockwise sweep just past the background neighbour we came by.
    dir = (move + 6) % 8;
    if (cx !== sx || cy !== sy) out.push([cx, cy]);
  }
  return out;
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
}

// Share of box a covered by box b.
export function overlapShare(a: Box, b: Box): number {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return (w * h) / Math.max(1, (a[2] - a[0]) * (a[3] - a[1]));
}
