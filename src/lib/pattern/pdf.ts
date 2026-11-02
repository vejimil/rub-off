// The printable pattern: a 1:1 sheet tiled onto A4 pages with a 1 cm overlap, plus a cover page with
// the 10 cm test square, the piece list and a map of the pages. Lines follow the flat conventions'
// weight hierarchy: cutting line heaviest, seam line half, marks lightest.
// Text is ASCII/WinAnsi (standard Helvetica), so labels are in English, the language of sewing
// pattern markings.

import { PDFDocument, StandardFonts, clip, degrees, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { add, lerp, scale, sub, type Pt } from "../geom/point.ts";
import { bounds } from "../geom/polygon.ts";
import { seamAllowance } from "../rules/seam-rules.ts";
import { EDGE_EN, edgeDims, matchText, seamMatches } from "./dims.ts";
import { A4_TILING, layOut, pagesFor, type PlacedPiece, type Sheet } from "./layout.ts";
import { MEASURE_EN } from "./measures.ts";
import { allowanceOf, notchTicks } from "./seam.ts";
import { seamLine, type EdgeKind, type Pattern } from "./types.ts";

const CM = 72 / 2.54;
const PAGE: [number, number] = [21 * CM, 29.7 * CM];
const MARGIN = 1; // cm
const BLACK = rgb(0, 0, 0), GREY = rgb(0.45, 0.45, 0.45), LIGHT = rgb(0.75, 0.75, 0.75);
const W_CUT = 1.2, W_SEAM = 0.6, W_MARK = 0.36; // 1 : 0.5 : 0.3

const ROWS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface PdfOptions {
  title?: string;
  createdFor?: string; // e.g. "Rub-Off sample"
}

export async function patternPdf(pattern: Pattern, opts: PdfOptions = {}): Promise<{ bytes: Uint8Array; pages: [number, number]; sheet: Sheet }> {
  const sheet = layOut(pattern);
  const [cols, rows] = pagesFor(sheet.width, sheet.height);
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title ?? `Rub-Off pattern: ${pattern.garment}, ${pattern.sizeLabel}`);
  doc.setProducer("Rub-Off");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  cover(doc, pattern, sheet, [cols, rows], font, bold, opts);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) tile(doc.addPage(PAGE), sheet, r, c, [cols, rows], pattern, font, bold);
  }
  return { bytes: await doc.save(), pages: [cols, rows], sheet };
}

// ---------- drawing in cm ----------

type ToPage = (p: Pt) => { x: number; y: number };

function polyline(page: PDFPage, to: ToPage, pts: readonly Pt[], thickness: number, close = false, dashArray?: number[], color = BLACK) {
  const all = close ? [...pts, pts[0]] : pts;
  for (let i = 1; i < all.length; i++) page.drawLine({ start: to(all[i - 1]), end: to(all[i]), thickness, color, dashArray });
}

function arrowHead(page: PDFPage, to: ToPage, tip: Pt, from: Pt, len = 0.5) {
  const d = sub(tip, from), l = Math.hypot(d[0], d[1]) || 1, u: Pt = [d[0] / l, d[1] / l], n: Pt = [-u[1], u[0]];
  const base = sub(tip, scale(u, len));
  polyline(page, to, [add(base, scale(n, len * 0.4)), tip, sub(base, scale(n, len * 0.4))], W_MARK);
}

// Text centred at p, rotated to run along direction d (cm frame, y down).
function label(page: PDFPage, to: ToPage, text: string, p: Pt, size: number, font: PDFFont, d: Pt = [1, 0], color = BLACK) {
  let ang = (Math.atan2(-d[1], d[0]) * 180) / Math.PI; // PDF y is up
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  const t = safe(text, font);
  const w = font.widthOfTextAtSize(t, size);
  const r = (ang * Math.PI) / 180;
  const c = to(p);
  page.drawText(t, {
    x: c.x - (w / 2) * Math.cos(r) + (size / 3) * Math.sin(r),
    y: c.y - (w / 2) * Math.sin(r) - (size / 3) * Math.cos(r),
    size,
    font,
    color,
    rotate: degrees(ang),
  });
}

// Standard fonts only carry WinAnsi; anything else is dropped rather than crashing the PDF.
function safe(text: string, font: PDFFont): string {
  return [...text].filter((ch) => {
    try {
      font.encodeText(ch);
      return true;
    } catch {
      return false;
    }
  }).join("");
}

