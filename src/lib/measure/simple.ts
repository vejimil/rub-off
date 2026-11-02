// Skirts, aprons, tote bags and plain rectangles (cushion covers, pouches) lying flat. A skirt is a
// waist band on top and a hem below: the wider end is the hem; an apron is the same shape, its bib
// on top. A bag's body is the wide part at the bottom; the handles rise above it, narrower.

import type { Pt } from "../geom/point.ts";
import { polygonArea, perimeter, rotation, translation } from "../geom/polygon.ts";
import { L, type Local } from "../i18n/lang.ts";
import type { ApronMeasures, BagMeasures, SkirtMeasures } from "../pattern/measures.ts";
import { argBest, compose, dist, inRange, quarterTurns, transform, valueOf, widthAt, type Measured, type Shape, type Value } from "./shape.ts";

export type SkirtKey = keyof SkirtMeasures | "waist";
const SKIRT_RANGES: Record<SkirtKey, [number, number]> = { length: [25, 120], hem: [25, 150], waist: [20, 70] };

const bandWidth = (poly: readonly Pt[], from: number, to: number) => {
  const ys = poly.map((p) => p[1]);
  const top = Math.min(...ys), h = Math.max(...ys) - top;
  const ws: number[] = [];
  for (let t = from; t <= to; t += 0.02) {
    const w = widthAt(poly, top + t * h);
    if (w) ws.push(w.right - w.left);
  }
  return ws.length ? ws.reduce((s, x) => s + x, 0) / ws.length : 0;
};

// The quarter turn that stands the shape up with its wider end down (for a skirt) or up.
function upright(outline: readonly Pt[], widerDown: boolean) {
  let best = { k: 0, score: -Infinity };
  for (let k = 0; k < 4; k++) {
    const poly = transform(quarterTurns(k), outline);
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const tall = Math.max(...ys) - Math.min(...ys) >= 0.6 * (Math.max(...xs) - Math.min(...xs)) ? 1 : 0;
    const d = bandWidth(poly, 0.85, 0.97) - bandWidth(poly, 0.03, 0.15);
    const score = tall * 1000 + (widerDown ? d : -d);
    if (score > best.score) best = { k, score };
  }
  return quarterTurns(best.k);
}

export function measureSkirt(shape: Shape): Measured<SkirtKey> | { ok: false; detail: Local } {
  let m = upright(shape.outline, true);
  let poly = transform(m, shape.outline);
  const corners = (p: Pt[]) => {
    const ys = p.map((q) => q[1]), top = Math.min(...ys), h = Math.max(...ys) - top;
    const nearTop = (q: Pt) => q[1] < top + 0.15 * h, nearBottom = (q: Pt) => q[1] > top + 0.85 * h;
    return {
      wl: argBest(p, ([x, y]) => -x - y, nearTop),
      wr: argBest(p, ([x, y]) => x - y, nearTop),
      hl: argBest(p, ([x, y]) => -x + y, nearBottom),
      hr: argBest(p, ([x, y]) => x + y, nearBottom),
    };
  };
  // Level the waist and put its middle at the origin.
  let c = corners(poly);
  m = compose(rotation(-Math.atan2(poly[c.wr][1] - poly[c.wl][1], poly[c.wr][0] - poly[c.wl][0])), m);
  poly = transform(m, shape.outline);
  c = corners(poly);
  m = compose(translation(-(poly[c.wl][0] + poly[c.wr][0]) / 2, -(poly[c.wl][1] + poly[c.wr][1]) / 2), m);
  poly = transform(m, shape.outline);
  c = corners(poly);
  if (new Set([c.wl, c.wr, c.hl, c.hr]).size < 4) return { ok: false, detail: L("허리와 밑단 모서리를 찾지 못했습니다.", "Couldn't find the corners of the waist and the hem.", "No encontramos las esquinas de la cintura y del bajo.") };
  const [wl, wr, hl, hr] = [poly[c.wl], poly[c.wr], poly[c.hl], poly[c.hr]];
  const hemY = (hl[1] + hr[1]) / 2;
  const v = (cm: number): Value => valueOf(cm, shape);
  const { values, refused } = inRange<SkirtKey>({ waist: v(dist(wl, wr)), hem: v(dist(hl, hr)), length: v(hemY) }, SKIRT_RANGES);
  return {
    values,
    refused,
    landmarks: { wl, wr, hl, hr },
    segments: [
      { key: "waist", a: wl, b: wr },
      { key: "hem", a: hl, b: hr },
      { key: "length", a: [0, 0], b: [0, hemY] },
    ],
    outline: poly,
    frame: m,
    notes: shape.notes,
  };
}

// An apron measures like a skirt: the bib's top edge where the waist is, the skirt's hem below.
export type ApronKey = Extract<keyof ApronMeasures, "width" | "length" | "bibWidth">;
const APRON_KEY: Record<SkirtKey, ApronKey> = { waist: "bibWidth", hem: "width", length: "length" };

