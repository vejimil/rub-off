// Technical flat (도식화) of a garment, drawn from the same measurements its pattern is drafted
// from (tops take the drafted front and back pieces themselves), with each alteration of a work
// order marked on it at its real size: fabric taken away cross-hatched, fabric added hatched, a new
// line or opening drawn in the mark colour, and a numbered tag in the margin that matches the
// work order. Conventions in docs/FLAT-CONVENTIONS.md (carried over from Seated Tailor's flats).
// cm, y down, x to the viewer's right; origin at the centre top.

import { add, dist, lerp, pointAlong, polylineLength, scale, sub, xAt, type Pt } from "../geom/point.ts";
import { quad } from "../pattern/curves.ts";
import { draft } from "../pattern/draft.ts";
import { ELASTIC_CM, WAISTBAND_CM, ZIP_CM } from "../pattern/garments/lower.ts";
import { CUFF_HEIGHT } from "../pattern/garments/top.ts";
import { withDefaults, type MeasuresOf } from "../pattern/measures.ts";
import { isTop, NOT_WORN, type Fabric, type GarmentKind, type TopKind } from "../pattern/types.ts";
import { L, type Local } from "../i18n/lang.ts";
import type { Alteration } from "./alter.ts";

export type View = "front" | "back";

export interface Tag {
  n: number; // the work order's number
  anchors: Pt[];
  text: Local;
  at?: Pt; // where the marker sits in the margin, set by placeTags
}

export interface FlatView {
  view: View;
  outline: Pt[]; // closed silhouette
  seams: Pt[][];
  stitches: Pt[][];
  dots: Pt[]; // buttons
  add: Pt[][]; // fabric an alteration adds
  remove: Pt[][]; // fabric an alteration takes away
  marks: Pt[][]; // new lines and openings
  markDots: Pt[]; // snaps, magnets
  tags: Tag[];
}

const mirror = (pts: readonly Pt[]): Pt[] => pts.map(([x, y]) => [-x, y]);
const unit = (v: Pt): Pt => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};
const rotate = ([x, y]: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};
// A polyline moved `d` to the right of its direction of travel (into the garment for the
// necklines here).
function offset(pts: readonly Pt[], d: number): Pt[] {
  return pts.map((p, i) => {
    const t = unit(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]));
    return add(p, scale([-t[1], t[0]], d));
  });
}
// A curve across [-half, half]: `depth` at the centre, 0 at both ends, from y0.
const arch = (half: number, y0: number, depth: number): Pt[] => Array.from({ length: 21 }, (_, i) => -half + (i * half) / 10).map((x) => [x, y0 + depth * (1 - (x / half) ** 2)] as Pt);
const ellipse = (c: Pt, along: Pt, rx: number, ry: number): Pt[] =>
  Array.from({ length: 24 }, (_, i) => {
    const t = (i / 24) * 2 * Math.PI;
    return add(c, add(scale(along, rx * Math.cos(t)), scale([-along[1], along[0]], ry * Math.sin(t))));
  });

// The parts of a garment the marks attach to (right half; marks mirror them).
interface Base {
  kind: "top" | "pants" | "skirt";
  front: Omit<FlatView, "view" | "add" | "remove" | "marks" | "markDots" | "tags">;
  back: Omit<FlatView, "view" | "add" | "remove" | "marks" | "markDots" | "tags">;
  side: Pt[]; // right side seam, top to bottom
  hems: [Pt, Pt][]; // hem segments, left to right
  waist?: { half: number; band: number; elastic: boolean };
  sleeve?: { sp: Pt; top: Pt; cuff: Pt; pit: Pt; axis: Pt };
  pit?: Pt;
  cfTop: number; // y of the front neck or waist at the centre
  hip?: number;
  legs?: { outseam: Pt[] }; // right leg outseam, top to bottom
}

