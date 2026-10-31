import assert from "node:assert/strict";
import { test } from "node:test";
import type { Grid } from "../geom/grid.ts";
import { applyH } from "../geom/homography.ts";
import type { Pt } from "../geom/point.ts";
import { a4Scale, lengthCm } from "./a4.ts";

// Pure geometry on drawn grids (SAM itself is only ever tested on real photos).
const W = 1600, H = 1200;

// A filled quadrilateral (any convex corners, clockwise on screen).
function quad(corners: readonly Pt[]): Grid {
  const data = new Uint8Array(W * H);
  const inside = (x: number, y: number) =>
    corners.every((a, i) => {
      const b = corners[(i + 1) % corners.length];
      return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= 0;
    });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x + 0.5, y + 0.5)) data[y * W + x] = 1;
  return { width: W, height: H, data };
}

// A4 at 10 px/cm, rotated by `deg` about (cx, cy).
function sheet(deg: number, cx = 800, cy = 600, pxPerCm = 10): Pt[] {
  const t = (deg * Math.PI) / 180, w = 21 * pxPerCm, h = 29.7 * pxPerCm;
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Pt[]).map(([x, y]) => [
    cx + x * Math.cos(t) - y * Math.sin(t),
    cy + x * Math.sin(t) + y * Math.cos(t),
  ]);
}

test("a level sheet gives its own size back, and lengths beside it in cm", () => {
  const s = a4Scale(quad(sheet(0)));
  assert.ok(s.ok, JSON.stringify(s));
  assert.ok(Math.abs(s.pxPerCm - 10) < 0.15, `px/cm ${s.pxPerCm}`);
  const d = lengthCm(s, [800, 450], [800, 750]); // 300 px = 30 cm, inside the reach
  assert.ok(d.perspective);
  assert.ok(Math.abs(d.cm - 30) < 0.4, `${d.cm} cm`);
});

test("a rotated sheet still gives the right scale", () => {
  const s = a4Scale(quad(sheet(23)));
  assert.ok(s.ok, JSON.stringify(s));
  assert.ok(Math.abs(s.pxPerCm - 10) < 0.15, `px/cm ${s.pxPerCm}`);
});

test("perspective: a trapezoid sheet maps back to 21 × 29.7 cm", () => {
  // The far edge (top) seen 8% shorter than the near edge, as from a phone tilted toward the top.
  const corners: Pt[] = [[700, 450], [910, 450], [918, 750], [692, 750]];
  const s = a4Scale(quad(corners));
  assert.ok(s.ok, JSON.stringify(s));
  const [tl, tr, br] = s.cornersPx.map((c) => applyH(s.h!, c));
  assert.ok(Math.abs(Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) - 21) < 0.5);
  assert.ok(Math.abs(Math.hypot(br[0] - tr[0], br[1] - tr[1]) - 29.7) < 0.5);
});

test("a sheet cut off by the photo edge is refused", () => {
  const s = a4Scale(quad(sheet(0, 100, 600)));
  assert.equal(s.ok, false);
  assert.equal(!s.ok && s.reason, "paper-edge");
});

test("a sheet partly covered is refused", () => {
  const g = quad(sheet(0));
  for (let y = 450; y < 600; y++) for (let x = 695; x < 800; x++) g.data[y * W + x] = 0; // a corner covered
  const s = a4Scale(g);
  assert.equal(s.ok, false);
  // Which check catches it depends on how much is covered; any refusal will do, a number won't.
  assert.ok(!s.ok && s.reason !== "no-paper", JSON.stringify(s));
});

test("a sheet that isn't A4 is refused", () => {
  const s = a4Scale(quad([[700, 500], [900, 500], [900, 700], [700, 700]])); // square
  assert.equal(s.ok, false);
  assert.equal(!s.ok && s.reason, "paper-aspect");
});

test("far from the sheet the plain scale is used, with more error", () => {
  const s = a4Scale(quad(sheet(0, 300, 600)));
  assert.ok(s.ok);
  const near = lengthCm(s, [300, 500], [300, 700]);
  const far = lengthCm(s, [1300, 300], [1300, 900]);
  assert.ok(near.perspective && !far.perspective);
  assert.ok(far.rel > near.rel);
  assert.ok(Math.abs(far.cm - 60) < 1, `${far.cm} cm`);
});