export function measureApron(shape: Shape): Measured<ApronKey> | { ok: false; detail: Local } {
  const m = measureSkirt(shape);
  if ("ok" in m) return m;
  return {
    ...m,
    values: Object.fromEntries(Object.entries(m.values).map(([k, v]) => [APRON_KEY[k as SkirtKey], v])) as Partial<Record<ApronKey, Value>>,
    refused: m.refused.map((r) => ({ ...r, key: APRON_KEY[r.key] })),
    segments: m.segments.map((s) => ({ ...s, key: APRON_KEY[s.key as SkirtKey] })),
    notes: [...m.notes, L("가슴판 높이와 끈 길이는 사진으로 잴 수 없습니다. 재단 전에 재 주십시오.", "The bib height and the strap lengths can't be read from the photo. Measure them before cutting.", "El alto del peto y el largo de las tiras no se pueden medir en la foto. Mídelos antes de cortar.")],
  };
}

// A cushion cover or a pouch: a rectangle, its width across the middle and its full height.
export type RectKey = "width" | "height";
const RECT_RANGES: Record<RectKey, [number, number]> = { width: [8, 100], height: [8, 100] };

export function measureRect(shape: Shape): Measured<RectKey> | { ok: false; detail: Local } {
  const m = upright(shape.outline, true);
  let poly = transform(m, shape.outline);
  const ys = poly.map((p) => p[1]);
  const top = Math.min(...ys), height = Math.max(...ys) - top;
  const frame = compose(translation(0, -top), m);
  poly = transform(frame, shape.outline);
  const width = bandWidth(poly, 0.2, 0.8);
  const { values, refused } = inRange<RectKey>({ width: valueOf(width, shape), height: valueOf(height, shape) }, RECT_RANGES);
  const w = widthAt(poly, height / 2);
  return {
    values,
    refused,
    landmarks: {},
    segments: w ? [{ key: "width", a: [w.left, height / 2], b: [w.right, height / 2] }, { key: "height", a: [(w.left + w.right) / 2, 0], b: [(w.left + w.right) / 2, height] }] : [],
    outline: poly,
    frame,
    notes: shape.notes,
  };
}

export type BagKey = Exclude<keyof BagMeasures, "gusset">;
const BAG_RANGES: Record<BagKey, [number, number]> = { width: [10, 80], height: [10, 80], handleLength: [10, 150], handleWidth: [1, 10] };
const BODY_SHARE = 0.85; // the body is near rectangular; the handles' arch is much narrower

export function measureBag(shape: Shape, handles: Pt[][]): Measured<BagKey> | { ok: false; detail: Local } {
  // Body at the bottom, handles on top: the narrow end goes up.
  const m0 = upright(shape.outline, true);
  let poly = transform(m0, shape.outline);
  const ys = poly.map((p) => p[1]);
  const top = Math.min(...ys), bottom = Math.max(...ys);
  const body = bandWidth(poly, 0.75, 0.95);
  // Walk up from the bottom until the outline narrows to the handles.
  let bodyTop = top;
  for (let y = bottom - 0.5; y > top; y -= 0.25) {
    const w = widthAt(poly, y);
    if (!w || w.right - w.left < BODY_SHARE * body) {
      bodyTop = y + 0.25;
      break;
    }
  }
  const m = compose(translation(0, -bodyTop), m0);
  poly = transform(m, shape.outline);
  const height = bottom - bodyTop;
  const v = (cm: number, extra = 0): Value => valueOf(cm, shape, undefined, extra);
  const values: Partial<Record<BagKey, Value>> = { width: v(body), height: v(height) };
  // A handle strap: area ≈ length × width, perimeter ≈ 2 × length.
  const straps = handles.filter((p) => p.length >= 4).map((p) => ({ len: perimeter(p) / 2, wid: (2 * polygonArea(p)) / perimeter(p) }));
  if (straps.length) {
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
    values.handleLength = v(med(straps.map((s) => s.len)), 0.08);
    values.handleWidth = v(med(straps.map((s) => s.wid)), 0.1);
  }
  const { values: kept, refused } = inRange(values, BAG_RANGES);
  const w = widthAt(poly, height / 2);
  return {
    values: kept,
    refused,
    landmarks: {},
    segments: w ? [{ key: "width", a: [w.left, height / 2], b: [w.right, height / 2] }, { key: "height", a: [(w.left + w.right) / 2, 0], b: [(w.left + w.right) / 2, height] }] : [],
    outline: poly,
    frame: m,
    notes: [...shape.notes, ...(straps.length
        ? [L("손잡이 길이와 폭은 사진에 보이는 손잡이 넓이로 추정했습니다. 재단 전에 재 주십시오.", "Handle length and width are estimated from the handles' area in the photo. Measure them before cutting.", "El largo y el ancho de las asas se estimaron por su superficie en la foto. Mídelos antes de cortar.")]
        : [L("손잡이를 찾지 못했습니다. 손잡이 길이를 입력해 주십시오.", "Couldn't find the handles. Enter the handle length.", "No encontramos las asas. Escribe el largo del asa.")])],
  };
}
