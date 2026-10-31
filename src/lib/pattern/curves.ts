// Curve helpers for drafting. Pattern curves meet a centre line or a seam at 90°, so every curve
// here is set by its end tangents.

import { polylineLength, type Pt } from "../geom/point.ts";

export function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps = 24): Pt[] {
  const out: Pt[] = [p0];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}

export function quad(p0: Pt, c: Pt, p1: Pt, steps = 20): Pt[] {
  const out: Pt[] = [p0];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return out;
}

export const line = (a: Pt, b: Pt): Pt[] => [a, b];

// The smallest x in [lo, hi] with f(x) ≥ target, for f increasing in x. Null when out of reach.
export function solveIncreasing(f: (x: number) => number, target: number, lo: number, hi: number): number | null {
  if (f(lo) > target) return null;
  if (f(hi) < target) return null;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export { polylineLength };
