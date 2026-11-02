// The lengths printed on a pattern, all measured on its own seam lines: each edge's length, and the
// seams that are sewn to each other with how far apart they are (a sleeve cap is longer than its
// armhole by the ease; a front and back side seam should match). A sewer checks a pattern with
// exactly these numbers, and they can be checked against the original garment with a tape.

import { pointAlong, polylineLength, sub, type Pt } from "../geom/point.ts";
import { normalized } from "./seam.ts";
import { L, type Lang, type Local } from "../i18n/lang.ts";
import type { EdgeKind, Pattern, Piece } from "./types.ts";

export const EDGE_NAME: Record<EdgeKind, Local> = {
  side: L("옆선", "Side", "Costado"),
  shoulder: L("어깨", "Shoulder", "Hombro"),
  armhole: L("진동", "Armhole", "Sisa"),
  "sleeve-cap": L("소매산", "Cap", "Copa"),
  underarm: L("소매 밑선", "Underarm", "Bajo brazo"),
  hem: L("밑단", "Hem", "Bajo"),
  "sleeve-hem": L("소매단", "Hem", "Bajo"),
  neck: L("목둘레", "Neck", "Escote"),
  waist: L("허리", "Waist", "Cintura"),
  casing: L("허리", "Waist", "Cintura"),
  "bag-top": L("입구", "Top", "Boca"),
  inseam: L("안솔기", "Inseam", "Entrepierna"),
  crotch: L("밑위", "Crotch", "Tiro"),
  seam: L("", "", ""),
  fold: L("골선", "Fold", "Doblez"),
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
  name: Local; // "Side seam"
  a: { name: Local; cm: number };
  b: { name: Local; cm: number };
  // b − a. For a sleeve cap it is the ease; between front and back it should be about 0.
  diff: number;
  ease: boolean;
}

const lengthOf = (piece: Piece | undefined, kind: EdgeKind) =>
  piece ? piece.edges.filter((e) => e.kind === kind).reduce((s, e) => s + polylineLength(e.pts), 0) : 0;

const FRONT = L("앞", "front", "delantero"), BACK = L("뒤", "back", "trasero");

// Seams sewn to each other, from the pieces that share them.
export function seamMatches(pattern: Pick<Pattern, "pieces">): SeamMatch[] {
  const by = (id: string) => pattern.pieces.find((p) => p.id === id);
  const front = by("front"), back = by("back"), sleeve = by("sleeve"), hood = by("hood");
  const out: SeamMatch[] = [];
  const pair = (kind: EdgeKind, name: Local) => {
    const a = lengthOf(front, kind), b = lengthOf(back, kind);
    if (a > 0 && b > 0) out.push({ name, a: { name: FRONT, cm: a }, b: { name: BACK, cm: b }, diff: b - a, ease: false });
  };
  pair("shoulder", L("어깨선", "Shoulder seam", "Costura de hombro"));
  pair("side", L("옆선", "Side seam", "Costado"));
  pair("inseam", L("안솔기", "Inseam", "Entrepierna"));
  const armhole = lengthOf(front, "armhole") + lengthOf(back, "armhole");
  const cap = lengthOf(sleeve, "sleeve-cap");
  if (armhole > 0 && cap > 0) {
    out.push({
      name: L("소매 달기", "Sleeve into armhole", "Montar la manga"),
      a: { name: L("진동 앞+뒤", "armhole, front + back", "sisa, delantero + trasero"), cm: armhole },
      b: { name: L("소매산", "sleeve cap", "copa de manga"), cm: cap },
      diff: cap - armhole,
      ease: true,
    });
  }
  const neck = lengthOf(front, "neck") + lengthOf(back, "neck");
  const hoodNeck = lengthOf(hood, "neck");
  if (neck > 0 && hoodNeck > 0) {
    out.push({
      name: L("모자 달기", "Hood into neckline", "Montar la capucha"),
      a: { name: L("목둘레 앞+뒤", "neckline, front + back", "escote, delantero + trasero"), cm: neck },
      b: { name: L("모자", "hood", "capucha"), cm: hoodNeck },
      diff: hoodNeck - neck,
      ease: true,
    });
  }
  return out;
}

const f1 = (x: number) => (Math.abs(x) < 0.05 ? 0 : x).toFixed(1); // no "-0.0"

export function matchText(m: SeamMatch, lang: Lang): string {
  const head = `${m.name[lang]}: ${m.a.name[lang]} ${f1(m.a.cm)} / ${m.b.name[lang]} ${f1(m.b.cm)} cm`;
  const d = Math.abs(m.diff);
  if (m.ease && d >= 0.05) return `${head}, ${L("오그림", "ease", "embebido")[lang]} ${f1(m.diff)} cm`;
  if (d < 0.05) return `${head}, ${L("같음", "equal", "iguales")[lang]}`;
  const longer = m.diff > 0 ? m.b.name : m.a.name;
  if (lang === "ko") return `${head}, ${longer.ko === "뒤" ? "뒤가" : "앞이"} ${f1(d)} cm 김`;
  return lang === "en" ? `${head}, ${longer.en} ${f1(d)} cm longer` : `${head}, ${longer.es} ${f1(d)} cm más largo`;
}

// "Cut 1 on fold", "골선 1장", "Cortar 2 (simétricas)". The list form (inside brackets on the PDF
// cover) is lower case with a comma: "cut 2, mirror".
export function cutText(p: Piece, lang: Lang, list = false): string {
  const { count, onFold, mirror } = p.cut;
  const m = L("대칭", "mirror", "simétricas")[lang];
  const extra = mirror ? (list ? `, ${m}` : ` (${m})`) : "";
  const t = onFold ? L(`골선 ${count}장`, `Cut ${count} on fold`, `Cortar ${count} al doblez`)[lang] : L(`${count}장`, `Cut ${count}`, `Cortar ${count}`)[lang] + extra;
  return list && lang !== "ko" ? t[0].toLowerCase() + t.slice(1) : t;
}
