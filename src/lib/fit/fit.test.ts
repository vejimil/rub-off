import assert from "node:assert/strict";
import { test } from "node:test";
import { numbersIn } from "../rules/numbers.ts";
import { compare, COMPLAINTS, fromBody, fromComplaint, guarded, jo, patternDelta } from "./alter.ts";
import { targetsFromBody } from "./body.ts";
import { parse } from "./read-complaint.ts";

const TEE = { length: 70, chest: 54, shoulder: 47, hem: 53, sleeve: 21, sleeveOpening: 17, bicep: 20, armholeDepth: 23 };

test("body measurements become flat garment sizes with the fit's ease", () => {
  const t = targetsFromBody("t-shirt", { chestGirth: 92, shoulderWidth: 44 }, "regular", "knit");
  const chest = t.find((x) => x.key === "chest")!;
  assert.equal(chest.cm, 51); // (92 + 10) / 2
  assert.equal(t.find((x) => x.key === "shoulder")!.cm, 45);
  assert.ok(!t.some((x) => x.key === "sleeve"), "a T-shirt's sleeve length is a style, not the arm");
  // Every number in the working is one it computed.
  assert.deepEqual(numbersIn(chest.howKo), [92, 10, 102, 51]);
});

test("a garment bigger than the body wants is taken in at the side seams, by the difference", () => {
  const t = targetsFromBody("t-shirt", { chestGirth: 92, shoulderWidth: 46 }, "regular", "knit");
  const c = compare(t, TEE, "knit");
  const chest = c.find((x) => x.key === "chest")!;
  assert.equal(chest.verdict, "big");
  assert.equal(chest.diff, -3);
  assert.equal(c.find((x) => x.key === "shoulder")!.verdict, "fits"); // 47 vs 47
  const alts = fromBody("t-shirt", c);
  const a = alts.find((x) => x.id === "body-chest")!;
  assert.match(a.instructionKo, /단면 3 cm \(둘레 6 cm\).*각각 1\.5 cm/);
  assert.deepEqual(a.delta, { chest: -3 });
  assert.equal(guarded(a).instructionKo, a.instructionKo);
});

test("letting out is limited to what a seam allowance can give", () => {
  const t = targetsFromBody("t-shirt", { chestGirth: 104 }, "regular", "knit"); // wants 57
  const a = fromBody("t-shirt", compare(t, TEE, "knit")).find((x) => x.id === "body-chest")!;
  assert.equal(a.difficulty, "hard");
  assert.match(a.actionKo, /덧천/);
});

test("a gathered skirt only has to pass over the hips", () => {
  const t = targetsFromBody("skirt", { hipGirth: 96 }, "regular", "woven");
  assert.equal(compare(t, { length: 60, hem: 70 }, "woven")[0].verdict, "fits");
  assert.equal(compare(t, { length: 60, hem: 48 }, "woven")[0].verdict, "small");
});

test("seated complaints follow the research: back rise default, cast opening with its margin", () => {
  const back = fromComplaint("pants", { id: "seat-back-drops" });
  assert.equal(back.amountCm, 5);
  assert.deepEqual(back.delta, { backRiseExtra: 5 });
  const measured = fromComplaint("pants", { id: "seat-back-drops", amountCm: 7 });
  assert.match(measured.instructionKo, /7 cm 늘립니다/);
  const cast = fromComplaint("pants", { id: "cast-leg", amountCm: 24, side: "left" });
  assert.match(cast.instructionKo, /왼쪽 바지 옆선을 밑단에서 위로 29 cm/);
  assert.equal(cast.reversible, true);
  for (const c of COMPLAINTS) {
    for (const g of c.garments) {
      const a = fromComplaint(g, { id: c.id, amountCm: c.askKo ? 3 : undefined });
      assert.equal(guarded(a).instructionKo, a.instructionKo, `${c.id} on ${g}: ${a.instructionKo}`);
    }
  }
});

test("Spark's sorting keeps only lengths the wearer wrote and quotes that are their words", () => {
  const text = "휠체어에 앉으면 바지 뒤가 내려가요. 밑단도 3 cm쯤 짧아져요.";
  const got = parse(
    {
      items: [
        { complaint: "seat-back-drops", side: "none", amount: "4", quote: "휠체어에 앉으면 바지 뒤가 내려가요" }, // 4 is not in the text
        { complaint: "seat-hem-short", side: "both", amount: "3", quote: "밑단도 3 cm쯤 짧아져요" },
        { complaint: "elbows-wear", side: "none", amount: null, quote: "made up" }, // not a pants complaint, not their words
      ],
    },
    text,
    "pants",
  );
  assert.equal(got[0].amountCm, undefined);
  assert.equal(got[1].amountCm, 3);
  assert.equal(got[2].id, "other");
  assert.equal(got[2].quote, undefined);
  assert.deepEqual(patternDelta(got.map((c) => fromComplaint("pants", c))), { backRiseExtra: 5, outseam: 3 });
});

test("particles follow the last syllable", () => {
  assert.equal(jo("소매", "을"), "소매를");
  assert.equal(jo("밑단", "을"), "밑단을");
  assert.equal(jo("소매길이", "이"), "소매길이가");
});

test("the flat marks each alteration once, on the side the wearer named, in its own view", async () => {
  const { flatFor } = await import("./flat.ts");
  const order = [
    fromComplaint("pants", { id: "seat-back-drops" }),
    fromComplaint("pants", { id: "cast-leg", side: "left", amountCm: 24 }),
    fromComplaint("pants", { id: "seat-hem-short", amountCm: 3 }),
  ];
  const views = flatFor("pants", { waist: 34, hip: 52, frontRise: 28, outseam: 98, thigh: 31, legOpening: 20 }, "woven", order)!;
  const [front, back] = views;
  assert.deepEqual(back.tags.map((t) => t.n), [1]);
  assert.deepEqual(front.tags.map((t) => t.n).sort(), [2, 3]);
  // The wearer's left leg is on the viewer's right from the front.
  const cast = front.tags.find((t) => t.n === 2)!;
  assert.ok(cast.anchors.every(([x]) => x > 0));
  assert.equal(cast.text, "트임 29 cm");
  // Added fabric above the back waist is as tall as the amount.
  const top = Math.min(...back.add.flat().map(([, y]) => y));
  assert.ok(Math.abs(top + 5) < 1e-9, String(top));
  assert.ok(flatFor("eco-bag", { width: 40, height: 40, handleLength: 60 }, "woven", []) === null);
});
