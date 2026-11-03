import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pt } from "../geom/point.ts";
import { draft } from "../pattern/draft.ts";
import { EXAMPLES } from "../pattern/examples.ts";
import { placed, pocketFromPhoto, pocketsFromPhotos, withPockets } from "../pattern/pockets.ts";
import type { GarmentKind } from "../pattern/types.ts";
import type { PocketCheck } from "../photo/pocket-check.ts";
import { pocketsFromMasks } from "./pockets.ts";

// The top's frame: hem middle at the origin, y down; this top's shoulder high point is 70 cm up.
const AT = { centreX: 0, neckY: -70, side: "front" as const, rel: 0.02 };
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const ex = (g: GarmentKind) => draft({ garment: g, measures: EXAMPLES[g].m, fabric: EXAMPLES[g].fabric });

test("a patch pocket in view: its size and place from the mask, across from the centre and down from the shoulder", () => {
  const check: PocketCheck = { pockets: [{ number: 1, kind: "patch pocket with square corners", view: "whole pocket in view" }] };
  const { pockets } = pocketsFromMasks([rect(5, -50, 17, -36)], check, AT);
  assert.equal(pockets.length, 1);
  const [p] = pockets;
  assert.equal(p.kind, "patch");
  assert.deepEqual([p.fromCentre, p.belowNeck, p.width, p.height], [11, 20, 12, 14]);
  assert.ok(p.plusMinusCm > 0.5 && p.plusMinusCm < 1.5);
});

test("a kangaroo split by a zip, one half covered: twice the reach of the half in view", () => {
  const check: PocketCheck = {
    pockets: [
      { number: 1, kind: "half of a kangaroo pocket split by a zip", view: "partly covered or folded" },
      { number: 2, kind: "half of a kangaroo pocket split by a zip", view: "whole pocket in view" },
    ],
  };
  const { pockets } = pocketsFromMasks([rect(-12, -22, -1, -5), rect(1, -25, 18, -5)], check, AT);
  assert.equal(pockets.length, 1);
  assert.deepEqual([pockets[0].kind, pockets[0].width, pockets[0].height, pockets[0].belowNeck], ["kangaroo", 36, 20, 45]);
  assert.deepEqual(pockets[0].regions, [1]);
});

test("a seam pocket, a print and a covered patch pocket are left out, each said", () => {
  const check: PocketCheck = {
    pockets: [
      { number: 1, kind: "set into a seam, or a welt pocket", view: "whole pocket in view" },
      { number: 2, kind: "not a pocket", view: "whole pocket in view" },
      { number: 3, kind: "patch pocket with rounded bottom corners", view: "partly covered or folded" },
    ],
  };
  const { pockets, notes } = pocketsFromMasks([rect(20, -30, 22, -10), rect(-10, -60, 10, -40), rect(5, -50, 17, -36)], check, AT);
  assert.equal(pockets.length, 0);
  assert.equal(notes.length, 2);
});

test("a measured pocket lands on the drafted front where it was, and a hoodie's kangaroo is cut as two halves", () => {
  const tee = ex("t-shirt");
  const p = pocketFromPhoto(tee, { kind: "patch", host: "front", fromCentre: 12, belowNeck: 18, width: 11, height: 12.5 }, "p1")!;
  assert.ok(p);
  const host = tee.pieces.find((h) => h.id === "front")!;
  const [a, b] = placed(host, p).outline;
  assert.ok(Math.abs((a[0] + b[0]) / 2 - 12) < 1e-6 && Math.abs(a[1] - 18) < 1e-6);
  assert.deepEqual([p.width, p.height], [11, 12.5]);

  const hoodie = ex("hoodie");
  const k = pocketFromPhoto(hoodie, { kind: "kangaroo", host: "front", fromCentre: 0, belowNeck: 45, width: 36, height: 20 }, "k")!;
  assert.ok(k, "kangaroo on a zip front");
  const piece = withPockets(hoodie, [k]).pieces.at(-1)!;
  assert.deepEqual(piece.cut, { count: 2, onFold: false, mirror: true });
  assert.ok(!piece.edges.some((e) => e.kind === "fold"));

  // Its bottom read right on the rib seam: moved up a little rather than dropped.
  const low = pocketFromPhoto(hoodie, { kind: "kangaroo", host: "front", fromCentre: 0, belowNeck: 44, width: 30, height: 20 }, "k2");
  assert.ok(low);
});

test("a photo pocket that has to move or shrink to fit says so, one that can't fit is counted, and one seen twice is one", () => {
  const hoodie = ex("hoodie");
  const seen = { kind: "kangaroo" as const, host: "front", fromCentre: 0, belowNeck: 44, width: 30, height: 20, plusMinusCm: 2.1, placePlusMinusCm: 1.4 };
  const { pockets, left } = pocketsFromPhotos(hoodie, [seen, { ...seen, belowNeck: 45, plusMinusCm: 3 }, { ...seen, kind: "patch", fromCentre: 12, belowNeck: 200, width: 12, height: 14 }]);
  assert.equal(pockets.length, 1, "the same kangaroo on two photos is one pocket");
  assert.equal(left, 1, "a pocket below the hem can't be placed");
  const p = pockets[0];
  assert.ok(p.photo && (p.photo.up > 0 || p.photo.scale < 1), "moved up or made smaller to clear the rib");
  assert.equal(p.photo!.plusMinusCm, 2.1, "the surer of the two is kept");
  const notes = withPockets(hoodie, pockets, left).notes.map((n) => n.en).join("\n");
  assert.ok(/±2\.1 cm/.test(notes) && /before cutting/.test(notes), notes);
  assert.ok(p.photo!.up ? new RegExp(`moved up ${p.photo!.up} cm`).test(notes) : /smaller/.test(notes), notes);
  assert.ok(/1 pocket found on the photo didn't fit/.test(notes), notes);
});

test("the pocket's ± counts the centre line twice in a kangaroo's width, and the two neck points in its place", () => {
  const check: PocketCheck = { pockets: [{ number: 1, kind: "kangaroo pocket across the centre front", view: "whole pocket in view" }] };
  const { pockets } = pocketsFromMasks([rect(-15, -25, 15, -5)], check, { ...AT, neckSpread: 3.8 });
  assert.ok(pockets[0].plusMinusCm >= 2.5, `size ± ${pockets[0].plusMinusCm}`);
  assert.ok(pockets[0].placePlusMinusCm >= 3.8, `place ± ${pockets[0].placePlusMinusCm}`);
});
