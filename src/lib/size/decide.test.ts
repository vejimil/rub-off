import assert from "node:assert/strict";
import { test } from "node:test";
import { decideSize, toFlatCm, type SizeTable } from "./decide.ts";
import { toSizeTable } from "./table.ts";

const TABLE: SizeTable = {
  unit: "cm",
  basis: "flat",
  sizes: [
    { label: "S", values: { length: 66, shoulder: 44, chest: 50, sleeve: 59 } },
    { label: "M", values: { length: 68, shoulder: 46, chest: 53, sleeve: 60 } },
    { label: "L", values: { length: 70, shoulder: 48, chest: 56, sleeve: 61 } },
  ],
};
const MINE = { length: { cm: 71 }, shoulder: { cm: 46.2 }, chest: { cm: 52.5 }, sleeve: { cm: 60.4 } };

test("the size whose points fit best wins, and the one that doesn't is named", () => {
  const d = decideSize(MINE, TABLE, "woven", "same");
  assert.ok(d.ok);
  assert.equal(d.best.label, "M");
  const length = d.best.checks.find((c) => c.key === "length")!;
  assert.equal(length.verdict, "small");
  assert.equal(length.diff, -3);
  assert.match(d.sentences[0].ko, /^M: /);
  assert.ok(d.sentences.some((s) => s.ko.startsWith("총장") && s.en.startsWith("Length") && s.es.startsWith("Largo total")), d.sentences.map((s) => s.ko).join("\n"));
});

test("wanting it looser moves the choice up", () => {
  const d = decideSize(MINE, TABLE, "woven", "looser");
  assert.ok(d.ok);
  assert.equal(d.best.label, "L");
});

test("circumference tables are halved, inches converted; an unstated basis is asked", () => {
  const flat = toFlatCm({ unit: "inch", basis: "circumference", sizes: [{ label: "M", values: { chest: 40, length: 27 } }] });
  assert.ok(Math.abs(flat.sizes[0].values.chest! - 50.8) < 1e-9);
  assert.ok(Math.abs(flat.sizes[0].values.length! - 68.58) < 1e-9);
  const d = decideSize(MINE, { ...TABLE, basis: "unknown" }, "woven", "same");
  assert.equal(d.ok, false);
  assert.equal(!d.ok && d.reason, "ask-basis");
});

test("cells Spark copied are parsed; anything that isn't a number is handed back", () => {
  const { table, unreadable } = toSizeTable({
    unit: "unknown",
    basis: "flat",
    columns: [{ header: "총장", meaning: "length" }, { header: "가슴단면", meaning: "chest" }, { header: "비고", meaning: "other" }],
    rows: [{ label: "M", cells: ["68", "53,5", "x"] }, { label: "L", cells: ["7O", "56", null] }],
  });
  assert.equal(table.unit, "cm");
  assert.deepEqual(table.sizes[0].values, { length: 68, chest: 53.5 });
  assert.deepEqual(unreadable, [{ row: "L", header: "총장", cell: "7O" }]);
});

test("a trouser table's 총장 is compared with the outseam", () => {
  const d = decideSize({ waist: { cm: 39.7 }, outseam: { cm: 46.6 } }, { unit: "cm", basis: "flat", sizes: [{ label: "M", values: { waist: 39, length: 46 } }] }, "woven", "same");
  assert.ok(d.ok);
  assert.deepEqual(d.best.checks.map((c) => c.key).sort(), ["outseam", "waist"]);
});

test("a length no size comes near is another style: left out of the comparison, and said so", () => {
  // A short-sleeved T-shirt against a long-sleeved table: the sleeve is 23 cm, the table 59–61.
  const d = decideSize({ ...MINE, sleeve: { cm: 23 } }, TABLE, "woven", "same");
  assert.ok(d.ok);
  assert.deepEqual(d.unlike.map((u) => u.key), ["sleeve"]);
  assert.ok(d.all.every((r) => r.checks.every((c) => c.key !== "sleeve")));
  assert.equal(d.best.label, "M");
  const said = d.sentences.find((s) => s.en.startsWith("Sleeve"));
  assert.ok(said && /59\.0–61\.0 cm/.test(said.en) && /23\.0 cm/.test(said.ko), d.sentences.map((s) => s.en).join("\n"));
});

test("a nearby length is still a size question", () => {
  const d = decideSize({ ...MINE, sleeve: { cm: 45 } }, TABLE, "woven", "same");
  assert.ok(d.ok);
  assert.equal(d.unlike.length, 0);
  assert.ok(d.best.checks.some((c) => c.key === "sleeve"));
});

test("when every shared length is too far off, the reasons are said rather than 'nothing in common'", () => {
  const short: SizeTable = { unit: "cm", basis: "flat", sizes: [{ label: "S", values: { sleeve: 59 } }, { label: "M", values: { sleeve: 61 } }] };
  const d = decideSize({ sleeve: { cm: 23 } }, short, "woven", "same");
  assert.ok(!d.ok && d.reason === "nothing-to-compare");
  assert.ok(/59\.0–61\.0 cm/.test(d.detail.en) && /folded sleeve/.test(d.detail.en), d.detail.en);
});
