// Patch pockets placed on a pattern piece. A pocket is its own piece (opening turned twice, the
// other edges turned under and topstitched on), and its finished outline is marked on the piece it
// sits on. Its place is stored as a share of the host piece's size, so it follows the piece when
// the pattern is graded; its size stays in cm. Pockets let into a seam (side-seam, welt) change the
// garment's own seams and are not offered.

import type { Pt } from "../geom/point.ts";
import { bounds } from "../geom/polygon.ts";
import { L, type Local } from "../i18n/lang.ts";
import { line, quad } from "./curves.ts";
import { seamAllowance } from "../rules/seam-rules.ts";
import { isTop, named, seamLine, type Edge, type Pattern, type Piece } from "./types.ts";

export type PocketKind = "patch" | "round" | "kangaroo";

export interface Pocket {
  id: string;
  kind: PocketKind;
  host: string; // the piece it sits on
  u: number; // its top centre, as a share of the host's seam-line width (0 left, 1 right)
  v: number; // and of its height (0 top, 1 bottom)
  width: number; // finished, cm
  height: number;
  // Measured on a photo, not placed by hand: its ± (size, place), and how far it was moved up and
  // made smaller to fit the drafted piece.
  photo?: { plusMinusCm: number; placeCm: number; up: number; scale: number };
}

export const POCKET_NAME: Record<PocketKind, Local> = {
  patch: L("패치 주머니", "Patch pocket", "Bolsillo de parche"),
  round: L("둥근 패치 주머니", "Rounded patch pocket", "Bolsillo de parche redondeado"),
  kangaroo: L("캥거루 주머니", "Kangaroo pocket", "Bolsillo canguro"),
};

const HOSTS = ["front", "back", "panel", "body"];
const MIN_SIZE = 6;
const MAX_SIZE = 50;

// The pieces a pocket can sit on: the garment's main panels. Not on a cushion (it is sewn shut).
export function pocketHosts(pattern: Pick<Pattern, "garment" | "pieces">): Piece[] {
  if (pattern.garment === "cushion") return [];
  return pattern.pieces.filter((p) => HOSTS.includes(p.id));
}

// A kangaroo pocket straddles the centre front: on a front cut on the fold it is one piece cut on
// the fold; on a zip front (a hoodie) it is split by the zip, a half on each front, its centre
// edge sewn into the zip seam. Not on a shirt: its button stand is past the centre line.
const atZero = (p: Piece, kind: Edge["kind"]) => p.edges.some((e) => e.kind === kind && e.pts.every(([x]) => Math.abs(x) < 1e-6));
const foldAtZero = (p: Piece) => atZero(p, "fold");
export const kangarooHost = (pattern: Pick<Pattern, "garment" | "pieces">) =>
  isTop(pattern.garment) && pattern.garment !== "shirt"
    ? pocketHosts(pattern).find((p) => p.id === "front" && (foldAtZero(p) || (pattern.garment === "hoodie" && atZero(p, "seam"))))
    : undefined;

export function pocketKinds(pattern: Pick<Pattern, "garment" | "pieces">): PocketKind[] {
  if (!pocketHosts(pattern).length) return [];
  return kangarooHost(pattern) ? ["patch", "round", "kangaroo"] : ["patch", "round"];
}

// A new pocket where one usually goes: a chest pocket on a top's front, back pockets on trousers,
// a kangaroo low on a sweatshirt's front, else the middle of the first panel.
export function defaultPocket(pattern: Pick<Pattern, "garment" | "pieces">, kind: PocketKind, id: string): Pocket | null {
  const hosts = pocketHosts(pattern);
  if (!hosts.length) return null;
  const top = isTop(pattern.garment);
  if (kind === "kangaroo") {
    const host = kangarooHost(pattern);
    if (!host) return null;
    const b = bounds(seamLine(host));
    return { id, kind, host: host.id, u: 0, v: 0.6, width: Math.round(Math.min(34, 1.3 * (b.maxX - b.minX))), height: 20 };
  }
  const host = (top ? hosts.find((h) => h.id === "front") : pattern.garment === "pants" ? hosts.find((h) => h.id === "back") : undefined) ?? hosts[0];
  const size: [number, number] = top ? [12, 14] : pattern.garment === "pants" ? [14, 15] : [16, 17];
  const at: [number, number] = top ? [0.55, 0.3] : pattern.garment === "pants" ? [0.6, 0.22] : [0.5, 0.35];
  // On a small or tapered panel, lower it and then make it smaller until it fits.
  for (const k of [1, 0.85, 0.7, 0.55, 0.4])
    for (const dv of [0, 0.1, 0.2, 0.3]) {
      const p: Pocket = { id, kind, host: host.id, u: at[0], v: Math.min(at[1] + dv, 0.9), width: clampSize(k * size[0]), height: clampSize(k * size[1]) };
      if (placed(host, p).fits) return p;
    }
  return null;
}

