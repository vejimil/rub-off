// The printable pattern: a 1:1 sheet tiled onto A4 pages with a 1 cm overlap, plus a cover page with
// the 10 cm test square, the piece list and a map of the pages. Lines follow the flat conventions'
// weight hierarchy: cutting line heaviest, seam line half, marks lightest.
// Every word is in the chosen language. English and Spanish use the standard Helvetica (WinAnsi
// covers á é í ó ú ñ ¿ ¡); Korean embeds a Korean font through fontkit. The caller passes the font's bytes (pdf-font.ts loads them in the browser).

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, clip, degrees, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { add, lerp, scale, sub, type Pt } from "../geom/point.ts";
import { bounds } from "../geom/polygon.ts";
import { seamAllowance } from "../rules/seam-rules.ts";
import { L, type Lang, type Local } from "../i18n/lang.ts";
import { GARMENT_NAME } from "../i18n/names.ts";
import { cutText, EDGE_NAME, edgeDims, matchText, seamMatches } from "./dims.ts";
import { A4_TILING, layOut, pagesFor, type PlacedPiece, type Sheet } from "./layout.ts";
import { MEASURE_NAME } from "./measures.ts";
import { allowanceOf, notchTicks } from "./seam.ts";
import { seamLine, type EdgeKind, type Fabric, type Pattern } from "./types.ts";

const CM = 72 / 2.54;
const PAGE: [number, number] = [21 * CM, 29.7 * CM];
const MARGIN = 1; // cm
const BLACK = rgb(0, 0, 0), GREY = rgb(0.45, 0.45, 0.45), LIGHT = rgb(0.75, 0.75, 0.75);
const W_CUT = 1.2, W_SEAM = 0.6, W_MARK = 0.36; // 1 : 0.5 : 0.3

const ROWS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface PdfOptions {
  title?: string;
  heading?: string; // the cover's first line; defaults to "Rub-Off pattern: <garment>"
  createdFor?: string; // e.g. "Rub-Off sample"
  lang?: Lang; // default "en"
  font?: Uint8Array; // a TrueType font with the language's characters; required for Korean
}

// The words on the pattern, per language. Pattern markings follow each language's trade terms.
const T = {
  fold: L("골선에 놓고 재단", "PLACE ON FOLD", "COLOCAR AL DOBLEZ"),
  grain: L("식서", "GRAIN", "HILO"),
  lengthen: L("길이 조절선", "LENGTHEN OR SHORTEN HERE", "LÍNEA PARA ALARGAR O ACORTAR"),
  centreFront: L("앞중심", "CENTRE FRONT", "CENTRO DELANTERO"),
  confirm: L("재단 전에 확인하십시오", "Confirm before cutting", "Comprueba antes de cortar"),
  size: L("사이즈", "Size", "Talla"),
  original: L("원본", "Original", "Original"),
  title: L("Rub-Off 패턴", "Rub-Off pattern", "Patrón Rub-Off"),
  square: [
    L("10 cm 확인용 사각형", "10 cm TEST SQUARE", "CUADRADO DE PRUEBA DE 10 cm"),
    L("실제 크기(배율 100%)로 인쇄하십시오.", "Print at 100% / Actual size.", "Imprime al 100 % / tamaño real."),
    L("가로와 세로를 자로 재 보십시오.", "Measure both sides with a ruler.", "Mide ambos lados con una regla."),
    L("어느 쪽이든 10.0 cm가 아니면", "If either side is not 10.0 cm,", "Si algún lado no mide 10.0 cm,"),
    L("자르지 말고 인쇄 배율을 고치십시오.", "do not cut: fix the print scale.", "no cortes: corrige la escala."),
  ],
  pageMap: L("페이지 배치", "Page map", "Mapa de páginas"),
  pieces: L("조각", "Pieces", "Piezas"),
  seams: L("맞대어 박는 솔기 (완성선 길이)", "Seams sewn together (seam line lengths)", "Costuras que se unen (largo en la línea de costura)"),
  drafted: L("이 단면 치수로 제도했습니다 (cm)", "Drafted from these flat measurements (cm)", "Trazado con estas medidas en plano (cm)"),
  typical: L("* 재지 않은 보통 값: 재단 전에 재 주십시오.", "* typical value, not measured: measure before cutting.", "* valor habitual, sin medir: mídelo antes de cortar."),
  allowance: L("시접 포함", "Seam allowance included", "Margen de costura incluido"),
  plainSeam: L("기타 솔기", "seam", "costura"),
  notes: L("메모", "Notes", "Notas"),
  lines: L(
    "- 선: 실선 = 재단선, 점선 = 완성선, 일점쇄선 = 골선. 맞춤점: 하나 = 앞, 둘 = 뒤.",
    "- Lines: solid = cut, dashed = sew, dash-dot = fold. Notches: one = front, two = back.",
    "- Líneas: continua = corte, discontinua = costura, trazo y punto = doblez. Piquetes: uno = delantero, dos = trasero.",
  ),
  assemble: L(
    "- 붙이기: 자르지 말고, 겹치는 부분의 회색 점선이 맞도록 옆 장 위에 얹어 테이프로 붙입니다.",
    "- Assemble: trim nothing; lay each page over its neighbour so the grey dashed lines in the overlap match, then tape.",
    "- Montaje: no recortes; superpón cada página sobre la vecina hasta que coincidan las líneas grises discontinuas del solape y pega con cinta.",
  ),
  numbers: L(
    "재단 전에 모든 치수를 확인하십시오.",
    "Confirm every measurement before cutting.",
    "Comprueba cada medida antes de cortar.",
  ),
};
const FABRIC: Record<Fabric, Local> = { woven: L("우븐", "woven", "tejido plano"), knit: L("니트", "knit", "punto") };

