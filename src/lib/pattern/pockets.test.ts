import assert from "node:assert/strict";
import { test } from "node:test";
import { bounds, polygonArea } from "../geom/polygon.ts";
import { draft } from "./draft.ts";
import { EXAMPLES } from "./examples.ts";
import { layOut } from "./layout.ts";
import { patternPdf } from "./pdf.ts";
import { cuttingLine } from "./seam.ts";
import { defaultPocket, pocketKinds, pocketShape, placed, shareOf, withPockets, type Pocket } from "./pockets.ts";
import { grade } from "../rules/grading.ts";
import { seamLine, type GarmentKind } from "./types.ts";

const ex = (g: GarmentKind) => draft({ garment: g, measures: EXAMPLES[g].m, fabric: EXAMPLES[g].fabric });

test("a default pocket fits its panel on every garment that takes one, and becomes a piece with its outline marked", () => {
  for (const g of Object.keys(EXAMPLES) as GarmentKind[]) {
    const base = ex(g);
    for (const kind of pocketKinds(base)) {
      const p = defaultPocket(base, kind, "p1")!;
      const host = base.pieces.find((h) => h.id === p.host)!;
      assert.ok(placed(host, p).fits, `${g} ${kind}`);
      const out = withPockets(base, [p]);
      const piece = out.pieces.find((x) => x.id === "pocket-1")!;
      assert.ok(piece, `${g} ${kind}`);
      // The pocket piece's seam line is the finished outline: same area, whole or as the fold's half.
      const area = Math.abs(polygonArea(seamLine(piece)));
      const shape = Math.abs(polygonArea(pocketShape(kind, p.width, p.height)));
      assert.ok(Math.abs(area - shape) < 0.5, `${g} ${kind} ${area} ${shape}`);
      assert.ok(cuttingLine(piece, base.fabric).length > 3);
      const marks = out.pieces.find((h) => h.id === p.host)!.marks!.filter((m) => m.kind === "pocket");
      assert.equal(marks.filter((m) => m.label).length, 1);
      assert.equal(base.pieces.find((h) => h.id === p.host)!.marks?.some((m) => m.kind === "pocket") ?? false, false, "the base pattern is not changed");
    }
  }
  assert.deepEqual(pocketKinds(ex("cushion")), []);
  assert.deepEqual(pocketKinds(ex("sweatshirt")), ["patch", "round", "kangaroo"]);
  assert.deepEqual(pocketKinds(ex("hoodie")), ["patch", "round", "kangaroo"]); // split by the zip, a half on each front
  assert.deepEqual(pocketKinds(ex("shirt")), ["patch", "round"]); // the button stand is past the centre line
});

test("a pocket's place follows its panel when the pattern is graded; one that no longer fits is left out with a note", () => {
  const base = ex("t-shirt");
  const p = defaultPocket(base, "patch", "p1")!;
  const front = base.pieces.find((h) => h.id === "front")!;
  const up = draft({ garment: "t-shirt", measures: grade("t-shirt", EXAMPLES["t-shirt"].m, 2), fabric: "knit" });
  const a = placed(front, p).outline[0], b = placed(up.pieces.find((h) => h.id === "front")!, p).outline[0];
  assert.ok(b[0] > a[0], "moves out with the wider front");
  const huge: Pocket = { ...p, width: 50, height: 50 };
  const out = withPockets(base, [p, huge]);
  assert.equal(out.pieces.filter((x) => x.id.startsWith("pocket-")).length, 1);
  assert.match(out.notes.at(-1)!.en, /Pocket 2 fell outside/);
  // shareOf undoes pocketAnchor.
  const s = shareOf(front, placed(front, p).outline[0].map((x, i) => (i === 0 ? x + p.width / 2 : x)) as [number, number]);
  assert.ok(Math.abs(s.u - p.u) < 1e-9 && Math.abs(s.v - p.v) < 1e-9);
});

test("trouser back pockets are cut two, one per leg; a kangaroo is cut once on the fold", () => {
  const pants = ex("pants");
  const back = withPockets(pants, [defaultPocket(pants, "patch", "a")!]).pieces.at(-1)!;
  assert.equal(back.cut.count, 2);
  const sw = ex("sweatshirt");
  const k = withPockets(sw, [defaultPocket(sw, "kangaroo", "k")!]).pieces.at(-1)!;
  assert.deepEqual([k.cut.count, k.cut.onFold], [1, true]);
  const b = bounds(seamLine(k));
  assert.ok(b.minX === 0);
});

test("the PDF prints with pockets, and the print layout carries their marks", async () => {
  const base = ex("shirt");
  const out = withPockets(base, [defaultPocket(base, "round", "p")!]);
  const sheet = layOut(out);
  assert.ok(sheet.pieces.some((pp) => pp.piece.marks?.some((m) => m.kind === "pocket")));
  const { bytes } = await patternPdf(out, { createdFor: "test", lang: "en" });
  assert.ok(bytes.length > 1000);
});
