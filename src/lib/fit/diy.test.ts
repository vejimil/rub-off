import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { polylineLength } from "../geom/point.ts";
import { L, LANGS } from "../i18n/lang.ts";
import { cutText } from "../pattern/dims.ts";
import { draft } from "../pattern/draft.ts";
import { EXAMPLES } from "../pattern/examples.ts";
import { patternPdf } from "../pattern/pdf.ts";
import { readPdfFont } from "../pattern/pdf-font-node.ts";
import { seamAllowance } from "../rules/seam-rules.ts";
import { compare, complaintsFor, fromBody, fromComplaint, guarded, HEM_SPARE, WORN } from "./alter.ts";
import { targetsFromBody } from "./body.ts";
import { alterationPattern, diyGuide, ELBOW_PATCH, LOOP } from "./diy.ts";

const PANTS = EXAMPLES.pants.m as Record<string, number>;
const UNCHECKED = "Measure this step's amount yourself before cutting.";

test("every complaint on every garment has steps whose numbers pass the guard", () => {
  for (const g of WORN) {
    const m = EXAMPLES[g].m as Record<string, number>;
    for (const c of complaintsFor(g)) {
      for (const amountCm of [undefined, 4]) {
        const a = guarded(fromComplaint(g, { id: c.id, amountCm }));
        const guide = diyGuide(g, m, EXAMPLES[g].fabric, a, 1);
        assert.ok(guide.steps.length > 0, `${g} ${c.id}`);
        for (const s of guide.steps) {
          assert.notEqual(s.en, UNCHECKED, `${g} ${c.id} ${amountCm}: ${JSON.stringify(s)}`);
          for (const l of LANGS) assert.ok(s[l].trim(), `${g} ${c.id} ${l}`);
        }
      }
    }
  }
});

test("a back-rise insert is as wide as the back waist it is sewn to, and as deep as the amount", () => {
  const a = guarded(fromComplaint("pants", { id: "seat-back-drops", amountCm: 6 }));
  const guide = diyGuide("pants", PANTS, "woven", a, 2);
  const [insert] = guide.pieces;
  assert.equal(insert.id, "alt2-rise");
  assert.equal(insert.names.ko, "2. 뒤 밑위 덧단");
  assert.deepEqual(insert.cut, { count: 1, onFold: true, mirror: false });
  const back = draft({ garment: "pants", measures: PANTS, fabric: "woven" }).pieces.find((p) => p.id === "back")!;
  const waist = polylineLength(back.edges.find((e) => e.kind === "casing")!.pts);
  const top = insert.edges[0].pts, fold = insert.edges[2].pts;
  assert.ok(Math.abs(polylineLength(top) - waist) < 1e-9);
  assert.ok(Math.abs(polylineLength(fold) - 6) < 1e-9);
  // Without an amount it still takes the researched default.
  assert.equal(diyGuide("pants", PANTS, "woven", guarded(fromComplaint("pants", { id: "seat-back-drops" })), 1).pieces.length, 1);
});

test("past the hem's spare, trousers get a band per leg, as long as the leg opening all round", () => {
  const a = guarded(fromComplaint("pants", { id: "pants-short", amountCm: HEM_SPARE.pants + 3 }));
  assert.equal(a.diy.how, "band");
  const [band] = diyGuide("pants", PANTS, "woven", a, 1).pieces;
  assert.equal(band.cut.count, 2);
  assert.ok(Math.abs(polylineLength(band.edges[0].pts) - 2 * PANTS.legOpening) < 1e-9);
  assert.ok(Math.abs(polylineLength(band.edges[1].pts) - (HEM_SPARE.pants + 3)) < 1e-9);
  assert.equal(band.edges[2].kind, "hem");
  // Within the spare, the hem is let down and the pattern is only a gauge.
  const down = diyGuide("pants", PANTS, "woven", guarded(fromComplaint("pants", { id: "pants-short", amountCm: 2 })), 1);
  assert.equal(down.pieces.length, 1);
  assert.ok(down.pieces[0].paper);
  assert.equal(cutText(down.pieces[0], "ko"), "종이 본: 천은 자르지 않음");
});

