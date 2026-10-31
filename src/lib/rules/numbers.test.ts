import assert from "node:assert/strict";
import { test } from "node:test";
import { guardNumbers, numbersIn, roundHalf } from "./numbers.ts";

test("text passes only when every number in it was computed", () => {
  assert.deepEqual(numbersIn("M: 가슴 +1.0, 총장 −3 cm"), [1, 3]);
  assert.ok(guardNumbers("총장 3 cm 짧습니다", [3, 1.5]));
  assert.ok(!guardNumbers("총장 4 cm 짧습니다", [3, 1.5]));
  assert.equal(roundHalf(2.74), 2.5);
});
