// One flat-lay photo, start to finish: prepare it, segment the garment, its parts and the A4
// sheet with SAM 3.1 (each concept cached by the photo's SHA-256, so reruns cost nothing), take
// the scale from the sheet, measure the garment, and draft its pattern. Every failure says why.

import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { area, dilate, emptyGrid, gridBox, intersect, largestComponent, rasterize, subtract, traceOuter, unionAll, type Grid } from "../geom/grid.ts";
import type { Pt } from "../geom/point.ts";
import { applyAffine, invertAffine, simplifyClosed } from "../geom/polygon.ts";
import { cachedImageConcept, imageMasks, SAM_IMAGE_USD, segmentImageConcept } from "../meta/sam-image.ts";
import { measurePants } from "../measure/pants.ts";
import { partPolygon, shapeFromMasks, shapeWithPlainScale, type Measured, type Shape } from "../measure/shape.ts";
import { measureBag, measureSkirt } from "../measure/simple.ts";
import { measureTop, type TopOptions } from "../measure/top.ts";
import { cachedLayoutCheck, layoutCheck, usableSleeves, WRINKLE_REL, type LayoutCheck } from "./layout-check.ts";
import { draft } from "../pattern/draft.ts";
import { MEASURE_KO, type MeasuresOf } from "../pattern/measures.ts";
import type { Fabric, GarmentKind, Pattern } from "../pattern/types.ts";
import { a4Scale, type A4Scale } from "../scale/a4.ts";

export const LONG_SIDE_PX = 2000;

// SAM words per garment. One short noun each; "pants" found trousers where "trousers" found
// nothing (Seated Tailor, 10/31). [A] The rest to be compared on real photos.
export const CONCEPTS: Record<GarmentKind, { garment: string; parts: string[] }> = {
  shirt: { garment: "shirt", parts: ["sleeve", "hood"] },
  "t-shirt": { garment: "t-shirt", parts: ["sleeve", "hood"] },
  // "jacket" found nothing on the owner's zip hoodie; "hoodie" found it (0.92, 0.73).
  hoodie: { garment: "hoodie", parts: ["sleeve", "hood"] },
  pants: { garment: "pants", parts: [] },
  skirt: { garment: "skirt", parts: [] },
  "eco-bag": { garment: "bag", parts: ["handle"] },
};
export const PAPER = "paper";
const SPARK_CHECK_USD = 0.01; // one layout check, a 1024 px image and a short answer
const EDGE_PX = 4;

export interface Prepared {
  bytes: Buffer; // JPEG, upright, metadata stripped
  width: number;
  height: number;
  sha256: string;
}

