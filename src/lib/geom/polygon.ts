// Polygon helpers for outlines and pattern pieces. Pure functions; units are the caller's.

import { dist, type Pt } from "./point.ts";

export function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Douglas–Peucker on an open polyline, iterative so long contours can't overflow the stack.
export function simplify(pts: readonly Pt[], tol: number): Pt[] {
  if (pts.length < 3) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let worst = -1, worstD = tol;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(pts[k], pts[i], pts[j]);
      if (d > worstD) {
        worst = k;
        worstD = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([i, worst], [worst, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

// A closed polygon is split at its two mutually far points so both halves keep their corners.
export function simplifyClosed(pts: readonly Pt[], tol: number): Pt[] {
  if (pts.length < 4) return [...pts];
  let far = 0;
  for (let k = 1; k < pts.length; k++) if (dist(pts[k], pts[0]) > dist(pts[far], pts[0])) far = k;
  const a = simplify(pts.slice(0, far + 1), tol);
  const b = simplify([...pts.slice(far), pts[0]], tol);
  return [...a, ...b.slice(1, -1)];
}

export function convexHull(pts: readonly Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const rotate = ([x, y]: Pt, cos: number, sin: number): Pt => [x * cos - y * sin, x * sin + y * cos];

// Four corners of a roughly rectangular hull: align with its minimum-area bounding box, then
// take the extreme point in each diagonal direction. Returned clockwise on screen from top-left.
export function quadCorners(hull: readonly Pt[]): [Pt, Pt, Pt, Pt] | null {
  if (hull.length < 4) return null;
  let bestAngle = 0, bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const r = hull.map((p) => rotate(p, Math.cos(-ang), Math.sin(-ang)));
    const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
    const ar = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (ar < bestArea) {
      bestArea = ar;
      bestAngle = ang;
    }
  }
  // Fold the angle into [-45°, 45°) so "top-left" means what it says on screen.
  const q = Math.PI / 2;
  const ang = bestAngle - q * Math.round(bestAngle / q);
  const r = hull.map((p) => rotate(p, Math.cos(-ang), Math.sin(-ang)));
  const pick = (f: (p: Pt) => number) => hull[r.reduce((bi, p, i) => (f(p) > f(r[bi]) ? i : bi), 0)];
  const tl = pick(([x, y]) => -x - y), tr = pick(([x, y]) => x - y), br = pick(([x, y]) => x + y), bl = pick(([x, y]) => -x + y);
  const corners: [Pt, Pt, Pt, Pt] = [tl, tr, br, bl];
  return new Set(corners.map((c) => `${c[0]},${c[1]}`)).size === 4 ? corners : null;
}

// Signed area: positive when the points run clockwise on screen (y down).
export function signedArea(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export const polygonArea = (pts: readonly Pt[]) => Math.abs(signedArea(pts));

export const perimeter = (pts: readonly Pt[]) => pts.reduce((s, p, i) => s + dist(p, pts[(i + 1) % pts.length]), 0);

// x where a horizontal line at y crosses the polygon, sorted.
export function crossings(poly: readonly Pt[], y: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
  }
  return xs.sort((a, b) => a - b);
}

export function bounds(pts: readonly Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

// Affine maps [a, b, c, d, tx, ty] for x' = a·x + b·y + tx, y' = c·x + d·y + ty.
export type Affine = [number, number, number, number, number, number];
export const applyAffine = ([a, b, c, d, tx, ty]: Affine, [x, y]: Pt): Pt => [a * x + b * y + tx, c * x + d * y + ty];
// m2 ∘ m1
export const compose = ([a2, b2, c2, d2, tx2, ty2]: Affine, [a1, b1, c1, d1, tx1, ty1]: Affine): Affine => [
  a2 * a1 + b2 * c1, a2 * b1 + b2 * d1, c2 * a1 + d2 * c1, c2 * b1 + d2 * d1,
  a2 * tx1 + b2 * ty1 + tx2, c2 * tx1 + d2 * ty1 + ty2,
];
export const rotation = (ang: number): Affine => [Math.cos(ang), -Math.sin(ang), Math.sin(ang), Math.cos(ang), 0, 0];
export const translation = (tx: number, ty: number): Affine => [1, 0, 0, 1, tx, ty];