function drawPiece(page: PDFPage, to: ToPage, pp: PlacedPiece, pattern: Pattern, font: PDFFont, bold: PDFFont) {
  const { piece, cut } = pp;
  polyline(page, to, cut, W_CUT, true);
  for (const e of piece.edges) {
    if (e.kind === "fold") polyline(page, to, e.pts, W_SEAM, false, [6, 2, 1, 2]);
    else if (allowanceOf(e, pattern.fabric) > 0) polyline(page, to, e.pts, W_SEAM, false, [4, 2], GREY);
  }

  // Place-on-fold bracket: arrows from inside the piece to the fold.
  for (const e of piece.edges.filter((x) => x.kind === "fold")) {
    const a = e.pts[0], b = e.pts[e.pts.length - 1];
    const u = sub(b, a), l = Math.hypot(u[0], u[1]), n: Pt = [-u[1] / l, u[0] / l]; // inward for a clockwise outline
    const p1 = lerp(a, b, 0.2), p2 = lerp(a, b, 0.8), q1 = add(p1, scale(n, 2)), q2 = add(p2, scale(n, 2));
    polyline(page, to, [p1, q1, q2, p2], W_MARK);
    arrowHead(page, to, p1, q1);
    arrowHead(page, to, p2, q2);
    label(page, to, "PLACE ON FOLD", add(lerp(q1, q2, 0.5), scale(n, 0.6)), 9, bold, u);
  }

  // Grainline, arrows both ends.
  const [g0, g1] = piece.grain;
  polyline(page, to, [g0, g1], W_SEAM);
  arrowHead(page, to, g0, g1, 0.7);
  arrowHead(page, to, g1, g0, 0.7);
  const gd = sub(g1, g0), gl = Math.hypot(gd[0], gd[1]);
  label(page, to, "GRAIN", add(lerp(g0, g1, 0.5), scale([-gd[1] / gl, gd[0] / gl], 0.45)), 7, font, gd);

  for (const t of notchTicks(piece, pattern.fabric)) {
    const offsets = t.count === 1 ? [0] : [-0.2, 0.2];
    for (const o of offsets) polyline(page, to, [add(t.a, scale(t.along, o)), add(t.b, scale(t.along, o))], W_SEAM);
  }

  for (const m of piece.marks ?? []) {
    const d = sub(m.b, m.a), l = Math.hypot(d[0], d[1]), n: Pt = [-d[1] / l, d[0] / l];
    if (m.kind === "lengthen") {
      polyline(page, to, [m.a, m.b], W_MARK);
      polyline(page, to, [add(m.a, scale(n, 0.6)), add(m.b, scale(n, 0.6))], W_MARK);
      label(page, to, "LENGTHEN OR SHORTEN HERE", add(lerp(m.a, m.b, 0.5), scale(n, 1.2)), 6, font, d, GREY);
    } else {
      polyline(page, to, [m.a, m.b], W_MARK, false, [8, 2, 2, 2]);
      label(page, to, "CENTRE FRONT", add(lerp(m.a, m.b, 0.35), scale(n, -0.5)), 6, font, d, GREY);
    }
  }

  // Each seam line's length, just inside it, along it.
  for (const d of edgeDims(piece)) {
    label(page, to, `${EDGE_EN[d.kind]} ${d.cm.toFixed(1)} cm`.trim(), add(d.at, scale(d.inward, 0.7)), 7, font, d.dir);
  }

  // Piece label near the middle of the seam line, away from the grainline.
  const line = seamLine(piece), b = bounds(line);
  const mid: Pt = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  const small = Math.min(b.maxX - b.minX, b.maxY - b.minY) < 12;
  const at: Pt = small ? mid : [mid[0], mid[1] - 3];
  const cutText = piece.cut.onFold ? `Cut ${piece.cut.count} on fold` : `Cut ${piece.cut.count}${piece.cut.mirror ? " (mirror)" : ""}`;
  const lines = [
    [piece.name.toUpperCase(), 12, bold],
    [`${cutText}  |  Size ${pattern.sizeLabel}  |  ${pattern.fabric}`, 8, font],
    ["Confirm before cutting", 7, font],
  ] as const;
  const dir: Pt = small && b.maxY - b.minY > b.maxX - b.minX ? [0, 1] : [1, 0];
  const perp: Pt = [-dir[1], dir[0]];
  lines.forEach(([t, size, f], i) => label(page, to, t, add(at, scale(perp, (i - 1) * 0.65)), size, f, dir));
}

// ---------- pages ----------