export async function preparePhoto(input: Buffer): Promise<Prepared> {
  const { data, info } = await sharp(input)
    .rotate() // apply EXIF orientation, then drop all metadata
    .resize({ width: LONG_SIDE_PX, height: LONG_SIDE_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height, sha256: createHash("sha256").update(data).digest("hex") };
}

export interface PhotoRunInput {
  photo: Prepared;
  garment: GarmentKind;
  fabric: Fabric;
  cacheRoot: string;
  allowApi: boolean;
  garmentConcept?: string; // override the SAM word ("shorts", "top")
  // No A4 in the photo: one value measured with a tape (e.g. chest 54 cm) sets the scale instead.
  reference?: { key: string; cm: number };
}

export type PhotoRun =
  | { ok: false; stage: "cost" | "segment" | "scale" | "measure" | "draft"; detail: string; pendingConcepts?: string[]; usd?: number }
  | {
      ok: true;
      garment: GarmentKind;
      concepts: string[];
      scale: Pick<A4Scale, "cornersPx" | "pxPerCm" | "relError" | "aspect" | "fill"> & { source: "a4" | "tape" };
      measured: Measured;
      // The same outline and segments mapped back onto the photo, for the overlay.
      overlay: { outlinePx: Pt[]; segmentsPx: { key: string; a: Pt; b: Pt; cm: number }[]; partsPx: Pt[][] };
      layout?: LayoutCheck;
      pattern?: Pattern;
      draftError?: string;
    };

export async function runPhoto(input: PhotoRunInput): Promise<PhotoRun> {
  const { photo, garment } = input;
  const words = { ...CONCEPTS[garment], ...(input.garmentConcept && { garment: input.garmentConcept }) };
  const all = [words.garment, PAPER, ...words.parts];
  const cacheDir = path.join(input.cacheRoot, photo.sha256.slice(0, 16));

  const pending: string[] = [];
  for (const c of all) if (!(await cachedImageConcept(cacheDir, c))) pending.push(c);
  if (pending.length && !input.allowApi) {
    return { ok: false, stage: "cost", detail: `SAM would run ${pending.length} concept(s)`, pendingConcepts: pending, usd: pending.length * SAM_IMAGE_USD + SPARK_CHECK_USD };
  }

  const image = { bytes: photo.bytes, mime: "image/jpeg" as const };
  const results = await Promise.all(all.map((c) => segmentImageConcept(image, c, cacheDir)));
  const masksOfWord = (word: string) => {
    const i = all.indexOf(word);
    return i < 0 ? [] : imageMasks(results[i]).filter((m) => (m.confidence ?? 1) >= 0.5);
  };
  const toGrid = (ms: ReturnType<typeof masksOfWord>): Grid =>
    ms.length ? unionAll(ms.map((m) => rasterize(m, photo.width, photo.height)), photo.width, photo.height) : emptyGrid(photo.width, photo.height);
  if (masksOfWord(words.garment).length === 0) return { ok: false, stage: "segment", detail: `SAM 3.1이 사진에서 "${words.garment}"를 찾지 못했습니다.` };
  const notes: string[] = [];

  // A hood comes off the body outline (it would hide the neck points); a "sleeve" lying mostly
  // on the hood is the hood.
  const hood = toGrid(masksOfWord("hood"));
  const hasHood = area(hood) > 0;
  const garmentGrid = hasHood ? subtract(toGrid(masksOfWord(words.garment)), dilate(hood, 2)) : toGrid(masksOfWord(words.garment));
  if (hasHood) notes.push("모자(후드)는 몸판 윤곽에서 빼고 쟀습니다.");
  const sleeveGrids = masksOfWord("sleeve")
    .map((m) => rasterize(m, photo.width, photo.height))
    .filter((g) => {
      const onHood = hasHood ? area(intersect(g, hood)) / Math.max(1, area(g)) : 0;
      if (onHood > 0.3) notes.push("SAM 3.1이 소매로 표시한 영역 하나가 모자 위에 있어 소매에서 뺐습니다.");
      return onHood <= 0.3;
    });
  const partGrids = words.parts.includes("handle") ? masksOfWord("handle").map((m) => rasterize(m, photo.width, photo.height)) : sleeveGrids;

  // Second look (Muse Spark): which sleeves are really spread out, and how flat the garment lies.
  let layout = await cachedLayoutCheck(cacheDir, sleeveGrids.length);
  if (!layout && input.allowApi) {
    try {
      layout = await layoutCheck(photo, sleeveGrids.map((g) => simplifyClosed(traceOuter(largestComponent(g)), 2)), cacheDir);
    } catch (e) {
      notes.push(`Muse Spark 확인을 건너뛰었습니다(${(e as Error).message.slice(0, 60)}). 소매 접힘은 기하로만 판단했습니다.`);
    }
  }
  const measureOpts = {
    sleeveUsable: layout ? usableSleeves(layout, sleeveGrids.length) : undefined,
    extraRel: layout ? WRINKLE_REL[layout.wrinkles] : 0,
  };
  if (layout?.wrinkles === "some wrinkles") notes.push("Muse Spark가 옷에 주름이 조금 있다고 보아 ±를 키웠습니다.");
  if (layout?.wrinkles === "heavily wrinkled or bunched") notes.push("Muse Spark가 옷이 많이 구겨졌다고 보아 ±를 크게 키웠습니다. 펴서 다시 찍으면 정확해집니다.");
  if (layout?.hem === "folded or rolled") notes.push("Muse Spark가 밑단이 접혀 있다고 보았습니다. 총장이 짧게 나올 수 있습니다.");

  // The sheet: the most confident "paper" that fits as A4.
  const papers = masksOfWord(PAPER).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  let scale: A4Scale | null = null, paperGrid: Grid | null = null;
  let why = "사진에서 A4 용지를 찾지 못했습니다.";
  for (const p of papers) {
    const g = rasterize(p, photo.width, photo.height);
    const s = a4Scale(g);
    if (s.ok) {
      [scale, paperGrid] = [s, g];
      break;
    }
    why = s.detail;
  }

  const partsFor = (sh: Shape) => partGrids.map((g) => partPolygon(g, sh.plane));
  const optsFor = (sh: Shape): TopOptions => ({ ...measureOpts, hood: hasHood ? partPolygon(hood, sh.plane) : null });
  let shape: Shape;
  if (scale && paperGrid) {
    const s = shapeFromMasks(garmentGrid, paperGrid, scale);
    if ("ok" in s) return { ok: false, stage: "scale", detail: s.detail };
    shape = s;
  } else if (input.reference) {
    const s = tapeScaled(garmentGrid, input.reference, (sh) => measureOf(garment, sh, partsFor(sh), optsFor(sh)));
    if ("ok" in s) return { ok: false, stage: "scale", detail: s.detail };
    shape = s;
  } else {
    return { ok: false, stage: "scale", detail: `${why} A4를 옆에 두고 다시 찍거나, 줄자로 잰 치수 하나를 입력해 주십시오.` };
  }

  const parts = partsFor(shape);
  const m0 = measureOf(garment, shape, parts, optsFor(shape));
  if ("ok" in m0) return { ok: false, stage: "measure", detail: m0.detail };

  // A measurement that ends on the photo's edge is of a garment cut off by the frame: refused.
  const toPhoto = (p: Pt) => shape.plane.toPx(applyAffine(invertAffine(m0.frame), p));
  const onEdge = (p: Pt) => {
    const [x, y] = toPhoto(p);
    return x <= EDGE_PX || y <= EDGE_PX || x >= photo.width - 1 - EDGE_PX || y >= photo.height - 1 - EDGE_PX;
  };
  const clipped = new Set(m0.segments.filter((sg) => !sg.mirrored && (onEdge(sg.a) || onEdge(sg.b))).map((sg) => sg.key));
  const kept = Object.fromEntries(Object.entries(m0.values).filter(([k]) => !clipped.has(k)));
  if (clipped.size) notes.push(`옷이 사진 가장자리에 잘려 다음은 재지 않았습니다: ${[...clipped].map((k) => MEASURE_KO[k] ?? k).join(", ")}. 옷 전체가 사진 안에 들어오게 찍어 주십시오.`);
  const measured = { ...m0, values: kept, segments: m0.segments.filter((sg) => !clipped.has(sg.key)), notes: [...m0.notes, ...notes] };

  const back = invertAffine(measured.frame);
  const toPx = (p: Pt) => shape.plane.toPx(applyAffine(back, p));
  const overlay = {
    outlinePx: measured.outline.map(toPx),
    segmentsPx: measured.segments.flatMap((s) => {
      const v = (measured.values as Record<string, { cm: number }>)[s.key];
      return v ? [{ key: s.key, a: toPx(s.a), b: toPx(s.b), cm: v.cm }] : [];
    }),
    partsPx: parts.map((p) => p.map(shape.plane.toPx)),
  };

  const values = Object.fromEntries(Object.entries(measured.values).map(([k, v]) => [k, (v as { cm: number }).cm]));
  let pattern: Pattern | undefined, draftError: string | undefined;
  try {
    pattern = draft({ garment, measures: values as Partial<MeasuresOf[GarmentKind]>, fabric: input.fabric });
  } catch (e) {
    draftError = (e as Error).message;
  }
  return {
    ok: true,
    garment,
    concepts: all,
    scale: scale
      ? { cornersPx: scale.cornersPx, pxPerCm: scale.pxPerCm, relError: scale.relError, aspect: scale.aspect, fill: scale.fill, source: "a4" }
      : { cornersPx: [[0, 0], [0, 0], [0, 0], [0, 0]], pxPerCm: shape.pxPerCm, relError: shape.plane.rel, aspect: 0, fill: 0, source: "tape" },
    measured: measured as Measured,
    layout: layout ?? undefined,
    overlay,
    pattern,
    draftError,
  };
}

function measureOf(garment: GarmentKind, shape: Shape, parts: Pt[][], opts: TopOptions): Measured | { ok: false; detail: string } {
  const m =
    garment === "shirt" || garment === "t-shirt" || garment === "hoodie"
      ? measureTop(shape, parts, opts)
      : garment === "pants"
        ? measurePants(shape)
        : garment === "skirt"
          ? measureSkirt(shape)
          : measureBag(shape, parts);
  return m as Measured | { ok: false; detail: string };
}

// Without an A4 sheet: measure once at a provisional scale, then set the scale so the reference
// value equals the tape. No perspective correction, so the ± grows (a phone held level over the
// floor still varies by a few % across a garment), plus the tape's own half centimetre.
const TAPE_PERSPECTIVE_REL = 0.04;
const TAPE_CM = 0.5;

function tapeScaled(
  garment: Grid,
  ref: { key: string; cm: number },
  measure: (s: Shape) => Measured | { ok: false; detail: string },
): Shape | { ok: false; detail: string } {
  const box = gridBox(garment);
  if (!box) return { ok: false, detail: "옷을 찾지 못했습니다." };
  const k0 = Math.max(box[2] - box[0], box[3] - box[1]) / 75; // about the size of a garment
  const first = shapeWithPlainScale(garment, k0, 0);
  if (!first) return { ok: false, detail: "옷을 찾지 못했습니다." };
  const m = measure(first);
  if ("ok" in m) return m;
  const v = (m.values as Record<string, { cm: number }>)[ref.key];
  if (!v) return { ok: false, detail: `기준으로 입력한 치수(${ref.key})를 사진에서 재지 못했습니다. 다른 치수를 기준으로 넣어 주십시오.` };
  const k = (v.cm * k0) / ref.cm;
  const rel = Math.hypot(TAPE_PERSPECTIVE_REL, TAPE_CM / ref.cm);
  const shape = shapeWithPlainScale(garment, k, rel, [`A4가 없어 줄자로 잰 ${ref.key} ${ref.cm} cm를 기준으로 비례해 쟀습니다. 원근 보정이 없어 ±가 큽니다.`]);
  return shape ?? { ok: false, detail: "옷을 찾지 못했습니다." };
}
