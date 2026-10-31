// 2D helpers. Units are whatever the caller works in (px or cm); y points down.

export type Pt = readonly [number, number];

export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const mirrorX = (pts: readonly Pt[], x0 = 0): Pt[] => pts.map(([x, y]) => [2 * x0 - x, y]);

export function quadBezier(p0: Pt, c: Pt, p1: Pt, steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return out;
}

// x on a polyline that runs top to bottom.
export function xAt(pts: readonly Pt[], y: number): number {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (y >= y0 && y <= y1 && y1 > y0) return x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
  }
  return y < pts[0][1] ? pts[0][0] : pts[pts.length - 1][0];
}

export const polylineLength = (pts: readonly Pt[]) => pts.slice(1).reduce((s, p, i) => s + dist(p, pts[i]), 0);

// The point `d` along a polyline from its start (clamped to the ends).
export function pointAlong(pts: readonly Pt[], d: number): Pt {
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const len = dist(pts[i - 1], pts[i]);
    if (len >= left) return lerp(pts[i - 1], pts[i], len === 0 ? 0 : left / len);
    left -= len;
  }
  return pts[pts.length - 1];
}

export const svgPath = (pts: readonly Pt[], close = false) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + (close ? " Z" : "");