function tile(page: PDFPage, sheet: Sheet, r: number, c: number, [cols, rows]: [number, number], pattern: Pattern, font: PDFFont, bold: PDFFont) {
  const t = A4_TILING;
  const x0 = c * t.step[0], y0 = r * t.step[1];
  const to: ToPage = ([x, y]) => ({ x: (MARGIN + x - x0) * CM, y: PAGE[1] - (MARGIN + y - y0) * CM });

  page.pushOperators(pushGraphicsState(), rectangle(MARGIN * CM, PAGE[1] - (MARGIN + t.content[1]) * CM, t.content[0] * CM, t.content[1] * CM), clip(), endPath());
  for (const pp of sheet.pieces) {
    const b = bounds(pp.cut);
    if (b.maxX < x0 - 2 || b.minX > x0 + t.content[0] + 2 || b.maxY < y0 - 2 || b.minY > y0 + t.content[1] + 2) continue;
    drawPiece(page, to, pp, pattern, font, bold);
  }
  // Alignment lines in the middle of each overlap, in sheet coordinates, so they print on both
  // neighbouring pages at the same place: lay one over the other until they match.
  const ov = [t.content[0] - t.step[0], t.content[1] - t.step[1]];
  for (let k = 1; k < cols; k++) {
    const x = k * t.step[0] + ov[0] / 2;
    polyline(page, to, [[x, y0], [x, y0 + t.content[1]]], W_MARK, false, [3, 3], LIGHT);
  }
  for (let k = 1; k < rows; k++) {
    const y = k * t.step[1] + ov[1] / 2;
    polyline(page, to, [[x0, y], [x0 + t.content[0], y]], W_MARK, false, [3, 3], LIGHT);
  }
  page.pushOperators(popGraphicsState());

  // Page frame and its name; neighbours named in the margin.
  const frame: Pt[] = [[x0, y0], [x0 + t.content[0], y0], [x0 + t.content[0], y0 + t.content[1]], [x0, y0 + t.content[1]]];
  polyline(page, to, frame, W_MARK, true, undefined, GREY);
  const name = (rr: number, cc: number) => `${ROWS[rr]}${cc + 1}`;
  const m = MARGIN / 2;
  page.drawText(`${name(r, c)}   (${rows} rows x ${cols} columns)   ${pattern.garment}, size ${pattern.sizeLabel}`, { x: MARGIN * CM, y: PAGE[1] - m * CM - 3, size: 7, font, color: GREY });
  if (c + 1 < cols) page.drawText(`${name(r, c + 1)} >`, { x: PAGE[0] - 0.4 * CM, y: PAGE[1] / 2, size: 7, font: bold, color: GREY, rotate: degrees(-90) });
  if (r + 1 < rows) page.drawText(`${name(r + 1, c)} v`, { x: PAGE[0] / 2, y: (m * CM) - 3, size: 7, font: bold, color: GREY });
  // A 5 cm bar on every page, so any page can be checked.
  const bar = { x: PAGE[0] - (MARGIN + 5) * CM, y: (m * CM) };
  page.drawLine({ start: bar, end: { x: bar.x + 5 * CM, y: bar.y }, thickness: W_SEAM, color: BLACK });
  for (let k = 0; k <= 5; k++) page.drawLine({ start: { x: bar.x + k * CM, y: bar.y }, end: { x: bar.x + k * CM, y: bar.y + (k % 5 ? 2 : 4) }, thickness: W_MARK, color: BLACK });
  page.drawText("5 cm", { x: bar.x - 22, y: bar.y - 2, size: 6, font, color: GREY });
}