const sizeOf = (pattern: Pattern, lang: Lang) => (pattern.sizeLabel === "Original" ? T.original[lang] : pattern.sizeLabel);

interface Fonts {
  font: PDFFont;
  bold: PDFFont;
  lang: Lang;
}

export async function patternPdf(pattern: Pattern, opts: PdfOptions = {}): Promise<{ bytes: Uint8Array; pages: [number, number]; sheet: Sheet }> {
  const lang = opts.lang ?? "en";
  const sheet = layOut(pattern);
  const [cols, rows] = pagesFor(sheet.width, sheet.height);
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title ?? `${T.title[lang]}: ${GARMENT_NAME[pattern.garment][lang]}, ${sizeOf(pattern, lang)}`);
  doc.setProducer("Rub-Off");
  let f: Fonts;
  if (opts.font) {
    doc.registerFontkit(fontkit);
    // Embedded whole: the file is already cut down to the characters we print (pdf-font.ts), and
    // fontkit's own subsetting dropped glyphs from this font.
    const font = await doc.embedFont(opts.font, { subset: false });
    f = { font, bold: font, lang };
  } else {
    if (lang === "ko") throw new Error("A Korean pattern needs a Korean font (see pdf-font.ts).");
    f = { font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), lang };
  }

  cover(doc, pattern, sheet, [cols, rows], f, opts);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) tile(doc.addPage(PAGE), sheet, r, c, [cols, rows], pattern, f);
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

// A character the font has no glyph for is dropped rather than printed as a box (or crashing,
// for the standard fonts).
const charsets = new WeakMap<PDFFont, Set<number>>();
function safe(text: string, font: PDFFont): string {
  let set = charsets.get(font);
  if (!set) charsets.set(font, (set = new Set(font.getCharacterSet())));
  return [...text].filter((ch) => ch === " " || set.has(ch.codePointAt(0)!)).join("");
}