function topBase(garment: TopKind, m: MeasuresOf["hoodie"], fabric: Fabric): Base {
  const p = draft({ garment, measures: m as Partial<MeasuresOf["hoodie"]>, fabric });
  const f = p.pieces.find((x) => x.id === "front")!, b = p.pieces.find((x) => x.id === "back")!;
  const [neckF, , armhole, sideE, hemE] = f.edges.map((e) => e.pts);
  const neckB = b.edges[0].pts;
  const snp = neckF[neckF.length - 1], sp = armhole[0], pit = armhole[armhole.length - 1];
  const hemSide = sideE[sideE.length - 1], bodyHem = hemE[0][1];
  const rib = garment === "hoodie" || garment === "sweatshirt" ? m.ribHeight : 0;
  const plainKnit = garment === "t-shirt" || garment === "long-sleeve" || garment === "dress";
  const hemY = bodyHem + rib;

  // Sleeve: from the shoulder point along the shoulder line turned down, the measured length,
  // ending in the measured opening.
  const long = m.sleeve >= 40;
  const axis = unit(rotate(unit(sub(sp, snp)), long ? 58 : 32));
  const top = add(sp, scale(axis, m.sleeve));
  const cuff = add(top, scale([-axis[1], axis[0]], m.sleeveOpening));
  const sleeveR = [sp, top, cuff, pit];

  // A ribbed body gathers into a rib band as wide as the measured hem.
  const ribHalf = m.hem / 2;
  const bodyR: Pt[] = rib ? [...sideE, [ribHalf, bodyHem], [ribHalf, hemY]] : [...sideE];
  const right = (topEdge: Pt[]): Pt[] => [...topEdge, ...sleeveR.slice(0, 3), ...bodyR, [0, hemY]];

  // Top edge of the silhouette: the back neck (seen through the front opening), a collar stand,
  // or a hood.
  const hoodH = m.hoodHeight ?? 34;
  const hood: Pt[] = [[0, -0.9 * hoodH], ...quad([0, -0.9 * hoodH], [snp[0] + 6, -0.85 * hoodH], [snp[0] + 1.5, 0.5], 16).slice(1), sp];
  const collar: Pt[] = [[0, -3], [snp[0] + 0.4, -2.6], snp, ...[sp]];
  const plain: Pt[] = [...neckB, sp];
  const topEdge = garment === "hoodie" ? hood : garment === "shirt" ? collar : plain;
  const outline = [...mirror(right(topEdge)).reverse(), ...right(topEdge).slice(1)];

  const hemStitch = (y: number, half: number): Pt[] => [[-half, y], [half, y]];
  const sleeveStitch = (d: number): Pt[] => [sub(top, scale(axis, d)), sub(cuff, scale(axis, d))];
  const both = (pts: Pt[]) => [pts, mirror(pts)];
  const common = {
    seams: [...both(armhole), ...(rib ? [hemStitch(bodyHem, ribHalf), ...both(sleeveStitch(rib))] : []), ...(garment === "shirt" ? both(sleeveStitch(CUFF_HEIGHT)) : [])],
    stitches: [hemStitch(hemY - 2, xAt(sideE, hemY - 2)), ...(plainKnit ? both(sleeveStitch(2)) : [])],
  };

  const frontSeams: Pt[][] = [[...mirror(neckF).reverse(), ...neckF]];
  const frontStitches: Pt[][] = [];
  const dots: Pt[] = [];
  if (plainKnit || garment === "sweatshirt") frontStitches.push([...mirror(offset(neckF, 1.8)).reverse(), ...offset(neckF, 1.8)]);
  if (garment === "shirt") {
    // Placket and buttons on the centre front; collar leaves over the neckline.
    frontSeams.push([[1.5, neckF[0][1]], [1.5, hemY]]);
    for (let y = neckF[0][1] + 2; y < hemY - 4; y += 9) dots.push([0, y]);
    const leaf: Pt[] = [[snp[0] + 0.4, -2.6], [snp[0] + 1.8, 2], [4.5, neckF[0][1] + 2.5], [0.3, neckF[0][1]]];
    frontSeams.push(leaf, mirror(leaf));
  }
  if (garment === "hoodie") {
    frontSeams.push([[0, neckF[0][1]], [0, hemY]]);
    const face = quad([0, neckF[0][1]], [snp[0] - 1, -0.55 * hoodH], [0, -0.72 * hoodH], 16);
    frontSeams.push([...mirror(face).reverse(), ...face]);
  }
  const backSeams: Pt[][] = garment === "hoodie" ? [[[0, -0.9 * hoodH], [0, 0.5]]] : garment === "shirt" ? [[...mirror(neckB).reverse(), ...neckB]] : [];

  return {
    kind: "top",
    front: { outline, seams: [...common.seams, ...frontSeams], stitches: [...common.stitches, ...frontStitches], dots },
    back: { outline, seams: [...common.seams, ...backSeams], stitches: common.stitches, dots: [] },
    side: bodyR,
    hems: [[[-(rib ? ribHalf : hemSide[0]), hemY], [rib ? ribHalf : hemSide[0], hemY]]],
    sleeve: { sp, top, cuff, pit, axis },
    pit,
    cfTop: neckF[0][1],
  };
}

