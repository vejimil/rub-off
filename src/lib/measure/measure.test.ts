import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pt } from "../geom/point.ts";
import { applyAffine, rotation } from "../geom/polygon.ts";
import type { Shape } from "./shape.ts";
import { measureBag, measureSkirt } from "./simple.ts";
import { measureTop } from "./top.ts";

// Pure geometry: outlines drawn in cm with known measurements (SAM is only tested on real photos).
const shapeOf = (outline: Pt[]): Shape => ({
  outline,
  plane: { toCm: (p) => p, toPx: (p) => p, rel: 0.01, perspective: true },
  pxPerCm: 20,
  notes: [],
});

// A T-shirt lying flat, front up, clockwise on screen. Side neck points at y = 0, x = ±9;
// shoulder points (±23.5, 4); armpits (±27, 23); hem corners (±26.5, 70); short sleeves.
const TEE: Pt[] = [
  [-9, 0], [-5, 2], [0, 2.5], [5, 2], [9, 0], // back neck (the highest edge)
  [23.5, 4], // right shoulder point
  [36, 15], [31, 26], // right sleeve: top line to the cuff, cuff across
  [27, 23], // right armpit
  [26.5, 70], [-26.5, 70], // hem
  [-27, 23], // left armpit
  [-31, 26], [-36, 15], // left sleeve
  [-23.5, 4],
];
// Sleeve masks: from the shoulder point out to the cuff.
const SLEEVES: Pt[][] = [
  [[23.5, 4], [36, 15], [31, 26], [27, 23]],
  [[-23.5, 4], [-27, 23], [-31, 26], [-36, 15]],
];

const close = (a: number | undefined, b: number, tol = 0.3) => assert.ok(a !== undefined && Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("a T-shirt's points of measure come from its outline and sleeve masks", () => {
  const m = measureTop(shapeOf(TEE), SLEEVES);
  assert.ok(!("ok" in m), JSON.stringify(m));
  const v = m.values;
  close(v.chest?.cm, 54);
  close(v.hem?.cm, 53);
  close(v.length?.cm, 70);
  close(v.shoulder?.cm, 47);
  close(v.neckWidth?.cm, 18);
  close(v.armholeDepth?.cm, 23);
  close(v.shoulderDrop?.cm, 4);
  close(v.sleeve?.cm, Math.hypot(36 - 23.5, 15 - 4));
  close(v.sleeveOpening?.cm, Math.hypot(36 - 31, 26 - 15));
});

test("a tilted photo gives the same T-shirt", () => {
  const r = rotation(0.12);
  const tilt = (pts: Pt[]) => pts.map((p) => applyAffine(r, p));
  const m = measureTop(shapeOf(tilt(TEE)), SLEEVES.map(tilt));
  assert.ok(!("ok" in m));
  close(m.values.chest?.cm, 54);
  close(m.values.length?.cm, 70, 0.6);
});

test("without sleeve masks the shoulder comes from the outline, with more ±", () => {
  const withMask = measureTop(shapeOf(TEE), SLEEVES);
  const without = measureTop(shapeOf(TEE), []);
  assert.ok(!("ok" in withMask) && !("ok" in without));
  close(without.values.shoulder?.cm, 47, 1);
  assert.ok(without.values.shoulder!.plusMinusCm > withMask.values.shoulder!.plusMinusCm);
});

test("a skirt lying sideways is stood up: waist, hem, length", () => {
  const skirt: Pt[] = [[0, 0], [62, -10], [62, 44], [0, 34]]; // waist on the left, hem on the right
  const m = measureSkirt(shapeOf(skirt));
  assert.ok(!("ok" in m), JSON.stringify(m));
  close(m.values.waist?.cm, 34);
  close(m.values.hem?.cm, 54);
  close(m.values.length?.cm, 62, 0.5);
});

test("a tote's body is the wide part under the handles", () => {
  const bag: Pt[] = [[0, 0], [4, 0], [4, -30], [32, -30], [32, 0], [36, 0], [36, 40], [0, 40]];
  const handle: Pt[] = [[0, 0], [60, 0], [60, 3], [0, 3]];
  const m = measureBag(shapeOf(bag), [handle]);
  assert.ok(!("ok" in m), JSON.stringify(m));
  close(m.values.width?.cm, 36);
  close(m.values.height?.cm, 40, 0.5);
  close(m.values.handleLength?.cm, 63, 0.5);
  close(m.values.handleWidth?.cm, 2.86, 0.2);
});
