// The lengths printed on a pattern, all measured on its own seam lines: each edge's length, and the
// seams that are sewn to each other with how far apart they are (a sleeve cap is longer than its
// armhole by the ease; a front and back side seam should match). A sewer checks a pattern with
// exactly these numbers, and they can be checked against the original garment with a tape.

import { pointAlong, polylineLength, sub, type Pt } from "../geom/point.ts";
import { normalized } from "./seam.ts";
import type { EdgeKind, Pattern, Piece } from "./types.ts";

export const EDGE_EN: Record<EdgeKind, string> = {
  side: "Side",
  shoulder: "Shoulder",
  armhole: "Armhole",
  "sleeve-cap": "Cap",
  underarm: "Underarm",
  hem: "Hem",
  "sleeve-hem": "Hem",
  neck: "Neck",
  waist: "Waist",
  casing: "Waist",
  "bag-top": "Top",
  inseam: "Inseam",
  crotch: "Crotch",
  seam: "",
  fold: "Fold",
};

export const EDGE_KO: Record<EdgeKind, string> = {
  side: "옆선",
  shoulder: "어깨",
  armhole: "진동",
  "sleeve-cap": "소매산",
  underarm: "소매 밑선",
  hem: "밑단",
  "sleeve-hem": "소매단",
  neck: "목둘레",
  waist: "허리",
  casing: "허리",
  "bag-top": "입구",
  inseam: "안솔기",
  crotch: "밑위",
  seam: "",
  fold: "골선",
};

export interface EdgeDim {
  kind: EdgeKind;
  cm: number;
  at: Pt; // halfway along the edge, on the seam line
  dir: Pt; // unit tangent there
  inward: Pt; // unit normal into the piece
}

const MIN_CM = 2; // shorter edges get no label: it would not fit

// Every seam-line edge of a piece with its length, where to print it and which way is inside.
export function edgeDims(piece: Piece): EdgeDim[] {
  return normalized(piece.edges).flatMap((e) => {
    const cm = polylineLength(e.pts);
    if (cm < MIN_CM) return [];
    const at = pointAlong(e.pts, cm / 2);
    const d = sub(pointAlong(e.pts, cm / 2 + 0.5), pointAlong(e.pts, cm / 2 - 0.5));
    const l = Math.hypot(d[0], d[1]) || 1;
    const dir: Pt = [d[0] / l, d[1] / l];
    return [{ kind: e.kind, cm, at, dir, inward: [-dir[1], dir[0]] }]; // clockwise outline: inside is to the right
  });
}

export interface SeamMatch {
  en: string; // "Side seam"
  ko: string;
  a: { en: string; ko: string; cm: number };
  b: { en: string; ko: string; cm: number };
  // b − a. For a sleeve cap it is the ease; between front and back it should be about 0.
  diff: number;
  ease: boolean;
}

const lengthOf = (piece: Piece | undefined, kind: EdgeKind) =>
  piece ? piece.edges.filter((e) => e.kind === kind).reduce((s, e) => s + polylineLength(e.pts), 0) : 0;

// Seams sewn to each other, from the pieces that share them.
export function seamMatches(pattern: Pick<Pattern, "pieces">): SeamMatch[] {
  const by = (id: string) => pattern.pieces.find((p) => p.id === id);
  const front = by("front"), back = by("back"), sleeve = by("sleeve"), hood = by("hood");
  const out: SeamMatch[] = [];
  const pair = (kind: EdgeKind, en: string, ko: string) => {
    const a = lengthOf(front, kind), b = lengthOf(back, kind);
    if (a > 0 && b > 0) out.push({ en, ko, a: { en: "front", ko: "앞", cm: a }, b: { en: "back", ko: "뒤", cm: b }, diff: b - a, ease: false });
  };
  pair("shoulder", "Shoulder seam", "어깨선");
  pair("side", "Side seam", "옆선");
  pair("inseam", "Inseam", "안솔기");
  const armhole = lengthOf(front, "armhole") + lengthOf(back, "armhole");
  const cap = lengthOf(sleeve, "sleeve-cap");
  if (armhole > 0 && cap > 0) {
    out.push({ en: "Sleeve into armhole", ko: "소매 달기", a: { en: "armhole, front + back", ko: "진동 앞+뒤", cm: armhole }, b: { en: "sleeve cap", ko: "소매산", cm: cap }, diff: cap - armhole, ease: true });
  }
  const neck = lengthOf(front, "neck") + lengthOf(back, "neck");
  const hoodNeck = lengthOf(hood, "neck");
  if (neck > 0 && hoodNeck > 0) {
    out.push({ en: "Hood into neckline", ko: "모자 달기", a: { en: "neckline, front + back", ko: "목둘레 앞+뒤", cm: neck }, b: { en: "hood", ko: "모자", cm: hoodNeck }, diff: hoodNeck - neck, ease: true });
  }
  return out;
}

const f1 = (x: number) => (Math.abs(x) < 0.05 ? 0 : x).toFixed(1); // no "-0.0"

export function matchText(m: SeamMatch, lang: "en" | "ko"): string {
  const L = lang === "en" ? { name: m.en, a: m.a.en, b: m.b.en } : { name: m.ko, a: m.a.ko, b: m.b.ko };
  const head = `${L.name}: ${L.a} ${f1(m.a.cm)} / ${L.b} ${f1(m.b.cm)} cm`;
  const d = Math.abs(m.diff);
  if (m.ease && d >= 0.05) return lang === "en" ? `${head}, ease ${f1(m.diff)} cm` : `${head}, 오그림 ${f1(m.diff)} cm`;
  if (d < 0.05) return lang === "en" ? `${head}, equal` : `${head}, 같음`;
  const longer = m.diff > 0 ? L.b : L.a;
  return lang === "en" ? `${head}, ${longer} ${f1(d)} cm longer` : `${head}, ${longer === "뒤" ? "뒤가" : "앞이"} ${f1(d)} cm 김`;
}
