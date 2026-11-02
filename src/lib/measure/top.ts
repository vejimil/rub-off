// Shirts, T-shirts and hoodies lying flat, neck toward the top of the photo. Points of measure
// from the outline, side by side:
//   hem        the lowest corners of the widest run near the bottom; the hem levels the garment
//              and its middle is the centre line
//   sleeves    each SAM sleeve mask is assigned to the side it hangs from (its highest point).
//              A sleeve whose middle lies over the body is folded over it and is not used; so is
//              one the layout check (Muse Spark) calls folded, hidden, bent or not a sleeve
//   armpits    on a side with a usable sleeve, the deepest dent next to that sleeve
//   side neck  the highest point either side of the centre line (a hood is removed beforehand)
//   shoulder   where the armhole seam (the sleeve mask's edge inside the garment, fitted with a
//              line) meets the top of the outline
//   sleeve     the outline from the shoulder point round the cuff to the armpit
// With one usable side, widths are that side mirrored across the centre line, and the note says
// so. With none, sleeve-side values are left to the tape measure. Neck drops can't be seen from
// the outline; they stay unmeasured and the draft says so.

import type { Pt } from "../geom/point.ts";
import { applyAffine, invertAffine, polygonCentroid, rotation, segDist, simplify, translation } from "../geom/polygon.ts";
import type { TopMeasures } from "../pattern/measures.ts";
import { arc, argBest, compose, crossings, defects, dist, inRange, transform, valueOf, type Measured, type Shape, type Value } from "./shape.ts";
import { L as Loc, type Local } from "../i18n/lang.ts";

const NO_HEM = Loc("밑단을 찾지 못했습니다.", "Couldn't find the hem.", "No encontramos el bajo.");

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
const ARMPIT_NEAR_SLEEVE = 4; // cm: the armpit is where the sleeve meets the body
const SHOULDER_FALLBACK_REL = 0.05;
// How far a landmark can be off on a real photo. On the owner's single-colour jersey T-shirt
// (11/1, tape-checked) the shoulder point from the sleeve mask landed 0.5–3 cm from the seam; the
// side neck point read 0.5 cm wide on each side.
const SHOULDER_POINT_CM = 2;
const NECK_POINT_CM = 0.5;
const USER_POINT_CM = 0.5; // a tap on the seam, at phone-photo resolution
const MIRRORED_REL = 0.05; // one side doubled: the centre line comes from the hem, and the garment may not lie symmetric (13% front-back gap on the owner's hoodie, 10/31)
const FOLDED_SHARE = 0.75; // a sleeve whose middle is within this share of the half hem is over the body

export interface TopOptions {
  // Per sleeve mask, in the same order: false when the layout check says it isn't a usable sleeve.
  sleeveUsable?: boolean[];
  hood?: Pt[] | null; // the hood's polygon, which points to the top of the garment
  // Shoulder points the user tapped, in the shape's cm: they replace the ones found from the masks.
  userShoulders?: Pt[];
  // True for a point (in the shape's cm) on the photo's edge: a cuff there is cut off by the frame.
  clipped?: (p: Pt) => boolean;
  extraRel?: number; // wrinkles seen by the layout check
}

type SideName = "left" | "right";