test("side panels from the body comparison are as long as the drafted side seam and as wide as the shortfall", () => {
  const tee = EXAMPLES["t-shirt"].m as Record<string, number>;
  const t = targetsFromBody("t-shirt", { chestGirth: 2 * tee.chest + 10 }, "regular", "knit"); // 5 cm flat short
  const a = guarded(fromBody("t-shirt", compare(t, tee, "knit")).find((x) => x.id === "body-chest")!);
  assert.equal(a.diy.how, "panel");
  const g = diyGuide("t-shirt", tee, "knit", a, 1);
  const [panel] = g.pieces;
  const front = draft({ garment: "t-shirt", measures: tee, fabric: "knit" }).pieces.find((p) => p.id === "front")!;
  const side = polylineLength(front.edges.find((e) => e.kind === "side")!.pts);
  assert.ok(Math.abs(polylineLength(panel.edges[1].pts) - side) < 1e-9);
  assert.ok(Math.abs(polylineLength(panel.edges[0].pts) - a.amountCm!) < 1e-9);
  // The step names the knit allowance from the rule table.
  assert.ok(g.steps.some((s) => s.ko.includes(`시접 ${seamAllowance("seam", "knit")} cm`)));
});

test("an amount the wearer didn't give leaves the piece out and says why", () => {
  const g = diyGuide("pants", PANTS, "woven", guarded(fromComplaint("pants", { id: "leg-wide" })), 1);
  assert.equal(g.pieces.length, 0);
  assert.ok(g.missing);
  const sized = diyGuide("pants", PANTS, "woven", guarded(fromComplaint("pants", { id: "leg-wide", amountCm: 2 })), 1);
  assert.equal(sized.pieces[0].marks!.filter((m) => m.kind === "guide").length, 3);
});

test("patches and loops have their rule sizes", () => {
  const elbow = diyGuide("long-sleeve", EXAMPLES["long-sleeve"].m as Record<string, number>, "knit", guarded(fromComplaint("long-sleeve", { id: "elbows-wear" })), 1).pieces[0];
  const xs = elbow.edges.flatMap((e) => e.pts.map((p) => p[0])), ys = elbow.edges.flatMap((e) => e.pts.map((p) => p[1]));
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - ELBOW_PATCH[0]) < 1e-9);
  assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - ELBOW_PATCH[1]) < 1e-9);
  const loop = diyGuide("pants", PANTS, "woven", guarded(fromComplaint("pants", { id: "hard-pull-up" })), 1).pieces[0];
  assert.equal(loop.cut.count, 3);
  assert.ok(!loop.paper);
  assert.ok(Math.abs(polylineLength(loop.edges[0].pts) - 4 * LOOP.width) < 1e-9);
});

test("the alteration pattern prints at actual size, in every language", async () => {
  const alts = [
    fromComplaint("pants", { id: "seat-back-drops" }),
    fromComplaint("pants", { id: "pants-short", amountCm: 6 }),
    fromComplaint("pants", { id: "leg-wide", amountCm: 2 }),
    fromComplaint("pants", { id: "cast-leg", amountCm: 30, side: "left" }),
    fromComplaint("pants", { id: "hard-pull-up" }),
  ].map((a) => guarded(a));
  const guides = alts.map((a, i) => diyGuide("pants", PANTS, "woven", a, i + 1));
  const p = alterationPattern("pants", PANTS, "woven", guides)!;
  assert.deepEqual(
    p.pieces.map((x) => x.id),
    ["alt1-rise", "alt2-band", "alt3-taper", "alt4-facing", "alt5-loop"],
  );
  const heading = L("수선 패턴: 바지", "Alteration pattern: Trousers", "Patrón de arreglos: Pantalón");
  for (const lang of LANGS) {
    const { bytes } = await patternPdf(p, { lang, heading: heading[lang], font: await readPdfFont(lang) });
    const doc = await PDFDocument.load(bytes);
    assert.ok(doc.getPageCount() >= 2);
  }
  assert.equal(alterationPattern("pants", PANTS, "woven", [diyGuide("pants", PANTS, "woven", guarded(fromComplaint("pants", { id: "seat-presses" })), 1)]), null);
});
