// Shirts and T-shirts lying flat, front up, neck toward the top of the photo, sleeves spread out.
// Points of measure from the outline:
//   armpits    the deepest dents between sleeve and body (convexity defects)
//   hem        the lowest corners under the body
//   side neck  the highest point either side of the neck
//   shoulder   where the SAM sleeve mask starts nearest the side neck point; without a sleeve
//              mask, the sharpest turn between the shoulder line and the sleeve (less certain)
//   sleeve     the outline from the shoulder point round the cuff to the armpit
// Neck drops can't be seen from the outline; they stay unmeasured and the draft says so.

import type { Pt } from "../geom/point.ts";
import { rotation, simplify, translation } from "../geom/polygon.ts";
import type { TopMeasures } from "../pattern/measures.ts";
import { arc, argBest, compose, defects, dist, inRange, transform, valueOf, type Measured, type Shape, type Value } from "./shape.ts";

export type TopKey = Exclude<keyof TopMeasures, "frontNeckDrop" | "backNeckDrop">;

const RANGES: Record<TopKey, [number, number]> = {
  length: [35, 110],
  chest: [28, 85],
  shoulder: [25, 70],
  hem: [25, 95],
  sleeve: [4, 95],
  sleeveOpening: [5, 35],
  bicep: [8, 40],
  neckWidth: [8, 32],
  armholeDepth: [10, 40],
  shoulderDrop: [0, 12],
};

const MIN_ARMPIT_DEPTH = 2; // cm into the hull
const SHOULDER_FALLBACK_REL = 0.05;

export function measureTop(shape: Shape, sleeves: Pt[][]): Measured<TopKey> | { ok: false; detail: string } {
  const notes: string[] = [];
  const ys0 = shape.outline.map((p) => p[1]), xs0 = shape.outline.map((p) => p[0]);
  const top0 = Math.min(...ys0), height0 = Math.max(...ys0) - top0;
  const cx0 = (Math.min(...xs0) + Math.max(...xs0)) / 2;

  // Armpits: the deepest dent on each side, below the neck.
  const armpits = (poly: readonly Pt[], cx: number, top: number, h: number) => {
    const ds = defects(poly).filter((d) => d.depth >= MIN_ARMPIT_DEPTH && poly[d.i][1] > top + 0.12 * h);
    const side = (s: -1 | 1) => ds.filter((d) => s * (poly[d.i][0] - cx) > 0).sort((a, b) => b.depth - a.depth)[0];
    return [side(-1), side(1)] as const;
  };
  const [pl0, pr0] = armpits(shape.outline, cx0, top0, height0);
  if (!pl0 || !pr0) return { ok: false, detail: "양쪽 겨드랑이를 찾지 못했습니다. 소매를 몸판에서 떨어뜨려 펴 주십시오." };

  // Level the armpits and put the origin between them.
  const a = shape.outline[pl0.i], b = shape.outline[pr0.i];
  let m = rotation(-Math.atan2(b[1] - a[1], b[0] - a[0]));
  const mid = transform(m, [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]])[0];
  m = compose(translation(-mid[0], -mid[1]), m);
  const outline = transform(m, shape.outline);
  const sleevesF = sleeves.map((s) => transform(m, s));
  const n = outline.length;
  const ys = outline.map((p) => p[1]);
  const top = Math.min(...ys), h = Math.max(...ys) - top;
  const [dl, dr] = armpits(outline, 0, top, h);
  if (!dl || !dr) return { ok: false, detail: "양쪽 겨드랑이를 찾지 못했습니다." };
  const pitL = outline[dl.i], pitR = outline[dr.i];
  const chestW = dist(pitL, pitR);

  // Hem corners: lowest outward points under the body, not a hanging cuff beside it.
  const underBody = (p: Pt) => p[1] > 0 && p[0] > pitL[0] - 0.15 * chestW && p[0] < pitR[0] + 0.15 * chestW;
  const hl = argBest(outline, ([x, y]) => -x + y, underBody), hr = argBest(outline, ([x, y]) => x + y, underBody);
  if (hl < 0 || hr < 0) return { ok: false, detail: "밑단을 찾지 못했습니다." };
  const hemL = outline[hl], hemR = outline[hr];

  // Side neck points: highest point either side of the middle, above the armpits.
  const nearNeck = (s: -1 | 1) => (p: Pt) => p[1] < 0 && s * p[0] > 0.5 && s * p[0] < 0.3 * chestW;
  const nl = argBest(outline, ([, y]) => -y, nearNeck(-1)), nr = argBest(outline, ([, y]) => -y, nearNeck(1));
  if (nl < 0 || nr < 0) return { ok: false, detail: "목둘레를 찾지 못했습니다. 목이 사진 위쪽으로 오게 펴 주십시오." };
  const snpL = outline[nl], snpR = outline[nr];

  // Each side: shoulder point, then the sleeve as the outline from the side neck point to the armpit.
  let fallback = false;
  const side = (snpIdx: number, pitIdx: number, s: -1 | 1) => {
    const sleeveArc = arc(n, snpIdx, pitIdx, s < 0 ? hl : hr).map((i) => outline[i]);
    const snp = outline[snpIdx], pit = outline[pitIdx];
    const mask = sleevesF.filter((sl) => sl.some((p) => s * p[0] > 0)).sort((x, y) => near(y, snp) - near(x, snp))[0];
    let sp: Pt;
    if (mask) {
      // The sleeve point nearest the side neck point is where the sleeve meets the shoulder; snap it to the outline.
      const q = mask.reduce((bp, p) => (dist(p, snp) < dist(bp, snp) ? p : bp), mask[0]);
      sp = sleeveArc.reduce((bp, p) => (dist(p, q) < dist(bp, q) ? p : bp), sleeveArc[0]);
    } else {
      fallback = true;
      const found = shoulderFromOutline(sleeveArc);
      if (!found) return null;
      sp = found;
    }
    const rest = sleeveArc.slice(Math.max(0, sleeveArc.indexOf(sp)));
    const cuff = cuffCorners(rest);
    if (!cuff) return null;
    const [cuffTop, cuffBottom] = cuff;
    // Bicep: from the armpit square across to the sleeve's top line.
    const u = [cuffTop[0] - sp[0], cuffTop[1] - sp[1]], ul = Math.hypot(u[0], u[1]) || 1;
    const bicep = Math.abs(u[0] * (pit[1] - sp[1]) - u[1] * (pit[0] - sp[0])) / ul;
    return { sp, cuffTop, cuffBottom, sleeve: dist(sp, cuffTop), opening: dist(cuffTop, cuffBottom), bicep };
  };
  const L = side(nl, dl.i, -1), R = side(nr, dr.i, 1);
  if (!L || !R) return { ok: false, detail: "소매 끝을 찾지 못했습니다. 소매를 곧게 펴 주십시오." };
  if (fallback) notes.push("한쪽 소매를 SAM이 찾지 못해 어깨점을 윤곽이 꺾이는 곳으로 잡았습니다(± 큼). 어깨너비를 확인해 주십시오.");

  const hemYAt = (x: number) => hemL[1] + ((x - hemL[0]) / (hemR[0] - hemL[0] || 1)) * (hemR[1] - hemL[1]);
  const mean = (p: number, q: number) => (p + q) / 2;
  const v = (cm: number, extra = 0) => valueOf(cm, shape, undefined, extra);
  const spRel = fallback ? SHOULDER_FALLBACK_REL : 0;
  const values: Partial<Record<TopKey, Value>> = {
    length: v(mean(hemYAt(snpL[0]) - snpL[1], hemYAt(snpR[0]) - snpR[1])),
    chest: v(chestW),
    shoulder: v(dist(L.sp, R.sp), spRel),
    hem: v(dist(hemL, hemR)),
    sleeve: v(mean(L.sleeve, R.sleeve), spRel),
    sleeveOpening: v(mean(L.opening, R.opening)),
    bicep: v(mean(L.bicep, R.bicep)),
    neckWidth: v(dist(snpL, snpR)),
    armholeDepth: v(mean(pitL[1] - snpL[1], pitR[1] - snpR[1])),
    shoulderDrop: v(Math.max(0, mean(L.sp[1] - snpL[1], R.sp[1] - snpR[1])), spRel),
  };
  const { values: kept, refused } = inRange(values, RANGES);
  return {
    values: kept,
    refused,
    landmarks: { pitL, pitR, hemL, hemR, snpL, snpR, spL: L.sp, spR: R.sp, cuffTopR: R.cuffTop, cuffBottomR: R.cuffBottom },
    segments: [
      { key: "chest", a: pitL, b: pitR },
      { key: "hem", a: hemL, b: hemR },
      { key: "shoulder", a: L.sp, b: R.sp },
      { key: "length", a: snpR, b: [snpR[0], hemYAt(snpR[0])] },
      { key: "sleeve", a: R.sp, b: R.cuffTop },
      { key: "sleeveOpening", a: R.cuffTop, b: R.cuffBottom },
      { key: "neckWidth", a: snpL, b: snpR },
    ],
    outline,
    frame: m,
    notes: [...shape.notes, ...notes],
  };
}

