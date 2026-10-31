// The cutting line: the seam line pushed out by each edge's own allowance. Each edge becomes a
// one-sided band (the edge and its offset), each convex corner between two edges gets a mitred
// wedge so the cut line runs straight to the corner as on a drafted pattern, and Clipper unions
// the bands with the piece. A fold edge has no band, so the neighbouring allowances run straight
// to the fold line.

import ClipperLib from "clipper-lib";
import { add, dist, scale, sub, type Pt } from "../geom/point.ts";
import { polygonArea, signedArea } from "../geom/polygon.ts";
import { seamAllowance } from "../rules/seam-rules.ts";
import { seamLine, type Edge, type Fabric, type Piece } from "./types.ts";

const CLIPPER_SCALE = 1000; // 0.01 mm
const MITER_LIMIT = 4; // a mitre longer than this many allowances is bevelled

export const allowanceOf = (e: Edge, fabric: Fabric) => e.allowanceCm ?? seamAllowance(e.kind, fabric);

// Seam line clockwise on screen (positive signed area with y down), edges in order.
export function normalized(edges: readonly Edge[]): Edge[] {
  const line = edges.flatMap((e) => e.pts.slice(0, -1));
  if (signedArea(line) >= 0) return [...edges];
  return [...edges].reverse().map((e) => ({ ...e, pts: [...e.pts].reverse() }));
}

const unit = ([x, y]: Pt): Pt => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
// Outward normal of a direction, for a clockwise-on-screen outline.
const outward = (d: Pt): Pt => unit([d[1], -d[0]]);
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];

// Where the line through p along d meets the line through q along e.
function meet(p: Pt, d: Pt, q: Pt, e: Pt): Pt | null {
  const det = cross(d, e);
  if (Math.abs(det) < 1e-9) return null;
  const t = cross(sub(q, p), e) / det;
  return add(p, scale(d, t));
}

// The edge pushed out by w: every vertex moved along its mitred normal.
function offsetPolyline(pts: readonly Pt[], w: number): Pt[] {
  const segs = pts.slice(1).map((p, i) => unit(sub(p, pts[i])));
  return pts.map((p, i) => {
    const nIn = i > 0 ? outward(segs[i - 1]) : null, nOut = i < segs.length ? outward(segs[i]) : null;
    if (!nIn || !nOut) return add(p, scale((nIn ?? nOut)!, w));
    const m = unit(add(nIn, nOut));
    const cos = m[0] * nIn[0] + m[1] * nIn[1];
    return add(p, scale(m, w / Math.max(cos, 1 / MITER_LIMIT)));
  });
}

type Path = { X: number; Y: number }[];
const toPath = (pts: readonly Pt[]): Path => pts.map(([x, y]) => ({ X: Math.round(x * CLIPPER_SCALE), Y: Math.round(y * CLIPPER_SCALE) }));
const fromPath = (p: Path): Pt[] => p.map(({ X, Y }) => [X / CLIPPER_SCALE, Y / CLIPPER_SCALE]);

export function cuttingLine(piece: Piece, fabric: Fabric): Pt[] {
  const edges = normalized(piece.edges.filter((e) => e.pts.length >= 2));
  const polys: Pt[][] = [seamLine({ ...piece, edges })];
  for (const e of edges) {
    const w = allowanceOf(e, fabric);
    if (w > 0) polys.push([...e.pts, ...offsetPolyline(e.pts, w).reverse()]);
  }
  // Convex corners: the wedge between the two offset lines, mitred.
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i], b = edges[(i + 1) % edges.length];
    const v = a.pts[a.pts.length - 1];
    const dA = unit(sub(v, a.pts[a.pts.length - 2])), dB = unit(sub(b.pts[1], v));
    if (cross(dA, dB) <= 1e-9) continue; // concave or straight: the bands already overlap
    const wA = allowanceOf(a, fabric), wB = allowanceOf(b, fabric);
    if (wA === 0 && wB === 0) continue;
    const pA = add(v, scale(outward(dA), wA)), pB = add(v, scale(outward(dB), wB));
    const x = meet(pA, dA, pB, dB);
    const wedge = x && dist(x, v) <= MITER_LIMIT * Math.max(wA, wB) ? [v, pA, x, pB] : [v, pA, pB];
    polys.push(wedge);
  }

  // Each polygon simplified on its own (a band on a tight concave curve folds over itself), all
  // turned the same way, then unioned.
  const subject: Path[] = [];
  for (const poly of polys) {
    for (const p of ClipperLib.Clipper.SimplifyPolygon(toPath(poly), ClipperLib.PolyFillType.pftNonZero) as Path[]) {
      if (!ClipperLib.Clipper.Orientation(p)) p.reverse();
      subject.push(p);
    }
  }
  const c = new ClipperLib.Clipper();
  c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  const out: Path[] = [];
  c.Execute(ClipperLib.ClipType.ctUnion, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const outer = out.map(fromPath).sort((p, q) => polygonArea(q) - polygonArea(p))[0] ?? [];
  // Drop the points Clipper leaves on straight runs.
  const clean = ClipperLib.Clipper.CleanPolygon(toPath(outer), 0.002 * CLIPPER_SCALE) as Path;
  const line = fromPath(clean);
  return signedArea(line) >= 0 ? line : line.reverse();
}

// Where the seam line is, edge by edge, with the outward normal at each notch.
export function notchTicks(piece: Piece, fabric: Fabric): { a: Pt; b: Pt; count: 1 | 2; along: Pt }[] {
  const edges = normalized(piece.edges);
  return piece.notches.flatMap((n) => {
    let best: { d: number; seg: [Pt, Pt]; e: Edge } | null = null;
    for (const e of edges) {
      for (let i = 1; i < e.pts.length; i++) {
        const s: [Pt, Pt] = [e.pts[i - 1], e.pts[i]];
        const d = segDistance(n.at, s);
        if (!best || d < best.d) best = { d, seg: s, e };
      }
    }
    if (!best) return [];
    const along = unit(sub(best.seg[1], best.seg[0]));
    const len = Math.max(0.5, Math.min(1, allowanceOf(best.e, fabric)));
    return [{ a: n.at, b: add(n.at, scale(outward(along), len)), count: n.count, along }];
  });
}

function segDistance(p: Pt, [a, b]: [Pt, Pt]): number {
  const d = sub(b, a), l2 = d[0] ** 2 + d[1] ** 2;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2));
  return dist(p, add(a, scale(d, t)));
}