function pantsBase(m: MeasuresOf["pants"]): Base {
  const band = ELASTIC_CM + 1;
  const W = m.waist / 2, H = m.hip / 2, R = m.frontRise, O = m.outseam, lo = m.legOpening;
  const c = Math.max(H / 2, lo / 2 + 0.6); // leg centre at the hem
  const hipCurve = quad([W, band], [H, band + 0.35 * (R - band)], [H, R], 12);
  const outseam: Pt[] = [...hipCurve, [c + lo / 2, O]];
  const inseam: Pt[] = [[c - lo / 2, O], [0.8, R + 3], [0, R]];
  const right: Pt[] = [[0, 0], [W, 0], ...outseam, ...inseam.slice(0, 2)];
  const outline: Pt[] = [...mirror(right).reverse().slice(0, -1), ...right.slice(1), [0, R]];
  const gathers: Pt[][] = [];
  for (let x = 0.8; x < W - 0.4; x += 1.6) gathers.push([[x, 0.6], [x, band - 0.6]], [[-x, 0.6], [-x, band - 0.6]]);
  const legHem = (y: number): Pt[][] => [[[c - lo / 2, y], [c + lo / 2, y]], mirror([[c - lo / 2, y], [c + lo / 2, y]])];
  const base = { seams: [[[-W, band], [W, band]] as Pt[], [[0, band], [0, R]] as Pt[]], stitches: [...gathers, ...legHem(O - 2.5)], dots: [] };
  return {
    kind: "pants",
    front: { outline, ...base },
    back: { outline, ...base },
    side: outseam,
    hems: [mirror([[c + lo / 2, O], [c - lo / 2, O]]) as [Pt, Pt], [[c - lo / 2, O], [c + lo / 2, O]]],
    waist: { half: W, band, elastic: true },
    cfTop: 0,
    hip: H,
    legs: { outseam },
  };
}

function skirtBase(m: MeasuresOf["skirt"]): Base {
  const band = ELASTIC_CM + 1;
  const H = m.hem / 2, W = 0.62 * H; // gathered into the band; the drawing's proportion only
  const side: Pt[] = [[W, band], [H, m.length]];
  const right: Pt[] = [[0, 0], [W, 0], ...side];
  const outline: Pt[] = [...mirror(right).reverse().slice(0, -1), ...right.slice(1), [0, m.length]];
  const gathers: Pt[][] = [];
  for (let x = 0.8; x < W - 0.4; x += 1.6) gathers.push([[x, band], [x * (H / W), band + 4]], [[-x, band], [(-x * H) / W, band + 4]]);
  const base = { seams: [[[-W, band], [W, band]] as Pt[]], stitches: [...gathers, [[-H, m.length - 2.5], [H, m.length - 2.5]] as Pt[]], dots: [] };
  return { kind: "skirt", front: { outline, ...base }, back: { outline, ...base }, side, hems: [[[-H, m.length], [H, m.length]]], waist: { half: W, band, elastic: true }, cfTop: 0 };
}

// A waistband and a plain panel flaring to the hem; the zip in the wearer's left side seam.
function aLineBase(m: MeasuresOf["a-line-skirt"]): Base {
  const band = WAISTBAND_CM;
  const W = m.waist / 2, H = m.hem / 2;
  const side: Pt[] = [[W, band], [H, m.length]];
  const right: Pt[] = [[0, 0], [W, 0], ...side];
  const outline: Pt[] = [...mirror(right).reverse().slice(0, -1), ...right.slice(1), [0, m.length]];
  const hem: Pt[] = [[-H, m.length - 2.5], [H, m.length - 2.5]];
  const zip: Pt[] = [[W, band], lerp([W, band], [H, m.length], ZIP_CM / m.length)];
  return {
    kind: "skirt",
    front: { outline, seams: [[[-W, band], [W, band]]], stitches: [hem], dots: [] },
    back: { outline, seams: [[[-W, band], [W, band]], mirror(zip)], stitches: [hem], dots: [] },
    side,
    hems: [[[-H, m.length], [H, m.length]]],
    waist: { half: W, band, elastic: false },
    cfTop: 0,
  };
}