// A pocket measured on a photo of a top (cm across from the centre line and down from the high
// point of the shoulder, the draft's own origin), set on the drafted piece. If it doesn't quite
// fit (a rib band shortens the body, the photo's ± ran over the hem), it goes up a little, then
// shrinks a little; past that it is left for the hand.
export function pocketFromPhoto(
  pattern: Pick<Pattern, "garment" | "pieces">,
  f: { kind: PocketKind; host: string; fromCentre: number; belowNeck: number; width: number; height: number; plusMinusCm?: number; placePlusMinusCm?: number },
  id: string,
): Pocket | null {
  const host = f.kind === "kangaroo" ? kangarooHost(pattern) : pocketHosts(pattern).find((h) => h.id === f.host);
  if (!host) return null;
  for (const scale of [1, 0.95, 0.9])
    for (const up of [0, 1, 2, 3, 4]) {
      const at = shareOf(host, [f.kind === "kangaroo" ? 0 : f.fromCentre, f.belowNeck - up]);
      const photo = { plusMinusCm: f.plusMinusCm ?? 0, placeCm: f.placePlusMinusCm ?? 0, up, scale };
      const p: Pocket = { id, kind: f.kind, host: host.id, ...at, width: clampSize(scale * f.width), height: clampSize(scale * f.height), photo };
      if (placed(host, p).fits) return p;
    }
  return null;
}

// The pockets of every photo of the garment: one pocket seen on two photos is one (the surer kept),
// and how many couldn't be set on the pattern at all.
export function pocketsFromPhotos(
  pattern: Pick<Pattern, "garment" | "pieces">,
  found: readonly (Parameters<typeof pocketFromPhoto>[1] & { plusMinusCm: number })[],
): { pockets: Pocket[]; left: number } {
  const same = (a: (typeof found)[number], b: (typeof found)[number]) =>
    a.kind === b.kind && a.host === b.host && Math.abs(a.fromCentre - b.fromCentre) < SAME_POCKET_CM && Math.abs(a.belowNeck - b.belowNeck) < SAME_POCKET_CM;
  const unique: (typeof found)[number][] = [];
  for (const f of [...found].sort((a, b) => a.plusMinusCm - b.plusMinusCm)) if (!unique.some((u) => same(u, f))) unique.push(f);
  const pockets = unique.flatMap((f, i) => pocketFromPhoto(pattern, f, `p${i + 1}`) ?? []);
  return { pockets, left: unique.length - pockets.length };
}
const SAME_POCKET_CM = 5;

export const clampSize = (cm: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(cm * 2) / 2));

// The kangaroo's opening: in from each top corner, down to most of its height.
const slant = (w: number) => Math.min(0.22 * w, 8);
const openingDepth = (h: number) => 0.7 * h;
const radius = (w: number, h: number) => Math.min(4, 0.3 * w, 0.3 * h);

// The finished outline with its top centre at the origin, clockwise on screen. A kangaroo pocket
// is the half on the right of the centre line (its piece is cut on the fold).
export function pocketShape(kind: PocketKind, w: number, h: number): Pt[] {
  if (kind === "kangaroo") {
    const s = slant(w), oh = openingDepth(h);
    return [[0, 0], [w / 2 - s, 0], [w / 2, oh], [w / 2, h], [0, h]];
  }
  const l = -w / 2, r = w / 2;
  if (kind === "patch") return [[l, 0], [r, 0], [r, h], [l, h]];
  const k = radius(w, h);
  const pts: Pt[] = [[l, 0], [r, 0], [r, h - k], ...quad([r, h - k], [r, h], [r - k, h], 8).slice(1), ...quad([l + k, h], [l, h], [l, h - k], 8)];
  return pts;
}

// Where the pocket's top centre falls on its host, in the host's own cm.
export function pocketAnchor(host: Piece, p: Pocket): Pt {
  const b = bounds(seamLine(host));
  return [p.kind === "kangaroo" ? 0 : b.minX + p.u * (b.maxX - b.minX), b.minY + p.v * (b.maxY - b.minY)];
}

