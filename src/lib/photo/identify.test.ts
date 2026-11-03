import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { cachedIdentify, edgeBefore, saveIdentified, turnFraction, type Identified } from "./identify.ts";

test("a tapped point turns with the photo: the edge that held the top goes to the top", () => {
  // The middle of the edge the item's top points to lands at the top middle.
  assert.deepEqual(turnFraction([0, 0.5], "left"), [0.5, 0]);
  assert.deepEqual(turnFraction([1, 0.5], "right"), [0.5, 0]);
  assert.deepEqual(turnFraction([0.5, 1], "bottom"), [0.5, 0]);
  assert.deepEqual(turnFraction([0.3, 0.2], "top"), [0.3, 0.2]);
  // A corner: top-left of a photo lying with its top to the left becomes top-right.
  assert.deepEqual(turnFraction([0, 0], "left"), [1, 0]);
});

test("asked again with the kind it was told as, the photo's answer is reused; another kind isn't", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "identify-"));
  try {
    const told: Identified = { garment: "hoodie", fabric: "knit", word: "hoodie", neck: "top" };
    await saveIdentified(dir, told);
    assert.deepEqual(await cachedIdentify(dir, "hoodie"), told);
    assert.equal(await cachedIdentify(dir, "pants"), null);
    const asKind: Identified = { ...told, neck: "left" };
    await saveIdentified(dir, asKind, "hoodie");
    assert.deepEqual(await cachedIdentify(dir, "hoodie"), asKind, "an answer given for the kind comes first");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("an edge of the turned photo, as an edge of the photo before the turn", () => {
  // Turned so its left edge is up: the turned photo's top was the left, its bottom the right.
  assert.equal(edgeBefore("top", "left"), "left");
  assert.equal(edgeBefore("bottom", "left"), "right");
  assert.equal(edgeBefore("right", "left"), "top");
  assert.equal(edgeBefore("top", "bottom"), "bottom");
  assert.equal(edgeBefore("left", "top"), "left");
  // Each edge back where turnFraction takes it.
  for (const up of ["top", "right", "bottom", "left"] as const) {
    const mid = { top: [0.5, 0], right: [1, 0.5], bottom: [0.5, 1], left: [0, 0.5] } as const;
    assert.deepEqual(turnFraction([...mid[up]], up), [0.5, 0], up);
  }
});