export function baseFor(garment: GarmentKind, measures: Record<string, number>, fabric: Fabric): Base | null {
  if (NOT_WORN.includes(garment)) return null;
  const m = withDefaults(garment, measures as Partial<MeasuresOf[typeof garment]>).measures as unknown as Record<string, number>;
  try {
    if (garment === "pants") return pantsBase(m as unknown as MeasuresOf["pants"]);
    if (garment === "skirt") return skirtBase(m as unknown as MeasuresOf["skirt"]);
    if (garment === "a-line-skirt") return aLineBase(m as unknown as MeasuresOf["a-line-skirt"]);
    return isTop(garment) ? topBase(garment, m as unknown as MeasuresOf["hoodie"], fabric) : null;
  } catch {
    return null; // a required measurement is missing
  }
}

const NOMINAL = 2; // drawn size of an amount the tailor will measure
const TO_MEASURE = L("재서 정함", "to measure", "a medir");
const PATCH = L("덧댐", "patch", "refuerzo");

// The flat's two views with the work order marked on them.
export function flatFor(garment: GarmentKind, measures: Record<string, number>, fabric: Fabric, order: readonly Alteration[]): FlatView[] | null {
  const base = baseFor(garment, measures, fabric);
  if (!base) return null;
  const views: Record<View, FlatView> = {
    front: { view: "front", ...base.front, add: [], remove: [], marks: [], markDots: [], tags: [] },
    back: { view: "back", ...base.back, add: [], remove: [], marks: [], markDots: [], tags: [] },
  };
  order.forEach((a, i) => mark(base, views, a, i + 1));
  for (const v of Object.values(views)) placeTags(v);
  return [views.front, views.back];
}

