// Every piece with its cutting line, placed on one sheet of paper (cm, origin top-left) so the
// sheet can be tiled onto A4 pages. Shelf packing, tallest piece first. Each piece may turn a
// quarter (its grainline turns with it), and the sheet width and turns are chosen to need the
// fewest pages.

import type { Pt } from "../geom/point.ts";
import { bounds } from "../geom/polygon.ts";
import { cuttingLine, normalized } from "./seam.ts";
import type { Pattern, Piece } from "./types.ts";

export const GAP_CM = 1.5;

export interface PlacedPiece {
  piece: Piece; // edges normalized, already moved into sheet coordinates
  cut: Pt[]; // cutting line, sheet coordinates
  size: [number, number]; // cutting line's width and height
}

export interface Sheet {
  width: number;
  height: number;
  pieces: PlacedPiece[];
}

export interface Tiling {
  content: [number, number]; // printed area per page, cm
  step: [number, number]; // content minus the overlap
}

export const A4_TILING: Tiling = { content: [19, 27.7], step: [18, 26.7] }; // 1 cm margins, 1 cm overlap

export const pagesFor = (w: number, h: number, t: Tiling = A4_TILING) =>
  [Math.max(1, Math.ceil((w - (t.content[0] - t.step[0])) / t.step[0])), Math.max(1, Math.ceil((h - (t.content[1] - t.step[1])) / t.step[1]))] as const;

const movePt = ([x, y]: Pt, dx: number, dy: number): Pt => [x + dx, y + dy];
const turnPt = ([x, y]: Pt): Pt => [-y, x]; // a quarter turn clockwise on screen

function mapPiece(piece: Piece, f: (p: Pt) => Pt): Piece {
  return {
    ...piece,
    edges: normalized(piece.edges).map((e) => ({ ...e, pts: e.pts.map(f) })),
    grain: [f(piece.grain[0]), f(piece.grain[1])],
    notches: piece.notches.map((n) => ({ ...n, at: f(n.at) })),
    marks: piece.marks?.map((m) => ({ ...m, a: f(m.a), b: f(m.b) })),
  };
}

interface Item {
  piece: Piece;
  cut: Pt[];
  b: ReturnType<typeof bounds>;
  w: number;
  h: number;
}

const item = (piece: Piece, cut: Pt[]): Item => {
  const b = bounds(cut);
  return { piece, cut, b, w: b.maxX - b.minX, h: b.maxY - b.minY };
};

function shelfPack(items: readonly Item[], limit: number): Sheet {
  const placed: PlacedPiece[] = [];
  let x = 0, y = 0, rowH = 0, sheetW = 0;
  for (const it of [...items].sort((a, b) => b.h - a.h)) {
    if (x > 0 && x + it.w > limit) {
      x = 0;
      y += rowH + GAP_CM;
      rowH = 0;
    }
    const dx = x - it.b.minX, dy = y - it.b.minY;
    const f = (p: Pt) => movePt(p, dx, dy);
    placed.push({ piece: mapPiece(it.piece, f), cut: it.cut.map(f), size: [it.w, it.h] });
    x += it.w + GAP_CM;
    rowH = Math.max(rowH, it.h);
    sheetW = Math.max(sheetW, x - GAP_CM);
  }
  return { width: sheetW, height: y + rowH, pieces: placed };
}

export function layOut(pattern: Pattern, t: Tiling = A4_TILING): Sheet {
  const upright = pattern.pieces.map((piece) => item(piece, cuttingLine(piece, pattern.fabric)));
  const turned = upright.map((it) => item(mapPiece(it.piece, turnPt), it.cut.map(turnPt)));
  const n = upright.length;
  const overlap = t.content[0] - t.step[0];

  let best: { sheet: Sheet; pages: number; area: number } | null = null;
  // Every combination of turns (pieces per pattern are few), every sheet width in whole pages.
  for (let mask = 0; mask < 1 << Math.min(n, 8); mask++) {
    const items = upright.map((u, i) => (mask >> i) & 1 ? turned[i] : u);
    const widest = Math.max(...items.map((i) => i.w));
    for (let cols = 1; cols <= 8; cols++) {
      const sheet = shelfPack(items, Math.max(widest, cols * t.step[0] + overlap));
      const [c, r] = pagesFor(sheet.width, sheet.height, t);
      const area = sheet.width * sheet.height;
      if (!best || c * r < best.pages || (c * r === best.pages && area < best.area)) best = { sheet, pages: c * r, area };
    }
  }
  return best!.sheet;
}
