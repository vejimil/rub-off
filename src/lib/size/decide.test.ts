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
  assert.match(d.sentences[0], /^M: /);
  assert.ok(d.sentences.some((s) => s.startsWith("총장")), d.sentences.join("\n"));
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