// The anchor that puts a pocket's top centre at a point of the host (the inverse of pocketAnchor).
export function shareOf(host: Piece, at: Pt): { u: number; v: number } {
  const b = bounds(seamLine(host));
  return { u: (at[0] - b.minX) / (b.maxX - b.minX), v: (at[1] - b.minY) / (b.maxY - b.minY) };
}

// The pocket's outline on its host, and whether all of it lies inside the host's seam line.
export function placed(host: Piece, p: Pocket): { outline: Pt[]; fits: boolean } {
  const [ax, ay] = pocketAnchor(host, p);
  const outline = pocketShape(p.kind, p.width, p.height).map(([x, y]): Pt => [x + ax, y + ay]);
  const poly = seamLine(host);
  // A kangaroo's centre edge lies on the fold line itself; test a hair inside.
  const fits = outline.every(([x, y]) => inside([p.kind === "kangaroo" ? Math.max(x, 0.05) : x, y], poly));
  return { outline, fits };
}

export function inside([x, y]: Pt, poly: readonly Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// The pocket as a piece to cut. Opening at the top (turned twice), the rest turned under.
function pocketPiece(p: Pocket, n: number, host: Piece): Piece {
  const w = p.width, h = p.height;
  const onFold = foldAtZero(host);
  const names = L(`${POCKET_NAME[p.kind].ko} ${n}`, `${POCKET_NAME[p.kind].en} ${n}`, `${POCKET_NAME[p.kind].es} ${n}`);
  let edges: Edge[];
  if (p.kind === "kangaroo") {
    const s = slant(w), oh = openingDepth(h);
    edges = [
      { kind: "seam", pts: line([0, 0], [w / 2 - s, 0]) },
      { kind: "bag-top", pts: line([w / 2 - s, 0], [w / 2, oh]) },
      { kind: "seam", pts: line([w / 2, oh], [w / 2, h]) },
      { kind: "seam", pts: line([w / 2, h], [0, h]) },
      { kind: onFold ? "fold" : "seam", pts: line([0, h], [0, 0]) },
    ];
  } else {
    const shape = pocketShape(p.kind, w, h).map(([x, y]): Pt => [x + w / 2, y]);
    edges = [
      { kind: "bag-top", pts: [shape[0], shape[1]] },
      { kind: "seam", pts: [...shape.slice(1), shape[0]] },
    ];
  }
  const gx = p.kind === "kangaroo" ? w / 4 : w / 2;
  return {
    id: `pocket-${n}`,
    ...named(names),
    // On a piece cut twice (trouser legs, a shirt's two fronts) there is a pocket on each.
    // On a zip front a kangaroo is two halves, one for each front.
    cut: p.kind === "kangaroo" ? (onFold ? { count: 1, onFold: true, mirror: false } : { count: 2, onFold: false, mirror: true }) : { count: host.cut.count, onFold: false, mirror: false },
    edges,
    grain: [[gx, 0.2 * h], [gx, 0.8 * h]],
    notches: [],
  };
}

const MARK_LABEL = L("주머니 위치", "POCKET PLACEMENT", "POSICIÓN DEL BOLSILLO");

// The pattern with its pockets: each one a piece of its own and an outline on its host. A pocket
// that no longer fits its host (the pattern was graded smaller, or the host is gone) is left out,
// and a note says so.
export function withPockets(pattern: Pattern, pockets: readonly Pocket[], leftFromPhoto = 0): Pattern {
  if (!pockets.length && !leftFromPhoto) return pattern;
  const pieces = pattern.pieces.map((p) => ({ ...p, marks: [...(p.marks ?? [])] }));
  const notes = [...pattern.notes];
  const added: Piece[] = [];
  const left: number[] = [];
  pockets.forEach((p, i) => {
    const host = pieces.find((h) => h.id === p.host);
    const at = host && placed(host, p);
    if (!host || !at?.fits) return left.push(i + 1);
    const pts = at.outline;
    // A kangaroo's half outline stays open along the fold.
    const segs = p.kind === "kangaroo" ? pts.length - 1 : pts.length;
    for (let k = 0; k < segs; k++) host.marks.push({ kind: "pocket", a: pts[k], b: pts[(k + 1) % pts.length], ...(k === 0 ? { label: MARK_LABEL } : {}) });
    added.push(pocketPiece(p, added.length + 1, host));
  });
  if (added.length) {
    const top = seamAllowance("bag-top", pattern.fabric), rest = seamAllowance("seam", pattern.fabric);
    notes.push(
      L(
        `주머니 ${added.length}개: 다는 자리는 몸판에 점선으로 표시했습니다. 입구 시접 ${top} cm는 두 번 접어 박고, 나머지 시접 ${rest} cm는 안으로 접어 표시선에 맞춰 상침합니다. 골선으로 자르는 조각이면 펼친 뒤 한쪽에만 옮겨 표시합니다.`,
        `${added.length} pocket${added.length > 1 ? "s" : ""}: where each goes is dotted on its panel. Turn the ${top} cm opening allowance twice and stitch; turn the other ${rest} cm allowances under and topstitch the pocket on along the marks. On a piece cut on the fold, unfold it and mark one side only.`,
        `${added.length} bolsillo${added.length > 1 ? "s" : ""}: su posición está punteada en el panel. Dobla dos veces el margen de ${top} cm de la boca y cóselo; dobla hacia dentro los demás márgenes de ${rest} cm y pespunta el bolsillo sobre las marcas. En una pieza cortada al doblez, despliégala y marca solo un lado.`,
      ),
    );
  }
  // Pockets from the photo: their ± and what was changed to fit, numbered as the pieces are.
  pockets.forEach((p, i) => {
    if (!p.photo || left.includes(i + 1)) return;
    const n = pockets.slice(0, i + 1).filter((q, j) => !left.includes(j + 1)).length;
    const { plusMinusCm: pm, placeCm, up, scale } = p.photo;
    const pct = Math.round((1 - scale) * 100);
    const ko = [up ? `${up} cm 올려` : "", pct ? `${pct}% 줄여` : ""].filter(Boolean).join(" ");
    const en = [up ? `moved up ${up} cm` : "", pct ? `made ${pct}% smaller` : ""].filter(Boolean).join(" and ");
    const es = [up ? `se subió ${up} cm` : "", pct ? `se hizo un ${pct}% más pequeño` : ""].filter(Boolean).join(" y ");
    notes.push(
      L(
        `주머니 ${n}은 사진에서 잰 크기(±${pm} cm)와 자리(±${placeCm} cm)입니다.${ko ? ` 몸판에 들어가도록 ${ko} 넣었습니다.` : ""} 재단 전에 옷에서 재 확인하십시오.`,
        `Pocket ${n} has the size (±${pm} cm) and place (±${placeCm} cm) measured on the photo.${en ? ` To fit the panel it was ${en}.` : ""} Check it on the garment before cutting.`,
        `El bolsillo ${n} tiene el tamaño (±${pm} cm) y la posición (±${placeCm} cm) medidos en la foto.${es ? ` Para que cupiera en el panel ${es}.` : ""} Compruébalo en la prenda antes de cortar.`,
      ),
    );
  });
  if (leftFromPhoto)
    notes.push(
      L(
        `사진에서 찾은 주머니 ${leftFromPhoto}개는 이 패턴의 몸판에 들어가지 않아 넣지 않았습니다. 주머니 달기에서 직접 넣을 수 있습니다.`,
        `${leftFromPhoto} pocket${leftFromPhoto > 1 ? "s" : ""} found on the photo didn't fit this pattern's panels, so ${leftFromPhoto > 1 ? "they weren't" : "it wasn't"} added. You can add pockets under Add pockets.`,
        `${leftFromPhoto} bolsillo${leftFromPhoto > 1 ? "s" : ""} de la foto no ${leftFromPhoto > 1 ? "cabían" : "cabía"} en los paneles de este patrón, así que no se ${leftFromPhoto > 1 ? "añadieron" : "añadió"}. Puedes añadirlos en Añadir bolsillos.`,
      ),
    );
  if (left.length)
    notes.push(
      L(
        `주머니 ${left.join(", ")}번은 조각 밖으로 나가서 뺐습니다. 위치나 크기를 바꿔 주십시오.`,
        `Pocket ${left.join(", ")} fell outside its piece and was left out. Move it or make it smaller.`,
        `El bolsillo ${left.join(", ")} quedaba fuera de su pieza y se ha quitado. Muévelo o hazlo más pequeño.`,
      ),
    );
  return { ...pattern, pieces: [...pieces, ...added], notes };
}