export function measureTop(shape: Shape, sleeves: Pt[][], opts: TopOptions = {}): Measured<TopKey> | { ok: false; detail: Local } {
  const notes: Local[] = [];

  // Hem corners: ends of the widest run of outline near the bottom, then the lowest-outward points there.
  // Which way is up: toward the hood, else toward the sleeves (they hang from the top of the
  // body), else the photo's own up. Then the nearest quarter turn stands the garment upright.
  const centre = polygonCentroid;
  const gc = centre(shape.outline);
  const hint = opts.hood?.length ? centre(opts.hood) : sleeves.length >= 2 ? centre(sleeves.map(centre)) : null;
  let turn = rotation(0);
  if (hint && Math.hypot(hint[0] - gc[0], hint[1] - gc[1]) > 2) {
    const up: Pt = [hint[0] - gc[0], hint[1] - gc[1]];
    const best = [0, 1, 2, 3].map((k) => rotation((k * Math.PI) / 2)).sort((p, q) => transform(p, [up])[0][1] - transform(q, [up])[0][1])[0];
    turn = best;
  }
  const upright = transform(turn, shape.outline);

  // `band`: how far up from the bottom to look; deeper before the garment is levelled.
  const hemCorners = (poly: readonly Pt[], band: number) => {
    const ys = poly.map((p) => p[1]);
    const top = Math.min(...ys), bottom = Math.max(...ys), h = bottom - top;
    const lefts: number[] = [], rights: number[] = [];
    for (let y = bottom - band * h; y < bottom - 0.02 * h; y += 0.01 * h) {
      const xs = crossings(poly, y);
      let best: [number, number] | null = null;
      for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
      if (best) {
        lefts.push(best[0]);
        rights.push(best[1]);
      }
    }
    if (!lefts.length) return null;
    const med = (a: number[]) => [...a].sort((p, q) => p - q)[a.length >> 1];
    const [l, r] = [med(lefts), med(rights)];
    const near = (p: Pt) => p[1] > bottom - band * h && p[0] > l - 3 && p[0] < r + 3;
    const hl = argBest(poly, ([x, y]) => -x + y, near), hr = argBest(poly, ([x, y]) => x + y, near);
    return hl < 0 || hr < 0 ? null : { hl, hr, top, h };
  };
  const h0 = hemCorners(upright, 0.3);
  if (!h0) return { ok: false, detail: NO_HEM };

  // Level the hem; the origin is the middle of the hem.
  const a = upright[h0.hl], b = upright[h0.hr];
  let m = compose(rotation(-Math.atan2(b[1] - a[1], b[0] - a[0])), turn);
  const mid = transform(rotation(-Math.atan2(b[1] - a[1], b[0] - a[0])), [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]])[0];
  m = compose(translation(-mid[0], -mid[1]), m);
  const outline = transform(m, shape.outline);
  const n = outline.length;
  const hc = hemCorners(outline, 0.12);
  if (!hc) return { ok: false, detail: NO_HEM };
  const hemL = outline[hc.hl], hemR = outline[hc.hr];
  const half = (hemR[0] - hemL[0]) / 2;
  const cx = (hemL[0] + hemR[0]) / 2;

  // Sleeves: which side each hangs from, and whether it is spread out or folded over the body.
  const sleevesF = sleeves.map((s) => transform(m, s));
  const usableBy: Record<SideName, Pt[] | null> = { left: null, right: null };
  const sleeveSeen: Record<SideName, boolean> = { left: false, right: false };
  sleevesF.forEach((sl, i) => {
    if (sl.length < 3) return;
    const attach = sl.reduce((bp, p) => (p[1] < bp[1] ? p : bp), sl[0]);
    const side: SideName = attach[0] < cx ? "left" : "right";
    sleeveSeen[side] = true;
    const c = polygonCentroid(sl);
    const folded = Math.abs(c[0] - cx) < FOLDED_SHARE * half;
    const vetoed = opts.sleeveUsable?.[i] === false;
    if (folded) notes.push(Loc(`${side === "left" ? "왼쪽" : "오른쪽"}(사진 기준) 소매가 몸판 위로 접혀 있어 그쪽은 재지 않았습니다.`, `The ${side} sleeve (as seen in the photo) is folded over the body, so that side wasn't measured.`, `La manga ${side === "left" ? "izquierda" : "derecha"} (según la foto) está doblada sobre el cuerpo, así que ese lado no se midió.`));
    else if (vetoed) notes.push(Loc(`${side === "left" ? "왼쪽" : "오른쪽"}(사진 기준) 소매가 펴져 있지 않아 보여 그쪽은 재지 않았습니다.`, `The ${side} sleeve (as seen in the photo) doesn't look spread out, so that side wasn't measured.`, `La manga ${side === "left" ? "izquierda" : "derecha"} (según la foto) no parece extendida, así que ese lado no se midió.`));
    else if (!usableBy[side]) usableBy[side] = sl;
  });
  // No sleeve masks at all: fall back to the outline on both sides (shoulder less certain).
  const noMasks = !sleeveSeen.left && !sleeveSeen.right;

  // Side neck points: highest point either side of the centre line.
  const nearNeck = (s: -1 | 1) => (p: Pt) => p[1] < -0.4 * (hc.h) && s * (p[0] - cx) > 0.5 && s * (p[0] - cx) < 0.6 * half;
  const nl = argBest(outline, ([, y]) => -y, nearNeck(-1)), nr = argBest(outline, ([, y]) => -y, nearNeck(1));
  if (nl < 0 || nr < 0) return { ok: false, detail: Loc("목둘레를 찾지 못했습니다. 목이 사진 위쪽으로 오게 펴 주십시오.", "Couldn't find the neckline. Lay the garment with the neck at the top of the photo.", "No encontramos el escote. Extiende la prenda con el cuello en la parte de arriba de la foto.") };
  const snpL = outline[nl], snpR = outline[nr];
  const snpY = (snpL[1] + snpR[1]) / 2;

  // Armpits: deepest dent on that side between the neck and the hem, next to its sleeve.
  const ds = defects(outline).filter((d) => d.depth >= MIN_ARMPIT_DEPTH && outline[d.i][1] > snpY + 0.1 * hc.h && outline[d.i][1] < -0.1 * hc.h);
  const nearPoly = (p: Pt, poly: readonly Pt[]) => Math.min(...poly.map((q) => dist(p, q)));
  const armpit = (side: SideName) => {
    const s = side === "left" ? -1 : 1;
    const mine = ds.filter((d) => s * (outline[d.i][0] - cx) > 0).sort((x, y) => y.depth - x.depth);
    const sl = usableBy[side];
    return (sl && mine.find((d) => nearPoly(outline[d.i], sl) <= ARMPIT_NEAR_SLEEVE)) ?? mine[0];
  };

  let fallback = false;
  // Shoulder points the user tapped on the photo, in this frame, by side.
  const tapped: Partial<Record<SideName, Pt>> = {};
  for (const p of opts.userShoulders ?? []) {
    const q = transform(m, [p])[0];
    tapped[q[0] < cx ? "left" : "right"] = q;
  }

  const measureSide = (side: SideName) => {
    if (!usableBy[side] && !noMasks) return null;
    const d = armpit(side);
    if (!d) return null;
    const snpIdx = side === "left" ? nl : nr;
    const sleeveArc = arc(n, snpIdx, d.i, side === "left" ? hc.hl : hc.hr).map((i) => outline[i]);
    const snp = outline[snpIdx], pit = outline[d.i];
    const mask = usableBy[side];
    let sp: Pt;
    let byUser = false;
    if (tapped[side]) {
      sp = tapped[side]!;
      byUser = true;
    } else if (mask) {
      // The armhole seam: the sleeve mask's edge inside the garment, fitted with a line; the
      // shoulder point is where that line meets the top of the outline. Without enough seam
      // edge, the mask point nearest the side neck point.
      sp = seamShoulderPoint(mask, outline, sleeveArc, pit) ?? mask.reduce((bp, p) => (dist(p, snp) < dist(bp, snp) ? p : bp), mask[0]);
    } else {
      fallback = true;
      const found = shoulderFromOutline(sleeveArc);
      if (!found) return null;
      sp = found;
    }
    // On the outline, and the sleeve's outline from there round the cuff to the armpit.
    const snapped = snapToPolyline(sleeveArc, sp);
    sp = snapped.pt;
    const rest = [sp, ...sleeveArc.slice(snapped.k + 1)];
    const cuff = cuffCorners(rest);
    if (!cuff) return null;
    const [cuffTop, cuffBottom] = cuff;
    // A cuff on the photo's edge is cut off: this side's sleeve can't be measured, the other side's can.
    const back = invertAffine(m);
    const cutOff = !!opts.clipped && [cuffTop, cuffBottom].some((p) => opts.clipped!(applyAffine(back, p)));
    // Bicep: from the armpit square across to the sleeve's top line.
    const u = [cuffTop[0] - sp[0], cuffTop[1] - sp[1]], ul = Math.hypot(u[0], u[1]) || 1;
    const bicep = Math.abs(u[0] * (pit[1] - sp[1]) - u[1] * (pit[0] - sp[0])) / ul;
    return { pit, sp, cuffTop, cuffBottom, sleeve: dist(sp, cuffTop), opening: dist(cuffTop, cuffBottom), bicep, cutOff, spCm: byUser ? USER_POINT_CM : SHOULDER_POINT_CM };
  };
  const L = measureSide("left"), R = measureSide("right");
  if (fallback) notes.push(Loc("소매를 찾지 못해 어깨점을 윤곽이 꺾이는 곳으로 잡았습니다(± 큼). 어깨너비를 확인해 주십시오.", "The sleeves weren't found, so the shoulder points were set where the outline bends (large ±). Check the shoulder width.", "No encontramos las mangas, así que los puntos del hombro se pusieron donde se quiebra el contorno (± grande). Revisa el ancho de hombros."));
  const sides = [L, R].filter((x): x is NonNullable<typeof x> => !!x);
  if (sides.length === 1) notes.push(Loc("한쪽 소매만 쓸 수 있어 가슴단면·어깨너비는 그쪽을 중심선에 대칭시켜 쟀습니다(± 큼).", "Only one sleeve could be used, so chest and shoulder were measured by mirroring that side across the centre (large ±).", "Solo se pudo usar una manga, así que el pecho y los hombros se midieron reflejando ese lado sobre el centro (± grande)."));
  if (sides.length === 0) notes.push(Loc("펴진 소매가 없어 가슴단면·어깨너비·소매 치수는 재지 않았습니다. 소매를 펴서 다시 찍거나 줄자로 재 주십시오.", "No sleeve is spread out, so chest, shoulder and sleeve weren't measured. Spread the sleeves and take it again, or measure them with a tape.", "Ninguna manga está extendida, así que no se midieron pecho, hombros ni mangas. Extiende las mangas y vuelve a hacer la foto, o mídelas con cinta."));
  // Sleeve length and opening only from a side whose cuff is inside the photo.
  const sleeveSides = sides.filter((x) => !x.cutOff);
  if (sides.length && sleeveSides.length < sides.length) {
    notes.push(
      sleeveSides.length
        ? Loc("한쪽 소맷부리가 사진 가장자리에 잘려 소매길이·소매단면은 다른 쪽에서 쟀습니다.", "One cuff is cut off by the edge of the photo, so sleeve length and opening were taken from the other side.", "Un puño queda cortado por el borde de la foto, así que el largo y la boca de manga se tomaron del otro lado.")
        : Loc("소맷부리가 사진 가장자리에 잘려 소매길이·소매단면은 재지 않았습니다. 옷 전체가 사진 안에 들어오게 찍어 주십시오.", "The cuffs are cut off by the edge of the photo, so sleeve length and opening weren't measured. Get the whole garment in the photo.", "Los puños quedan cortados por el borde de la foto, así que no se midieron el largo ni la boca de manga. Haz que la prenda entera entre en la foto."),
    );
  }

  const hemYAt = (x: number) => hemL[1] + ((x - hemL[0]) / (hemR[0] - hemL[0] || 1)) * (hemR[1] - hemL[1]);
  const avg = (xs: number[]) => xs.reduce((p, q) => p + q, 0) / xs.length;
  const extra = opts.extraRel ?? 0;
  const v = (cm: number, rel = 0, pointsCm = 0) => valueOf(cm, shape, undefined, Math.hypot(rel, extra), pointsCm);
  const two = (a: number, b: number) => Math.hypot(a, b);
  const spRel = fallback ? SHOULDER_FALLBACK_REL : 0;
  const both = L && R;
  const values: Partial<Record<TopKey, Value>> = {
    length: v(avg([hemYAt(snpL[0]) - snpL[1], hemYAt(snpR[0]) - snpR[1]]), 0, NECK_POINT_CM),
    hem: v(dist(hemL, hemR)),
    neckWidth: v(dist(snpL, snpR), 0, two(NECK_POINT_CM, NECK_POINT_CM)),
  };
  if (sides.length) {
    values.chest = both ? v(dist(L.pit, R.pit)) : v(2 * Math.abs(sides[0].pit[0] - cx), MIRRORED_REL);
    values.shoulder = both ? v(dist(L.sp, R.sp), spRel, two(L.spCm, R.spCm)) : v(2 * Math.abs(sides[0].sp[0] - cx), Math.hypot(spRel, MIRRORED_REL), 2 * sides[0].spCm);
    if (sleeveSides.length) {
      values.sleeve = v(avg(sleeveSides.map((x) => x.sleeve)), spRel, avg(sleeveSides.map((x) => x.spCm)));
      values.sleeveOpening = v(avg(sleeveSides.map((x) => x.opening)));
    }
    // The bicep is measured square to the sleeve's top line, which needs the cuff inside the photo.
    if (sleeveSides.length) values.bicep = v(avg(sleeveSides.map((x) => x.bicep)), 0, avg(sleeveSides.map((x) => x.spCm)) / 2);
    values.armholeDepth = v(avg(sides.map((x) => x.pit[1])) - snpY, 0, NECK_POINT_CM);
    values.shoulderDrop = v(Math.max(0, avg(sides.map((x) => x.sp[1])) - snpY), spRel, avg(sides.map((x) => x.spCm)) / 2);
  }
  const { values: kept, refused } = inRange(values, RANGES);
  const show = R ?? L;
  const segments: Measured<TopKey>["segments"] = [
    { key: "hem", a: hemL, b: hemR },
    { key: "length", a: snpR, b: [snpR[0], hemYAt(snpR[0])] },
    { key: "neckWidth", a: snpL, b: snpR },
  ];
  if (show) {
    const mirror = (p: Pt): Pt => [2 * cx - p[0], p[1]];
    segments.push(
      { key: "chest", a: L?.pit ?? mirror(show.pit), b: R?.pit ?? mirror(show.pit), mirrored: !both },
      { key: "shoulder", a: L?.sp ?? mirror(show.sp), b: R?.sp ?? mirror(show.sp), mirrored: !both },
    );
    // Every side's own sleeve lines, so a cuff cut off by the photo edge is caught on either side.
    for (const sd of sleeveSides) segments.push({ key: "sleeve", a: sd.sp, b: sd.cuffTop }, { key: "sleeveOpening", a: sd.cuffTop, b: sd.cuffBottom });
  }
  const landmarks: Record<string, Pt> = { hemL, hemR, snpL, snpR };
  for (const [k, sd] of [["L", L], ["R", R]] as const) if (sd) Object.assign(landmarks, { [`pit${k}`]: sd.pit, [`sp${k}`]: sd.sp, [`cuffTop${k}`]: sd.cuffTop, [`cuffBottom${k}`]: sd.cuffBottom });
  return { values: kept, refused, landmarks, segments, outline, frame: m, notes: [...shape.notes, ...notes] };
}

