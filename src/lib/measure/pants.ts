// Pants and shorts lying flat, front up. The orientation is found from the gap between the legs
// (it opens at the hem end), the waist is levelled, and the points of measure are taken from the
// outline. Ported from Seated Tailor's flat-lay outline (outline.ts), now on the floor-plane cm
// outline and with hip and thigh added.

import type { Pt } from "../geom/point.ts";
import { polylineLength } from "../geom/point.ts";
import { rotation, translation, type Affine } from "../geom/polygon.ts";
import { L, type Local } from "../i18n/lang.ts";
import type { PantsMeasures } from "../pattern/measures.ts";
import { arc, argBest, compose, crossings, dist, inRange, quarterTurns, transform, valueOf, widthAt, type Measured, type Shape, type Value } from "./shape.ts";

export const CROTCH_HIDDEN = L(
  "사진에서 두 다리가 붙어 가랑이가 가려졌습니다. 밑위는 최대값, 안솔기는 최소값으로만 읽었습니다. 다리를 벌려 다시 찍으면 정확해집니다.",
  "The legs touch in the photo, so the crotch is hidden. The rise is read only as a maximum and the inseam only as a minimum. Lay the legs apart and take it again for exact values.",
  "Las piernas se tocan en la foto y la entrepierna queda oculta. El tiro se lee solo como máximo y el largo de entrepierna solo como mínimo. Separa las piernas y vuelve a hacer la foto para valores exactos.",
);
export const HIP_SKIPPED = L(
  "가랑이가 가려져 엉덩이·허벅지 단면은 재지 않았습니다.",
  "With the crotch hidden, hip and thigh weren't measured.",
  "Con la entrepierna oculta, no se midieron la cadera ni el muslo.",
);

export type PantsKey = Exclude<keyof PantsMeasures, "backRiseExtra"> | "inseam";

const RANGES: Record<PantsKey, [number, number]> = {
  waist: [20, 70],
  hip: [30, 80],
  frontRise: [15, 45],
  outseam: [25, 125],
  inseam: [3, 95],
  thigh: [15, 50],
  legOpening: [8, 45],
};

// A crotch this close to the hem means the legs touch, so the gap only shows its lower end.
const CROTCH_HIDDEN_RATIO = 0.7;
const THIGH_BELOW_CROTCH = 2.5;

// How far the gap between the legs reaches up from the bottom.
export function legGapDepth(poly: readonly Pt[], step: number): number {
  const ys = poly.map((p) => p[1]);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  const height = bottom - top;
  let y = bottom - step / 2;
  while (y > bottom - 0.3 * height && crossings(poly, y).length < 4) y -= step;
  if (crossings(poly, y).length < 4) return 0;
  while (y > top && crossings(poly, y - step).length >= 4) y -= step;
  return bottom - y;
}

const farthestFromChord = (pts: readonly Pt[]) => {
  const a = pts[0], b = pts[pts.length - 1];
  const d = (p: Pt) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
  return pts.reduce((bi, p, i) => (d(p) > d(pts[bi]) ? i : bi), 0);
};