function mark(base: Base, views: Record<View, FlatView>, a: Alteration, n: number) {
  const amt = a.amountCm ?? NOMINAL;
  const known = a.amountCm !== undefined;
  const same = (s: string) => L(s, s, s);
  const text = (sign: "−" | "+" | "") => (known ? same(`${sign}${a.amountCm} cm`) : TO_MEASURE);
  // A symmetric mark is tagged on one side only, so the leader doesn't cross the garment.
  const tag = (view: View, anchors: Pt[], t: Local) => {
    const right = anchors.filter((p) => p[0] >= -1e-6);
    views[view].tags.push({ n, anchors: right.length && right.length < anchors.length ? right : anchors, text: t });
  };
  const sideX = (y: number) => xAt(base.side, y);

  // Hems: a strip above (taken away) or below (added) each hem segment.
  const hemStrip = (sign: -1 | 1, view: View = "front") => {
    const v = views[view];
    for (const [l, r] of base.hems) {
      const y = l[1], y2 = y + sign * amt;
      const rx = base.kind === "top" && sign < 0 ? Math.min(r[0], sideX(y2)) : r[0];
      const strip: Pt[] = [l, r, [rx, y2], [l[0] === -r[0] ? -rx : l[0], y2]];
      (sign < 0 ? v.remove : v.add).push(strip);
      v.marks.push([strip[3], strip[2]]);
    }
    const [l, r] = base.hems[base.hems.length - 1];
    tag(view, [[(l[0] + r[0]) / 2 + (r[0] - l[0]) / 4, l[1] + (sign * amt) / 2]], text(sign < 0 ? "−" : "+"));
  };
  // Side seams: a band inside (taken in) or outside (let out), half the flat amount on each side.
  const sideBand = (sign: -1 | 1, from = 0) => {
    const pts = base.side.filter(([, y]) => y >= from);
    const band = [...pts, ...[...pts].reverse().map(([x, y]) => [x + (sign * amt) / 2, y] as Pt)];
    const v = views.front;
    (sign < 0 ? v.remove : v.add).push(band, mirror(band));
    const mid = pts[Math.floor(pts.length / 2)];
    tag("front", [[mid[0] + (sign * amt) / 4, mid[1]], [-mid[0] - (sign * amt) / 4, mid[1]]], text(sign < 0 ? "−" : "+"));
  };
  const sleeveStrip = (sign: -1 | 1) => {
    const s = base.sleeve;
    if (!s) return;
    const d = scale(s.axis, sign * amt);
    const strip: Pt[] = [s.top, s.cuff, add(s.cuff, d), add(s.top, d)];
    const v = views.front;
    (sign < 0 ? v.remove : v.add).push(strip, mirror(strip));
    v.marks.push([strip[3], strip[2]], mirror([strip[3], strip[2]]));
    tag("front", [lerp(add(s.top, scale(d, 0.5)), add(s.cuff, scale(d, 0.5)), 0.5)], text(sign < 0 ? "−" : "+"));
  };

  const id = a.id.replace(/^(body|say)-/, "");
  const delta = a.delta ? Object.values(a.delta)[0] : undefined;
  const dir: -1 | 1 = delta !== undefined && delta > 0 ? 1 : -1;
  const W = base.waist?.half ?? 0;

  switch (id) {
    case "length":
    case "outseam":
      return hemStrip(dir);
    case "body-long":
    case "pants-long":
    case "skirt-long":
      return hemStrip(-1);
    case "seat-hem-short":
    case "body-short":
    case "pants-short":
      return hemStrip(1);
    case "sleeve":
      return sleeveStrip(dir);
    case "sleeve-long":
      return sleeveStrip(-1);
    case "sleeve-short":
      return sleeveStrip(1);
    case "body-loose":
      return sideBand(-1);
    case "leg-wide":
      return sideBand(-1, base.legs ? base.legs.outseam[base.legs.outseam.length - 2][1] : 0);
    case "chest":
    case "hem":
    case "hip":
      return sideBand(dir, base.kind === "top" ? 0 : (base.waist?.band ?? 0));
    case "thigh":
    case "legOpening":
      return sideBand(dir, base.legs ? base.legs.outseam[base.legs.outseam.length - 2][1] : 0);
    case "body-tight":
      return sideBand(1);
    case "bicep": {
      const s = base.sleeve;
      if (!s) return;
      const band: Pt[] = [s.pit, s.cuff, add(s.cuff, scale([-s.axis[1], s.axis[0]], (-dir * amt) / 2)), add(s.pit, scale([-s.axis[1], s.axis[0]], (-dir * amt) / 2))];
      (dir < 0 ? views.front.remove : views.front.add).push(band, mirror(band));
      return tag("front", [lerp(s.pit, s.cuff, 0.5)], text(dir < 0 ? "−" : "+"));
    }
    case "shoulder":
    case "shoulder-wide":
      if (base.sleeve) tag("front", [base.sleeve.sp, [-base.sleeve.sp[0], base.sleeve.sp[1]]], text(dir < 0 ? "−" : "+"));
      return;
    case "waist":
    case "waist-loose":
    case "waist-tight":
      if (base.waist && !base.waist.elastic) return sideBand(dir);
      if (base.waist) {
        views.front.marks.push([[-W, base.waist.band / 2], [W, base.waist.band / 2]]);
        const n = `${(id === "waist" && dir > 0) || id === "waist-tight" ? "+" : "−"}${id === "waist" ? 2 * a.amountCm! : a.amountCm} cm`;
        tag("front", [[W, base.waist.band / 2]], known ? L(`고무줄 ${n}`, `elastic ${n}`, `elástico ${n}`) : TO_MEASURE);
      }
      return;
    case "frontRise":
    case "seat-front-bunches": {
      const lower = id === "seat-front-bunches" || dir < 0;
      const curve = arch(W, 0, (lower ? 1 : -1) * amt);
      const area: Pt[] = [...curve, [W, 0], [-W, 0]];
      (lower ? views.front.remove : views.front.add).push(area);
      views.front.marks.push(curve);
      return tag("front", [[0, (lower ? amt : -amt) / 2]], text(lower ? "−" : "+"));
    }
    case "seat-back-drops": {
      const curve = arch(W, 0, -amt);
      views.back.add.push([...curve, [W, 0], [-W, 0]]);
      views.back.marks.push(curve);
      return tag("back", [[0, -amt / 2]], text("+"));
    }
    case "seat-presses": {
      if (!base.waist || !base.hip) return;
      const y = base.waist.band + 3, cx = base.hip / 2;
      const pocket = (x: number): Pt[] => [[x - 6.5, y], [x + 6.5, y], [x + 6, y + 14], [x, y + 15.5], [x - 6, y + 14]];
      views.back.remove.push(pocket(cx), pocket(-cx));
      return tag("back", [[cx, y + 7], [-cx, y + 7]], L("떼기", "remove", "quitar"));
    }
    case "cast-leg": {
      if (!base.legs) return;
      const leg = [...base.legs.outseam].reverse(); // hem upwards
      const open = Math.min(a.amountCm ?? 20, polylineLength(leg));
      const signs = a.side === "both" || !a.side ? [-1, 1] : [a.side === "left" ? 1 : -1]; // the wearer's left is the viewer's right, from the front
      for (const sg of signs) {
        const along: Pt[] = [];
        for (let d = 0; d <= open + 1e-9; d += 1) along.push(pointAlong(leg, Math.min(d, open)));
        const line = sg > 0 ? along : mirror(along);
        views.front.marks.push(line);
        for (let d = 2.5; d < open; d += 5) {
          const p = pointAlong(leg, d);
          views.front.markDots.push(sg > 0 ? p : [-p[0], p[1]]);
        }
        tag("front", [line[Math.floor(line.length / 2)]], known ? L(`트임 ${a.amountCm} cm`, `open ${a.amountCm} cm`, `abrir ${a.amountCm} cm`) : TO_MEASURE);
      }
      return;
    }
    case "hard-pull-up": {
      if (!base.waist) return;
      const loops = [-W + 3, 0, W - 3].map((x): Pt[] => [[x - 1, 0], [x - 1, 4], [x + 1, 4], [x + 1, 0]]);
      views.back.marks.push(...loops);
      return tag("back", loops.map((l) => l[1]), L("고리", "loops", "presillas"));
    }
    case "seat-top-bunches": {
      const [l, r] = base.hems[0];
      const curve = arch(r[0], l[1], -amt);
      views.front.remove.push([...curve, r, l]);
      views.front.marks.push(curve);
      return tag("front", [[0, l[1] - amt / 2]], text("−"));
    }
    case "elbows-wear": {
      const s = base.sleeve;
      if (!s) return;
      const c = add(lerp(s.sp, s.top, 0.6), scale([-s.axis[1], s.axis[0]], dist(s.top, s.cuff) / 2));
      const patch = ellipse(c, s.axis, 5, 3.5);
      views.back.add.push(patch, mirror(patch));
      return tag("back", [c, [-c[0], c[1]]], PATCH);
    }
    case "crutch-underarm": {
      if (!base.pit) return;
      const patch = ellipse(base.pit, [0, 1], 4, 3);
      views.front.add.push(patch, mirror(patch));
      return tag("front", [base.pit, [-base.pit[0], base.pit[1]]], PATCH);
    }
    case "hard-fasten": {
      if (base.kind === "top") {
        const dots = base.front.dots.length ? base.front.dots : [[0, base.cfTop + 6] as Pt];
        views.front.markDots.push(...dots);
        return tag("front", [dots[Math.floor(dots.length / 2)]], L("자석", "magnets", "imanes"));
      }
      views.front.marks.push([[-1, 0], [-1, 5], [1, 5], [1, 0]]);
      return tag("front", [[0, 5]], L("고리", "pull", "tirador"));
    }
    default:
      return;
  }
}

// Markers go in the margin beside the silhouette, at their anchors' height, without overlapping.
function placeTags(v: FlatView) {
  const xs = v.outline.map((p) => p[0]), ys = v.outline.map((p) => p[1]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const gap = 0.09 * size, step = 0.075 * size;
  for (const sgn of [-1, 1]) {
    const mine = v.tags.filter((t) => Math.sign(t.anchors.reduce((s, p) => s + p[0], 0) || 1) === sgn).sort((a, b) => avgY(a) - avgY(b));
    let last = -Infinity;
    for (const t of mine) {
      const y = Math.max(avgY(t), last + step);
      t.at = [sgn > 0 ? Math.max(...xs) + gap : Math.min(...xs) - gap, y];
      last = y;
    }
  }
}
const avgY = (t: Tag) => t.anchors.reduce((s, p) => s + p[1], 0) / t.anchors.length;