const CORNER_TURN = (40 * Math.PI) / 180;

function turnAt(s: readonly Pt[], i: number): number {
  const a1 = Math.atan2(s[i][1] - s[i - 1][1], s[i][0] - s[i - 1][0]), a2 = Math.atan2(s[i + 1][1] - s[i][1], s[i + 1][0] - s[i][0]);
  return Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
}

// The cuff's two corners on the outline from the shoulder point to the armpit: the first sharp
// turn walking out along the sleeve's top line, and the first walking back along its underarm.
// The nearest point on a polyline, and the index of the segment it lies on.
function snapToPolyline(pts: readonly Pt[], p: Pt): { pt: Pt; k: number } {
  let best = { pt: pts[0], k: 0, d: Infinity };
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    const q: Pt = [a[0] + t * dx, a[1] + t * dy];
    const d = dist(p, q);
    if (d < best.d) best = { pt: q, k, d };
  }
  return { pt: best.pt, k: best.k };
}

const SEAM_INSIDE_CM = 1; // mask edge this far inside the outline is the seam, not the garment's edge
const SEAM_MIN_POINTS = 6;

function seamShoulderPoint(mask: readonly Pt[], outline: readonly Pt[], sleeveArc: readonly Pt[], pit: Pt): Pt | null {
  // Mask edge every half centimetre, kept where it runs inside the garment.
  const pts: Pt[] = [];
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i], b = mask[(i + 1) % mask.length];
    const k = Math.max(1, Math.ceil(dist(a, b) / 0.5));
    for (let j = 0; j < k; j++) pts.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  const toOutline = (p: Pt) => Math.min(...outline.map((q, i) => segDist(p, q, outline[(i + 1) % outline.length])));
  const seam = pts.filter((p) => toOutline(p) > SEAM_INSIDE_CM);
  if (seam.length < SEAM_MIN_POINTS) return null;
  // Total least squares line through the seam points.
  const cx = seam.reduce((s, p) => s + p[0], 0) / seam.length, cy = seam.reduce((s, p) => s + p[1], 0) / seam.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of seam) {
    sxx += (x - cx) ** 2;
    syy += (y - cy) ** 2;
    sxy += (x - cx) * (y - cy);
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const d: Pt = [Math.cos(th), Math.sin(th)];
  // First crossing of that line with the outline from the side neck point outward, clear of the armpit.
  for (let i = 1; i < sleeveArc.length; i++) {
    const a = sleeveArc[i - 1], b = sleeveArc[i];
    const sa = (a[0] - cx) * d[1] - (a[1] - cy) * d[0], sb = (b[0] - cx) * d[1] - (b[1] - cy) * d[0];
    if (sa === sb || sa * sb > 0) continue;
    const t = sa / (sa - sb);
    const x: Pt = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    if (dist(x, pit) >= 3) return x;
  }
  return null;
}

// A kink in the mask edge right at the shoulder point or the armpit is not a cuff corner.
const CUFF_CLEAR_CM = 3;

function cuffCorners(rest: readonly Pt[]): [Pt, Pt] | null {
  const s = simplify(rest, 1);
  if (s.length < 4) return null;
  const start = s[0], end = s[s.length - 1];
  const clear = (i: number) => dist(s[i], start) >= CUFF_CLEAR_CM && dist(s[i], end) >= CUFF_CLEAR_CM;
  let top = -1, bottom = -1;
  for (let i = 1; i < s.length - 1 && top < 0; i++) if (clear(i) && turnAt(s, i) > CORNER_TURN) top = i;
  for (let i = s.length - 2; i > 0 && bottom < 0; i--) if (clear(i) && turnAt(s, i) > CORNER_TURN) bottom = i;
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