function cover(doc: PDFDocument, pattern: Pattern, sheet: Sheet, [cols, rows]: [number, number], font: PDFFont, bold: PDFFont, opts: PdfOptions) {
  let page = doc.addPage(PAGE);
  let y = PAGE[1] - 2 * CM;
  const x = 2 * CM;
  // Text runs on to another page before the tiles if the cover fills up.
  const text = (t: string, size: number, f = font, color = BLACK, dx = 0) => {
    for (const lineText of wrap(safe(t, f), f, size, PAGE[0] - 4 * CM - dx)) {
      if (y < 1.5 * CM) {
        page = doc.addPage(PAGE);
        y = PAGE[1] - 2 * CM;
      }
      page.drawText(lineText, { x: x + dx, y, size, font: f, color });
      y -= size * 1.35;
    }
  };
  text(`Rub-Off pattern: ${pattern.garment}`, 18, bold);
  text(`Size ${pattern.sizeLabel}  |  ${pattern.fabric}  |  ${cols * rows} pages (${rows} rows x ${cols} columns)${opts.createdFor ? `  |  ${opts.createdFor}` : ""}`, 10, font, GREY);
  y -= 6;

  // The test square, true size.
  const sq = { x, y: y - 10 * CM };
  page.drawRectangle({ x: sq.x, y: sq.y, width: 10 * CM, height: 10 * CM, borderColor: BLACK, borderWidth: W_SEAM });
  for (let k = 1; k < 10; k++) {
    page.drawLine({ start: { x: sq.x + k * CM, y: sq.y }, end: { x: sq.x + k * CM, y: sq.y + 0.3 * CM }, thickness: W_MARK, color: BLACK });
    page.drawLine({ start: { x: sq.x, y: sq.y + k * CM }, end: { x: sq.x + 0.3 * CM, y: sq.y + k * CM }, thickness: W_MARK, color: BLACK });
  }
  const sqText = ["10 cm TEST SQUARE", "Print at 100% / Actual size.", "Measure both sides with a ruler.", "If either side is not 10.0 cm,", "do not cut: fix the print scale."];
  sqText.forEach((t, i) => page.drawText(t, { x: sq.x + 0.8 * CM, y: sq.y + 9 * CM - i * 13, size: i === 0 ? 10 : 8, font: i === 0 ? bold : font }));

  // Page map beside it.
  const map = { x: x + 11 * CM, y: sq.y, w: PAGE[0] - x - 11 * CM - 2 * CM, h: 10 * CM };
  const k = Math.min(map.w / (cols * A4_TILING.step[0] + 1), map.h / (rows * A4_TILING.step[1] + 1));
  const mto: ToPage = ([px, py]) => ({ x: map.x + px * k, y: map.y + map.h - py * k });
  for (const pp of sheet.pieces) polyline(page, mto, pp.cut, W_MARK, true);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [tx, ty] = [c * A4_TILING.step[0], r * A4_TILING.step[1]];
      polyline(page, mto, [[tx, ty], [tx + A4_TILING.content[0], ty], [tx + A4_TILING.content[0], ty + A4_TILING.content[1]], [tx, ty + A4_TILING.content[1]]], W_MARK, true, [2, 2], GREY);
      const p = mto([tx + 1.5, ty + 2.5]);
      page.drawText(`${ROWS[r]}${c + 1}`, { x: p.x, y: p.y, size: 8, font: bold, color: GREY });
    }
  }
  page.drawText("Page map", { x: map.x, y: map.y + map.h + 4, size: 8, font: bold, color: GREY });

  y = sq.y - 0.8 * CM;
  text("Pieces", 11, bold);
  for (const pp of sheet.pieces) {
    const p = pp.piece;
    const cutText = p.cut.onFold ? `cut ${p.cut.count} on fold` : `cut ${p.cut.count}${p.cut.mirror ? ", mirror" : ""}`;
    text(`${p.name} (${cutText}): ${pp.size[0].toFixed(1)} x ${pp.size[1].toFixed(1)} cm with allowance`, 8, font, BLACK, 8);
  }
  const matches = seamMatches(pattern);
  if (matches.length) {
    y -= 4;
    text("Seams sewn together (seam line lengths)", 11, bold);
    for (const m of matches) text(matchText(m, "en"), 8, font, BLACK, 8);
  }
  y -= 4;
  text("Drafted from these flat measurements (cm)", 11, bold);
  const typical = new Set(pattern.unmeasured);
  text(
    Object.entries(pattern.measures)
      .filter(([k]) => MEASURE_EN[k])
      .map(([k, v]) => `${MEASURE_EN[k]} ${v.toFixed(1)}${typical.has(k) ? "*" : ""}`)
      .join(",  "),
    8, font, BLACK, 8,
  );
  if (typical.size) text("* typical value, not measured: measure before cutting.", 8, font, GREY, 8);
  y -= 4;
  text("Seam allowance included", 11, bold);
  const kinds = [...new Set(sheet.pieces.flatMap((pp) => pp.piece.edges.map((e) => e.kind)))] as EdgeKind[];
  const used = kinds
    .filter((kd) => kd !== "fold")
    .map((kd) => {
      const vals = [...new Set(sheet.pieces.flatMap((pp) => pp.piece.edges.filter((e) => e.kind === kd).map((e) => allowanceOf(e, pattern.fabric))))];
      return `${kd} ${vals.map((v) => v.toFixed(1)).join("/")} cm`;
    });
  text(used.join(", ") + `. Default seam ${seamAllowance("seam", pattern.fabric)} cm.`, 8, font, BLACK, 8);
  y -= 4;
  text("Notes", 11, bold);
  for (const n of pattern.notes) text(`- ${n}`, 8, font, BLACK, 8);
  text("- Lines: solid = cut, dashed = sew, dash-dot = fold. Notches: one = front, two = back.", 8, font, BLACK, 8);
  text("- Assemble: trim nothing; lay each page over its neighbour so the grey dashed lines in the overlap match, then tape.", 8, font, BLACK, 8);
  y -= 4;
  text("Confirm every measurement before cutting. Numbers on this pattern come from the photo's geometry and the rule tables, never from a language model.", 8, bold);
}

function wrap(t: string, f: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of t.split(/\s+/)) {
    const next = cur ? `${cur} ${w}` : w;
    if (f.widthOfTextAtSize(next, size) > width && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

