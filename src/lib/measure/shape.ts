// The garment as a cm outline on the floor plane, and what every garment's measuring shares:
// a value with its ±, physical ranges, and refusing a value instead of guessing it.

import { area, fillHoles, largestComponent, traceOuter, union, type Grid } from "../geom/grid.ts";
import { dist, type Pt } from "../geom/point.ts";
import { applyAffine, compose, crossings, rotation, simplifyClosed, type Affine } from "../geom/polygon.ts";
import { L, type Local } from "../i18n/lang.ts";
import { confidenceOf, garmentPlane, type A4Scale, type Confidence, type Plane, type ScaleFailure } from "../scale/a4.ts";

export const NO_GARMENT = L("옷을 찾지 못했습니다.", "Couldn't find the garment.", "No encontramos la prenda.");

export const SIMPLIFY_CM = 0.3;
const EDGE_PX = 2; // a mask edge is good to about this many pixels at each end of a measurement

export interface Value {
  cm: number;
  plusMinusCm: number;
  confidence: Confidence;
  bound?: "max" | "min"; // only bounded: "at most" / "at least"
}

export interface Shape {
  outline: Pt[]; // cm on the floor plane, simplified, clockwise on screen
  plane: Plane;
  pxPerCm: number;
  notes: Local[];
}

export interface Measured<K extends string = string> {
  values: Partial<Record<K, Value>>;
  // Points and segments in the outline's cm frame, after the garment's own rotation, for drawing.
  landmarks: Record<string, Pt>;
  segments: { key: K; a: Pt; b: Pt; mirrored?: boolean }[]; // mirrored: an end drawn from the other side
  outline: Pt[]; // the same frame
  frame: Affine; // floor-plane cm → this frame
  refused: { key: K; cm: number; range: [number, number] }[]; // out of physical range, not shown
  notes: Local[];
}

export function shapeFromMasks(garment: Grid, paper: Grid, scale: A4Scale): Shape | ScaleFailure {
  const notes: Local[] = [];
  // A sheet lying on the garment counts as garment where it mostly overlaps, so it can't cut a
  // notch into the outline. A sheet beside the garment is left out.
  const filled = fillHoles(largestComponent(garment));
  let inside = 0, paperArea = 0;
  for (let i = 0; i < paper.data.length; i++) {
    if (!paper.data[i]) continue;
    paperArea++;
    inside += filled.data[i];
  }
  const onGarment = inside / Math.max(1, paperArea) >= 0.5;
  const shape = onGarment ? fillHoles(union(filled, paper)) : filled;
  if (onGarment) {
    const pct = Math.round((100 * inside) / paperArea);
    notes.push(L(`A4 용지가 옷 위에 놓여 있어(${pct}% 겹침) 옷의 일부로 보고 윤곽을 잡았습니다.`, `The A4 sheet lies on the garment (${pct}% overlap), so it was counted as part of the outline.`, `La hoja A4 está sobre la prenda (${pct}% superpuesta), así que se tomó como parte del contorno.`));
  }
  if (area(shape) === 0) return { ok: false, reason: "no-paper", detail: NO_GARMENT };
  const contourPx = traceOuter(largestComponent(shape));
  const plane = garmentPlane(scale, contourPx);
  if ("ok" in plane) return plane;
  const outline = simplifyClosed(contourPx.map(plane.toCm), SIMPLIFY_CM);
  return { outline, plane, pxPerCm: scale.pxPerCm, notes };
}

// No A4 in the photo: a plain scale of `pxPerCm`, with no perspective correction, so `rel` must
// carry that.
export function shapeWithPlainScale(garment: Grid, pxPerCm: number, rel: number, notes: Local[] = []): Shape | null {
  const shape = fillHoles(largestComponent(garment));
  if (area(shape) === 0) return null;
  const contourPx = traceOuter(shape);
  const plane: Plane = { toCm: ([x, y]) => [x / pxPerCm, y / pxPerCm], toPx: ([x, y]) => [x * pxPerCm, y * pxPerCm], rel, perspective: false };
  return { outline: simplifyClosed(contourPx.map(plane.toCm), SIMPLIFY_CM), plane, pxPerCm, notes };
}