const near = (poly: readonly Pt[], p: Pt) => -Math.min(...poly.map((q) => dist(p, q)));

const CORNER_TURN = (40 * Math.PI) / 180;

function turnAt(s: readonly Pt[], i: number): number {
  const a1 = Math.atan2(s[i][1] - s[i - 1][1], s[i][0] - s[i - 1][0]), a2 = Math.atan2(s[i + 1][1] - s[i][1], s[i + 1][0] - s[i][0]);
  return Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
}

// The cuff's two corners on the outline from the shoulder point to the armpit: the first sharp
// turn walking out along the sleeve's top line, and the first walking back along its underarm.
function cuffCorners(rest: readonly Pt[]): [Pt, Pt] | null {
  const s = simplify(rest, 1);
  if (s.length < 4) return null;
  let top = -1, bottom = -1;
  for (let i = 1; i < s.length - 1 && top < 0; i++) if (turnAt(s, i) > CORNER_TURN) top = i;
  for (let i = s.length - 2; i > 0 && bottom < 0; i--) if (turnAt(s, i) > CORNER_TURN) bottom = i;
  return top > 0 && bottom > top ? [s[top], s[bottom]] : null;
}

// Without a sleeve mask: the shoulder point is the sharpest turn between the side neck point and
// the cuff, where the shoulder line meets the sleeve's top line.
function shoulderFromOutline(sleeveArc: readonly Pt[]): Pt | null {
  const s = simplify(sleeveArc, 1);
  let cuffTop = -1;
  for (let i = 1; i < s.length - 1 && cuffTop < 0; i++) if (turnAt(s, i) > CORNER_TURN) cuffTop = i;
  // The shoulder turn is gentler than a cuff corner, so the first sharp turn may be the cuff itself:
  // look before it, and if nothing turns there, the shoulder point is the first sharp turn.
  let best = -1, bestTurn = 0;
  for (let i = 1; i < (cuffTop < 0 ? s.length - 1 : cuffTop); i++) {
    const t = turnAt(s, i);
    if (t > bestTurn) [best, bestTurn] = [i, t];
  }
  if (best > 0 && bestTurn > (10 * Math.PI) / 180) return s[best];
  return null;
}
