// One flat-lay photo, start to finish: prepare it, segment the garment, its parts and the A4
// sheet with SAM 3.1 (each concept cached by the photo's SHA-256, so reruns cost nothing), take
// the scale from the sheet, measure the garment, and draft its pattern. Every failure says why.

import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { emptyGrid, rasterize, unionAll, type Grid } from "../geom/grid.ts";
import type { Pt } from "../geom/point.ts";
import { applyAffine, invertAffine } from "../geom/polygon.ts";
import { cachedImageConcept, imageMasks, SAM_IMAGE_USD, segmentImageConcept } from "../meta/sam-image.ts";
import { measurePants } from "../measure/pants.ts";
import { partPolygon, shapeFromMasks, type Measured } from "../measure/shape.ts";
import { measureBag, measureSkirt } from "../measure/simple.ts";
import { measureTop } from "../measure/top.ts";
import { draft } from "../pattern/draft.ts";
import type { MeasuresOf } from "../pattern/measures.ts";
import type { Fabric, GarmentKind, Pattern } from "../pattern/types.ts";
import { a4Scale, type A4Scale } from "../scale/a4.ts";

export const LONG_SIDE_PX = 2000;

// SAM words per garment. One short noun each; "pants" found trousers where "trousers" found
// nothing (Seated Tailor, 10/31). [A] The rest to be compared on real photos.
export const CONCEPTS: Record<GarmentKind, { garment: string; parts: string[] }> = {
  shirt: { garment: "shirt", parts: ["sleeve"] },
  "t-shirt": { garment: "t-shirt", parts: ["sleeve"] },
  pants: { garment: "pants", parts: [] },
  skirt: { garment: "skirt", parts: [] },
  "eco-bag": { garment: "bag", parts: ["handle"] },
};
export const PAPER = "paper";

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
}

export type PhotoRun =
  | { ok: false; stage: "cost" | "segment" | "scale" | "measure" | "draft"; detail: string; pendingConcepts?: string[]; usd?: number }
  | {
      ok: true;
      garment: GarmentKind;
      concepts: string[];
      scale: Pick<A4Scale, "cornersPx" | "pxPerCm" | "relError" | "aspect" | "fill">;
      measured: Measured;
      // The same outline and segments mapped back onto the photo, for the overlay.
      overlay: { outlinePx: Pt[]; segmentsPx: { key: string; a: Pt; b: Pt; cm: number }[]; partsPx: Pt[][] };
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
    return { ok: false, stage: "cost", detail: `SAM would run ${pending.length} concept(s)`, pendingConcepts: pending, usd: pending.length * SAM_IMAGE_USD };
  }

  const image = { bytes: photo.bytes, mime: "image/jpeg" as const };
  const results = await Promise.all(all.map((c) => segmentImageConcept(image, c, cacheDir)));
  const masksOf = (i: number) => imageMasks(results[i]).filter((m) => (m.confidence ?? 1) >= 0.5);
  const gridOf = (i: number): Grid => {
    const ms = masksOf(i);
    return ms.length ? unionAll(ms.map((m) => rasterize(m, photo.width, photo.height)), photo.width, photo.height) : emptyGrid(photo.width, photo.height);
  };
  if (masksOf(0).length === 0) return { ok: false, stage: "segment", detail: `SAM 3.1이 사진에서 "${words.garment}"를 찾지 못했습니다.` };
  if (masksOf(1).length === 0) return { ok: false, stage: "segment", detail: "SAM 3.1이 사진에서 A4 용지를 찾지 못했습니다." };

  // The sheet: the most confident "paper" that fits as A4.
  const papers = masksOf(1).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  let scale: A4Scale | null = null, paperGrid: Grid | null = null, why = "";
  for (const p of papers) {
    const g = rasterize(p, photo.width, photo.height);
    const s = a4Scale(g);
    if (s.ok) {
      [scale, paperGrid] = [s, g];
      break;
    }
    why ||= s.detail;
  }
  if (!scale || !paperGrid) return { ok: false, stage: "scale", detail: why };

  const shape = shapeFromMasks(gridOf(0), paperGrid, scale);
  if ("ok" in shape) return { ok: false, stage: "scale", detail: shape.detail };
  // Each part object on its own (two sleeves are two masks).
  const parts = words.parts.flatMap((_, k) => masksOf(2 + k).map((m) => partPolygon(rasterize(m, photo.width, photo.height), shape.plane)));

  const measured =
    garment === "shirt" || garment === "t-shirt"
      ? measureTop(shape, parts)
      : garment === "pants"
        ? measurePants(shape)
        : garment === "skirt"
          ? measureSkirt(shape)
          : measureBag(shape, parts);
  if ("ok" in measured) return { ok: false, stage: "measure", detail: measured.detail };

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
    scale: { cornersPx: scale.cornersPx, pxPerCm: scale.pxPerCm, relError: scale.relError, aspect: scale.aspect, fill: scale.fill },
    measured: measured as Measured,
    overlay,
    pattern,
    draftError,
  };
}
