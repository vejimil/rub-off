import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { polylineLength, type Pt } from "../geom/point.ts";
import { bounds, polygonArea, segDist } from "../geom/polygon.ts";
import { grade, gradedLabel } from "../rules/grading.ts";
import { draft } from "./draft.ts";
import { layOut, pagesFor } from "./layout.ts";
import { patternPdf } from "./pdf.ts";
import { cuttingLine } from "./seam.ts";
import type { Piece } from "./types.ts";

const TEE = { length: 70, chest: 54, shoulder: 47, hem: 53, sleeve: 21, sleeveOpening: 17, bicep: 20, armholeDepth: 23 };

const nearest = (p: Pt, poly: readonly Pt[]) => Math.min(...poly.map((q, i) => segDist(p, q, poly[(i + 1) % poly.length])));

test("a rectangle gets each edge's own allowance, mitred at the corners", () => {
  const piece: Piece = {
    id: "r",
    name: "R",
    nameKo: "R",
    cut: { count: 1, onFold: false, mirror: false },
    edges: [
      { kind: "seam", pts: [[0, 0], [20, 0]] }, // top 1
      { kind: "side", pts: [[20, 0], [20, 30]] }, // right 1
      { kind: "hem", pts: [[20, 30], [0, 30]] }, // bottom 2.5
      { kind: "fold", pts: [[0, 30], [0, 0]] }, // left 0
    ],
    grain: [[10, 5], [10, 25]],
    notches: [],
  };
  const cut = cuttingLine(piece, "woven");
  const b = bounds(cut);
  assert.ok(Math.abs(b.minX - 0) < 1e-3 && Math.abs(b.maxX - 21) < 1e-3, JSON.stringify(b));
  assert.ok(Math.abs(b.minY + 1) < 1e-3 && Math.abs(b.maxY - 32.5) < 1e-3, JSON.stringify(b));
  assert.ok(Math.abs(polygonArea(cut) - 21 * 33.5) < 0.01);
});

test("the cutting line stays its allowance away from a curved seam", () => {
  const p = draft({ garment: "t-shirt", measures: TEE, fabric: "woven" });
  const front = p.pieces.find((x) => x.id === "front")!;
  const cut = cuttingLine(front, "woven");
  const neck = front.edges.find((e) => e.kind === "neck")!;
  const arm = front.edges.find((e) => e.kind === "armhole")!;
  // Away from the corners, every point of the edge is exactly its allowance from the cut line.
  for (const [pts, w] of [[neck.pts, 0.7], [arm.pts, 1]] as const) {
    for (const q of pts.slice(5, -5)) assert.ok(Math.abs(nearest(q, cut) - w) < 0.03, `${nearest(q, cut)} vs ${w}`);
  }
});

test("the sleeve cap is solved to the armhole plus ease", () => {
  for (const fabric of ["woven", "knit"] as const) {
    const p = draft({ garment: "t-shirt", measures: TEE, fabric });
    const armhole = p.pieces
      .filter((x) => x.id === "front" || x.id === "back")
      .reduce((s, x) => s + polylineLength(x.edges.find((e) => e.kind === "armhole")!.pts), 0);
    const cap = p.pieces.find((x) => x.id === "sleeve")!.edges.filter((e) => e.kind === "sleeve-cap").reduce((s, e) => s + polylineLength(e.pts), 0);
    const ease = fabric === "woven" ? 1.5 : 0;
    assert.ok(Math.abs(cap - armhole - ease) < 0.05, `${fabric}: cap ${cap.toFixed(2)} armhole ${armhole.toFixed(2)}`);
  }
});

test("drafted widths and lengths are the measured ones", () => {
  const p = draft({ garment: "t-shirt", measures: TEE, fabric: "knit" });
  const front = p.pieces.find((x) => x.id === "front")!;
  const pts = front.edges.flatMap((e) => e.pts);
  const b = bounds(pts);
  assert.ok(Math.abs(b.maxY - b.minY - TEE.length) < 1e-6);
  const side = front.edges.find((e) => e.kind === "side")!.pts;
  assert.ok(Math.abs(side[0][0] * 2 - TEE.chest) < 1e-6);
  assert.ok(Math.abs(side[1][0] * 2 - TEE.hem) < 1e-6);
  const shoulder = front.edges.find((e) => e.kind === "shoulder")!.pts;
  assert.ok(Math.abs(shoulder[1][0] * 2 - TEE.shoulder) < 1e-6);
  assert.ok(p.notes.some((n) => n.includes("frontNeckDrop")), "defaults are named");
});

test("grading moves the measurements and the pieces follow", () => {
  const up = grade("t-shirt", TEE, 1);
  assert.equal(up.chest, 56);
  assert.equal(up.length, 71.5);
  assert.equal(gradedLabel("M", 1), "L");
  assert.equal(gradedLabel("M", -2), "XS");
  const a = draft({ garment: "t-shirt", measures: TEE, fabric: "knit" });
  const b = draft({ garment: "t-shirt", measures: up, fabric: "knit" });
  const capLen = (p: typeof a) => p.pieces.find((x) => x.id === "sleeve")!.edges.filter((e) => e.kind === "sleeve-cap").reduce((s, e) => s + polylineLength(e.pts), 0);
  assert.ok(capLen(b) > capLen(a), "the cap grows with the armhole");
});

test("every garment drafts, and missing measurements are refused", () => {
  draft({ garment: "shirt", measures: { ...TEE, sleeve: 61, sleeveOpening: 11 }, fabric: "woven" });
  draft({ garment: "pants", measures: { waist: 34, hip: 52, frontRise: 28, outseam: 98, thigh: 31, legOpening: 19 }, fabric: "woven" });
  draft({ garment: "skirt", measures: { length: 70, hem: 90 }, fabric: "woven" });
  draft({ garment: "eco-bag", measures: { width: 36, height: 40, handleLength: 55 }, fabric: "woven" });
  assert.throws(() => draft({ garment: "skirt", measures: { length: 70 }, fabric: "woven" }), /hem/);
});

test("layout keeps pieces apart and the PDF has a cover plus one page per tile", async () => {
  const p = draft({ garment: "eco-bag", measures: { width: 36, height: 40, handleLength: 55, gusset: 8 }, fabric: "woven" });
  const sheet = layOut(p);
  const [a, b] = sheet.pieces.map((x) => bounds(x.cut));
  const apart = a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY;
  assert.ok(apart);
  const { bytes, pages } = await patternPdf(p);
  assert.deepEqual(pages, pagesFor(sheet.width, sheet.height));
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), pages[0] * pages[1] + 1);
});

test("a hoodie's hood neck edge is solved to the half neckline, and its ribs use the measured bands", () => {
  const p = draft({ garment: "hoodie", measures: { length: 70, chest: 58, shoulder: 50, hem: 48, sleeve: 62, sleeveOpening: 9, bicep: 21, armholeDepth: 26 }, fabric: "knit" });
  const neckOf = (id: string) => polylineLength(p.pieces.find((x) => x.id === id)!.edges.find((e) => e.kind === "neck")!.pts);
  assert.ok(Math.abs(neckOf("hood") - (neckOf("front") + neckOf("back"))) < 0.05);
  const rib = bounds(p.pieces.find((x) => x.id === "hem-rib")!.edges.flatMap((e) => e.pts));
  assert.ok(Math.abs(rib.maxX - rib.minX - 96) < 1e-6);
  const front = p.pieces.find((x) => x.id === "front")!;
  assert.deepEqual(front.cut, { count: 2, onFold: false, mirror: true });
});
