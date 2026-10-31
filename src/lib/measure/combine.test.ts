import assert from "node:assert/strict";
import { test } from "node:test";
import { combineMeasurements } from "./combine.ts";

const v = (cm: number, pm: number, bound?: "max" | "min") => ({ cm, plusMinusCm: pm, confidence: "high" as const, ...(bound && { bound }) });

test("each value comes from the surer photo; a disagreement widens the ± and is named", () => {
  const c = combineMeasurements([
    { chest: v(54, 1), sleeve: v(20, 2), length: v(75, 1) },
    { chest: v(54.5, 1.5), sleeve: v(21, 0.8), length: v(68, 1) },
  ]);
  assert.equal(c.values.chest.cm, 54);
  assert.equal(c.from.sleeve, 1);
  assert.equal(c.values.sleeve.cm, 21);
  assert.deepEqual(c.conflicts.map((x) => x.key), ["length"]);
  assert.equal(c.values.length.plusMinusCm, 7);
});

test("an unbounded value beats a bound one", () => {
  const c = combineMeasurements([{ frontRise: v(42, 0.5, "max") }, { frontRise: v(28, 1) }]);
  assert.equal(c.values.frontRise.cm, 28);
  assert.equal(c.conflicts.length, 0);
});