function drawPiece(page: PDFPage, to: ToPage, pp: PlacedPiece, pattern: Pattern, { font, bold, lang }: Fonts) {
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
    label(page, to, T.fold[lang], add(lerp(q1, q2, 0.5), scale(n, 0.6)), 9, bold, u);
  }

  // Grainline, arrows both ends. A paper template has none.
  const [g0, g1] = piece.grain;
  const gd = sub(g1, g0), gl = Math.hypot(gd[0], gd[1]);
  if (!piece.paper && gl > 0) {
    polyline(page, to, [g0, g1], W_SEAM);
    arrowHead(page, to, g0, g1, 0.7);
    arrowHead(page, to, g1, g0, 0.7);
    label(page, to, T.grain[lang], add(lerp(g0, g1, 0.5), scale([-gd[1] / gl, gd[0] / gl], 0.45)), 7, font, gd);
  }

  for (const t of notchTicks(piece, pattern.fabric)) {
    const offsets = t.count === 1 ? [0] : [-0.2, 0.2];
    for (const o of offsets) polyline(page, to, [add(t.a, scale(t.along, o)), add(t.b, scale(t.along, o))], W_SEAM);
  }

  for (const m of piece.marks ?? []) {
    const d = sub(m.b, m.a), l = Math.hypot(d[0], d[1]), n: Pt = [-d[1] / l, d[0] / l];
    if (m.kind === "lengthen") {
      polyline(page, to, [m.a, m.b], W_MARK);
      polyline(page, to, [add(m.a, scale(n, 0.6)), add(m.b, scale(n, 0.6))], W_MARK);
      label(page, to, T.lengthen[lang], add(lerp(m.a, m.b, 0.5), scale(n, 1.2)), 6, font, d, GREY);
    } else if (m.kind === "guide") {
      // A line to trace onto the garment: as heavy as a seam line, labelled just inside it.
      polyline(page, to, [m.a, m.b], W_SEAM, false, [5, 2]);
      if (m.label) label(page, to, m.label[lang], add(lerp(m.a, m.b, 0.5), scale(n, 0.5)), 6, font, d);
    } else if (m.kind === "pocket") {
      polyline(page, to, [m.a, m.b], W_MARK, false, [3, 2]);
      if (m.label) label(page, to, m.label[lang], add(lerp(m.a, m.b, 0.5), scale(n, 0.9)), 6, font, d, GREY);
    } else {
      polyline(page, to, [m.a, m.b], W_MARK, false, [8, 2, 2, 2]);
      label(page, to, T.centreFront[lang], add(lerp(m.a, m.b, 0.35), scale(n, -0.5)), 6, font, d, GREY);
    }
  }

  // Each seam line's length, just inside it, along it. A paper template's lines say it instead.
  for (const d of piece.paper ? [] : edgeDims(piece)) {
    label(page, to, `${EDGE_NAME[d.kind][lang]} ${d.cm.toFixed(1)} cm`.trim(), add(d.at, scale(d.inward, 0.7)), 7, font, d.dir);
  }

  // Piece label near the middle of the seam line, away from the grainline.
  const line = seamLine(piece), b = bounds(line);
  const mid: Pt = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  const small = Math.min(b.maxX - b.minX, b.maxY - b.minY) < 12;
  const at: Pt = piece.labelAt ?? (small ? mid : [mid[0], mid[1] - 3]);
  const lines = [
    [lang === "ko" ? piece.names.ko : piece.names[lang].toUpperCase(), 12, bold],
    [`${cutText(piece, lang)}  |  ${T.size[lang]} ${sizeOf(pattern, lang)}  |  ${FABRIC[pattern.fabric][lang]}`, 8, font],
    [T.confirm[lang], 7, font],
  ] as const;
  const dir: Pt = small && b.maxY - b.minY > b.maxX - b.minX ? [0, 1] : [1, 0];
  const perp: Pt = [-dir[1], dir[0]];
  lines.forEach(([t, size, f], i) => label(page, to, t, add(at, scale(perp, (i - 1) * 0.65)), size, f, dir));
}

// ---------- pages ----------