// A part mask (sleeve, handle) as a cm polygon on the same plane.
export function partPolygon(mask: Grid, plane: Plane): Pt[] {
  return simplifyClosed(traceOuter(largestComponent(mask)).map(plane.toCm), SIMPLIFY_CM);
}

// extraCm: how far the landmarks themselves can be off, beyond the scale (a seam SAM can only
// place to within a couple of centimetres).
export function valueOf(cm: number, shape: Shape, bound?: Value["bound"], extraRel = 0, extraCm = 0): Value {
  const rel = Math.hypot(shape.plane.rel, extraRel);
  const edge = (2 * EDGE_PX) / shape.pxPerCm + extraCm;
  return { cm, plusMinusCm: cm * rel + edge, confidence: confidenceOf(rel + edge / Math.max(cm, 1)), ...(bound && { bound }) };
}

// Keep values inside their physical range; the rest are refused and listed.
export function inRange<K extends string>(values: Partial<Record<K, Value>>, ranges: Record<K, [number, number]>): Pick<Measured<K>, "values" | "refused"> {
  const kept: Partial<Record<K, Value>> = {};
  const refused: Measured<K>["refused"] = [];
  for (const [k, v] of Object.entries(values) as [K, Value][]) {
    const [lo, hi] = ranges[k];
    if (v.cm >= lo && v.cm <= hi) kept[k] = v;
    else refused.push({ key: k, cm: v.cm, range: [lo, hi] });
  }
  return { values: kept, refused };
}

export const quarterTurns = (k: number): Affine => rotation((k * Math.PI) / 2);
export const transform = (m: Affine, pts: readonly Pt[]) => pts.map((p) => applyAffine(m, p));
export { compose, crossings, dist };

// Index of the point maximizing f among those passing ok, or -1.
export const argBest = (poly: readonly Pt[], f: (p: Pt) => number, ok: (p: Pt) => boolean = () => true) =>
  poly.reduce((bi, p, i) => (ok(p) && (bi < 0 || f(p) > f(poly[bi])) ? i : bi), -1);

// Indices from `from` to `to` along the polygon, in whichever direction does not pass `avoid`.
export function arc(n: number, from: number, to: number, avoid: number): number[] {
  const walk = (stepDir: 1 | -1) => {
    const out = [from];
    for (let i = from; i !== to; ) {
      i = (i + stepDir + n) % n;
      out.push(i);
    }
    return out;
  };
  const fwd = walk(1);
  return fwd.includes(avoid) ? walk(-1) : fwd;
}

// Convexity defects: for each hull edge, the outline point between its ends farthest inside it.
export function defects(poly: readonly Pt[]): { i: number; depth: number; a: number; b: number }[] {
  const n = poly.length;
  const idx = hullIndices(poly);
  const out: { i: number; depth: number; a: number; b: number }[] = [];
  for (let k = 0; k < idx.length; k++) {
    const a = idx[k], b = idx[(k + 1) % idx.length];
    let best = -1, bestD = 0;
    for (let i = (a + 1) % n; i !== b; i = (i + 1) % n) {
      const d = lineDist(poly[i], poly[a], poly[b]);
      if (d > bestD) [best, bestD] = [i, d];
    }
    if (best >= 0) out.push({ i: best, depth: bestD, a, b });
  }
  return out;
}

function lineDist(p: Pt, a: Pt, b: Pt): number {
  const l = dist(a, b) || 1;
  return Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / l;
}

// Hull vertices as indices into the polygon, in polygon order.
function hullIndices(poly: readonly Pt[]): number[] {
  const order = poly.map((_, i) => i).sort((i, j) => poly[i][0] - poly[j][0] || poly[i][1] - poly[j][1]);
  const cross = (o: number, a: number, b: number) =>
    (poly[a][0] - poly[o][0]) * (poly[b][1] - poly[o][1]) - (poly[a][1] - poly[o][1]) * (poly[b][0] - poly[o][0]);
  const lower: number[] = [], upper: number[] = [];
  for (const q of order) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of [...order].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...new Set([...lower.slice(0, -1), ...upper.slice(0, -1)])].sort((a, b) => a - b);
}

// Width of the polygon across a horizontal line: outermost crossings.
export function widthAt(poly: readonly Pt[], y: number): { left: number; right: number } | null {
  const xs = crossings(poly, y);
  return xs.length >= 2 ? { left: xs[0], right: xs[xs.length - 1] } : null;
}