export function measurePants(shape: Shape): Measured<PantsKey> | { ok: false; detail: Local } {
  const notes: Local[] = [];
  // Quarter turns: keep the one with the legs' gap at the bottom.
  let best: { m: Affine; score: number; depth: number } | null = null;
  for (let k = 0; k < 4; k++) {
    const m = quarterTurns(k);
    const poly = transform(m, shape.outline);
    const flipped = poly.map(([x, y]): Pt => [x, -y]);
    const depth = legGapDepth(poly, 0.25);
    const score = depth - legGapDepth(flipped, 0.25);
    if (!best || score > best.score) best = { m, score, depth };
  }
  if (!best || best.depth < 2) return { ok: false, detail: L("두 다리 사이 틈을 찾지 못했습니다. 다리를 조금 벌려 펴 주십시오.", "Couldn't find the gap between the legs. Lay the legs slightly apart.", "No encontramos el hueco entre las piernas. Extiéndelas un poco separadas.") };

  // Level the waist: rotate so the two waist corners sit on one horizontal line, twice to settle.
  const waistCorners = (poly: Pt[]) => {
    const ys = poly.map((p) => p[1]);
    const top = Math.min(...ys), band = top + 0.25 * (Math.max(...ys) - top);
    const nearTop = (p: Pt) => p[1] <= band;
    return [argBest(poly, ([x, y]) => -x - y, nearTop), argBest(poly, ([x, y]) => x - y, nearTop)];
  };
  let m = best.m;
  for (let it = 0; it < 2; it++) {
    const poly = transform(m, shape.outline);
    const [l, r] = waistCorners(poly);
    m = compose(rotation(-Math.atan2(poly[r][1] - poly[l][1], poly[r][0] - poly[l][0])), m);
  }
  {
    const poly = transform(m, shape.outline);
    const [l, r] = waistCorners(poly);
    m = compose(translation(-(poly[l][0] + poly[r][0]) / 2, -(poly[l][1] + poly[r][1]) / 2), m);
  }
  const outline = transform(m, shape.outline);
  const n = outline.length;
  const [wl, wr] = waistCorners(outline);
  const hl = argBest(outline, ([x, y]) => -x + y);
  const hr = argBest(outline, ([x, y]) => x + y);
  if (new Set([wl, wr, hl, hr]).size < 4) return { ok: false, detail: L("허리와 밑단 모서리를 구분하지 못했습니다.", "Couldn't tell the waist corners from the hem corners.", "No pudimos distinguir las esquinas de la cintura de las del bajo.") };

  // The crotch is the highest point between the two outer hem corners, on the side away from the waist.
  const bottom = arc(n, hl, hr, wl);
  const crotchIdx = bottom.reduce((bi, i) => (outline[i][1] < outline[bi][1] ? i : bi), bottom[0]);
  if (crotchIdx === hl || crotchIdx === hr) return { ok: false, detail: L("가랑이 위치를 찾지 못했습니다.", "Couldn't find the crotch.", "No encontramos la entrepierna.") };
  const crotch = outline[crotchIdx];

  const leg = (outerIdx: number, waistIdx: number) => {
    const toCrotch = arc(n, outerIdx, crotchIdx, waistIdx).map((i) => outline[i]);
    const k = farthestFromChord(toCrotch);
    return {
      outerHem: outline[outerIdx],
      innerHem: toCrotch[k],
      outseam: arc(n, waistIdx, outerIdx, crotchIdx).map((i) => outline[i]),
      inseam: toCrotch.slice(k).reverse(),
    };
  };
  const left = leg(hl, wl), right = leg(hr, wr);
  const hemY = (left.outerHem[1] + right.outerHem[1]) / 2;
  const hidden = crotch[1] > CROTCH_HIDDEN_RATIO * hemY;
  if (hidden) notes.push(CROTCH_HIDDEN);

  const v = (cm: number, bound?: Value["bound"]) => valueOf(cm, shape, bound);
  const mean = (a: number, b: number) => (a + b) / 2;
  const values: Partial<Record<PantsKey, Value>> = {
    waist: v(dist(outline[wl], outline[wr])),
    frontRise: v(crotch[1], hidden ? "max" : undefined),
    outseam: v(mean(polylineLength(left.outseam), polylineLength(right.outseam))),
    inseam: v(mean(polylineLength(left.inseam), polylineLength(right.inseam)), hidden ? "min" : undefined),
    legOpening: v(mean(dist(left.outerHem, left.innerHem), dist(right.outerHem, right.innerHem))),
  };
  const segments: Measured<PantsKey>["segments"] = [
    { key: "waist", a: outline[wl], b: outline[wr] },
    { key: "frontRise", a: [crotch[0], 0], b: crotch },
    { key: "legOpening", a: right.outerHem, b: right.innerHem },
  ];
  // Hip: across both legs just above the crotch. Thigh: one leg just below it.
  const hipY = crotch[1] - 0.5;
  const hip = widthAt(outline, hipY);
  if (hip && !hidden) {
    values.hip = v(hip.right - hip.left);
    segments.push({ key: "hip", a: [hip.left, hipY], b: [hip.right, hipY] });
  }
  const thighY = crotch[1] + THIGH_BELOW_CROTCH;
  const xs = crossings(outline, thighY);
  if (xs.length === 4 && !hidden) {
    values.thigh = v(mean(xs[1] - xs[0], xs[3] - xs[2]));
    segments.push({ key: "thigh", a: [xs[2], thighY], b: [xs[3], thighY] });
  }
  if (hidden) notes.push(HIP_SKIPPED);

  const { values: kept, refused } = inRange(values, RANGES);
  return {
    values: kept,
    refused,
    landmarks: { waistLeft: outline[wl], waistRight: outline[wr], crotch, hemLeftOuter: left.outerHem, hemRightOuter: right.outerHem },
    segments,
    outline,
    frame: m,
    notes: [...shape.notes, ...notes],
  };
}
