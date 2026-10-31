import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pt } from "../geom/point.ts";
import { bounds } from "../geom/polygon.ts";
import { draft } from "../pattern/draft.ts";
import { nest, piecesToCut } from "./nest.ts";

const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const bag = draft({ garment: "eco-bag", measures: { width: 36, height: 40, handleLength: 55 }, fabric: "woven" });

test("pieces are unfolded and copied as they will be cut", () => {
  const cut = piecesToCut(bag);
  assert.deepEqual(cut.map((c) => c.id), ["body#1", "handle#1", "handle#2"]);
  const body = bounds(cut[0].outline);
  // Body on the fold at the bottom: opened out it is twice as tall (plus allowances).
  assert.ok(Math.abs(body.maxY - body.minY - (2 * 40 + 2 * 3)) < 0.01, `${body.maxY - body.minY}`);
});

test("everything fits on a big enough piece of fabric, along the grain, without overlap", () => {
  const r = nest(piecesToCut(bag), [rect(0, 0, 110, 100)]);
  assert.equal(r.unplaced.length, 0);
  for (const p of r.placed) assert.ok(p.rotation === 0 || p.rotation === 180);
  const boxes = r.placed.map((p) => bounds(p.outline));
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    assert.ok(b.minX >= 0 && b.minY >= 0 && b.maxX <= 110 && b.maxY <= 100, JSON.stringify(b));
    for (let j = i + 1; j < boxes.length; j++) {
      const c = boxes[j];
      assert.ok(b.maxX <= c.minX || c.maxX <= b.minX || b.maxY <= c.minY || c.maxY <= b.minY, "pieces overlap");
    }
  }
});

test("too little fabric says what didn't fit and how much room is left", () => {
  const r = nest(piecesToCut(bag), [rect(0, 0, 50, 60), rect(60, 0, 30, 70)]);
  assert.ok(r.unplaced.some((u) => u.piece.id === "body#1"));
  const body = r.unplaced.find((u) => u.piece.id === "body#1")!;
  assert.ok(body.largestFree[0] > 0 && body.largestFree[1] > 0);
  assert.ok(r.placed.some((p) => p.piece.id.startsWith("handle")), "the handles still fit on the narrow scrap");
});