function tile(page: PDFPage, sheet: Sheet, r: number, c: number, [cols, rows]: [number, number], pattern: Pattern, f: Fonts) {
  const { font, bold, lang } = f;
  const t = A4_TILING;
  const x0 = c * t.step[0], y0 = r * t.step[1];
  const to: ToPage = ([x, y]) => ({ x: (MARGIN + x - x0) * CM, y: PAGE[1] - (MARGIN + y - y0) * CM });

  page.pushOperators(pushGraphicsState(), rectangle(MARGIN * CM, PAGE[1] - (MARGIN + t.content[1]) * CM, t.content[0] * CM, t.content[1] * CM), clip(), endPath());
  for (const pp of sheet.pieces) {
    const b = bounds(pp.cut);
    if (b.maxX < x0 - 2 || b.minX > x0 + t.content[0] + 2 || b.maxY < y0 - 2 || b.minY > y0 + t.content[1] + 2) continue;
    drawPiece(page, to, pp, pattern, f);
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
  const grid = L(`${rows}행 × ${cols}열`, `${rows} rows x ${cols} columns`, `${rows} filas × ${cols} columnas`)[lang];
  const head = `${name(r, c)}   (${grid})   ${GARMENT_NAME[pattern.garment][lang]}, ${T.size[lang]} ${sizeOf(pattern, lang)}`;
  page.drawText(safe(head, font), { x: MARGIN * CM, y: PAGE[1] - m * CM - 3, size: 7, font, color: GREY });
  if (c + 1 < cols) page.drawText(`${name(r, c + 1)} >`, { x: PAGE[0] - 0.4 * CM, y: PAGE[1] / 2, size: 7, font: bold, color: GREY, rotate: degrees(-90) });
  if (r + 1 < rows) page.drawText(`${name(r + 1, c)} v`, { x: PAGE[0] / 2, y: (m * CM) - 3, size: 7, font: bold, color: GREY });
  // A 5 cm bar on every page, so any page can be checked.
  const bar = { x: PAGE[0] - (MARGIN + 5) * CM, y: (m * CM) };
  page.drawLine({ start: bar, end: { x: bar.x + 5 * CM, y: bar.y }, thickness: W_SEAM, color: BLACK });
  for (let k = 0; k <= 5; k++) page.drawLine({ start: { x: bar.x + k * CM, y: bar.y }, end: { x: bar.x + k * CM, y: bar.y + (k % 5 ? 2 : 4) }, thickness: W_MARK, color: BLACK });
  page.drawText("5 cm", { x: bar.x - 22, y: bar.y - 2, size: 6, font, color: GREY });
}

function cover(doc: PDFDocument, pattern: Pattern, sheet: Sheet, [cols, rows]: [number, number], { font, bold, lang }: Fonts, opts: PdfOptions) {
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
  text(opts.heading ?? `${T.title[lang]}: ${GARMENT_NAME[pattern.garment][lang]}`, 18, bold);
  const pagesText = L(`A4 ${cols * rows}장 (${rows}행 × ${cols}열)`, `${cols * rows} pages (${rows} rows x ${cols} columns)`, `${cols * rows} páginas (${rows} filas × ${cols} columnas)`)[lang];
  text(`${T.size[lang]} ${sizeOf(pattern, lang)}  |  ${FABRIC[pattern.fabric][lang]}  |  ${pagesText}${opts.createdFor ? `  |  ${opts.createdFor}` : ""}`, 10, font, GREY);
  y -= 6;

  // The test square, true size.
  const sq = { x, y: y - 10 * CM };
  page.drawRectangle({ x: sq.x, y: sq.y, width: 10 * CM, height: 10 * CM, borderColor: BLACK, borderWidth: W_SEAM });
  for (let k = 1; k < 10; k++) {
    page.drawLine({ start: { x: sq.x + k * CM, y: sq.y }, end: { x: sq.x + k * CM, y: sq.y + 0.3 * CM }, thickness: W_MARK, color: BLACK });
    page.drawLine({ start: { x: sq.x, y: sq.y + k * CM }, end: { x: sq.x + 0.3 * CM, y: sq.y + k * CM }, thickness: W_MARK, color: BLACK });
  }
  T.square.forEach((t, i) => page.drawText(safe(t[lang], i === 0 ? bold : font), { x: sq.x + 0.8 * CM, y: sq.y + 9 * CM - i * 13, size: i === 0 ? 10 : 8, font: i === 0 ? bold : font }));

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
  page.drawText(safe(T.pageMap[lang], bold), { x: map.x, y: map.y + map.h + 4, size: 8, font: bold, color: GREY });

  y = sq.y - 0.8 * CM;
  text(T.pieces[lang], 11, bold);
  for (const pp of sheet.pieces) {
    const p = pp.piece;
    const [w, h] = [pp.size[0].toFixed(1), pp.size[1].toFixed(1)];
    const size = (p.paper ? L(`${w} × ${h} cm`, `${w} x ${h} cm`, `${w} × ${h} cm`) : L(`시접 포함 ${w} × ${h} cm`, `${w} x ${h} cm with allowance`, `${w} × ${h} cm con margen de costura`))[lang];
    text(`${p.names[lang]} (${cutText(p, lang, true)}): ${size}`, 8, font, BLACK, 8);
  }
  const matches = seamMatches(pattern);
  if (matches.length) {
    y -= 4;
    text(T.seams[lang], 11, bold);
    for (const m of matches) text(matchText(m, lang), 8, font, BLACK, 8);
  }
  y -= 4;
  text(T.drafted[lang], 11, bold);
  const typical = new Set(pattern.unmeasured);
  text(
    Object.entries(pattern.measures)
      .filter(([k]) => MEASURE_NAME[k])
      .map(([k, v]) => `${MEASURE_NAME[k][lang]} ${v.toFixed(1)}${typical.has(k) ? "*" : ""}`)
      .join(",  "),
    8, font, BLACK, 8,
  );
  if (typical.size) text(T.typical[lang], 8, font, GREY, 8);
  y -= 4;
  text(T.allowance[lang], 11, bold);
  const cut = sheet.pieces.filter((pp) => !pp.piece.paper);
  const kinds = [...new Set(cut.flatMap((pp) => pp.piece.edges.map((e) => e.kind)))] as EdgeKind[];
  const used = kinds
    .filter((kd) => kd !== "fold")
    .map((kd) => {
      const vals = [...new Set(cut.flatMap((pp) => pp.piece.edges.filter((e) => e.kind === kd).map((e) => allowanceOf(e, pattern.fabric))))];
      return `${EDGE_NAME[kd][lang] || T.plainSeam[lang]} ${vals.map((v) => v.toFixed(1)).join("/")} cm`;
    });
  const dflt = seamAllowance("seam", pattern.fabric);
  text(used.join(", ") + L(`. 기본 시접 ${dflt} cm.`, `. Default seam ${dflt} cm.`, `. Margen general ${dflt} cm.`)[lang], 8, font, BLACK, 8);
  y -= 4;
  text(T.notes[lang], 11, bold);
  for (const n of pattern.notes) text(`- ${n[lang]}`, 8, font, BLACK, 8);
  text(T.lines[lang], 8, font, BLACK, 8);
  text(T.assemble[lang], 8, font, BLACK, 8);
  y -= 4;
  text(T.numbers[lang], 8, bold);
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

