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
import { measureApron, measureBag, measureRect, measureSkirt } from "../measure/simple.ts";
import { measureTop, type TopOptions } from "../measure/top.ts";
import { cachedLayoutCheck, layoutCheck, usableSleeves, WRINKLE_REL, type LayoutCheck } from "./layout-check.ts";
import { draft } from "../pattern/draft.ts";
import { L, type Local } from "../i18n/lang.ts";
import { MEASURE_NAME, type MeasuresOf } from "../pattern/measures.ts";
import { NO_GARMENT } from "../measure/shape.ts";
import { isTop, type Fabric, type GarmentKind, type Pattern } from "../pattern/types.ts";
import { a4Scale, type A4Scale } from "../scale/a4.ts";

export const LONG_SIDE_PX = 2000;

// SAM words per garment. One short noun each; "pants" found trousers where "trousers" found
// nothing (Seated Tailor, 10/31). [A] The rest to be compared on real photos.
export const CONCEPTS: Record<GarmentKind, { garment: string; parts: string[] }> = {
  "t-shirt": { garment: "t-shirt", parts: ["sleeve", "hood"] },
  "long-sleeve": { garment: "shirt", parts: ["sleeve"] },
  sweatshirt: { garment: "sweatshirt", parts: ["sleeve"] },
  dress: { garment: "dress", parts: ["sleeve"] },
  shirt: { garment: "shirt", parts: ["sleeve", "hood"] },
  // "jacket" found nothing on the owner's zip hoodie; "hoodie" found it (0.92, 0.73).
  hoodie: { garment: "hoodie", parts: ["sleeve", "hood"] },
  pants: { garment: "pants", parts: [] },
  skirt: { garment: "skirt", parts: [] },
  "a-line-skirt": { garment: "skirt", parts: [] },
  "eco-bag": { garment: "bag", parts: ["handle"] },
  apron: { garment: "apron", parts: [] },
  cushion: { garment: "cushion", parts: [] },
  pouch: { garment: "pouch", parts: [] },
};
export const PAPER = "paper";
const SPARK_CHECK_USD = 0.01; // one layout check, a 1024 px image and a short answer
// A photo not analysed yet, when analysis isn't allowed (the routes then check the visitor's limits).
export const NEEDS_ANALYSIS = L("이 사진은 아직 분석하지 않았습니다.", "This photo hasn't been analysed yet.", "Esta foto aún no se ha analizado.");
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
  // Shoulder points tapped on the photo, as fractions of its width and height (0–1).
  shoulders?: Pt[];
}

export type PhotoRun =
  | { ok: false; stage: "cost" | "segment" | "scale" | "measure" | "draft"; detail: Local; pendingConcepts?: string[]; usd?: number; missingA4?: boolean }
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
    return { ok: false, stage: "cost", detail: NEEDS_ANALYSIS, pendingConcepts: pending, usd: pending.length * SAM_IMAGE_USD + SPARK_CHECK_USD };
  }

  const image = { bytes: photo.bytes, mime: "image/jpeg" as const };
  const results = await Promise.all(all.map((c) => segmentImageConcept(image, c, cacheDir)));
  const masksOfWord = (word: string) => {
    const i = all.indexOf(word);
    return i < 0 ? [] : imageMasks(results[i]).filter((m) => (m.confidence ?? 1) >= 0.5);
  };
  const toGrid = (ms: ReturnType<typeof masksOfWord>): Grid =>
    ms.length ? unionAll(ms.map((m) => rasterize(m, photo.width, photo.height)), photo.width, photo.height) : emptyGrid(photo.width, photo.height);
  if (masksOfWord(words.garment).length === 0) return { ok: false, stage: "segment", detail: L("사진에서 옷을 찾지 못했습니다. 옷 전체가 보이게, 무늬 없는 바닥에서 다시 찍어 주십시오.", "Couldn't find the garment in the photo. Take it again on a plain floor with the whole garment in view.", "No encontramos la prenda en la foto. Vuelve a hacerla sobre un suelo liso, con la prenda entera a la vista.") };
  const notes: Local[] = [];

  // A hood comes off the body outline (it would hide the neck points); a "sleeve" lying mostly
  // on the hood is the hood.
  const hood = toGrid(masksOfWord("hood"));
  const hasHood = area(hood) > 0;
  const garmentGrid = hasHood ? subtract(toGrid(masksOfWord(words.garment)), dilate(hood, 2)) : toGrid(masksOfWord(words.garment));
  if (hasHood) notes.push(L("모자(후드)는 몸판 윤곽에서 빼고 쟀습니다.", "The hood was left out of the body outline.", "La capucha se dejó fuera del contorno del cuerpo."));
  const sleeveGrids = masksOfWord("sleeve")
    .map((m) => rasterize(m, photo.width, photo.height))
    .filter((g) => {
      const onHood = hasHood ? area(intersect(g, hood)) / Math.max(1, area(g)) : 0;
      if (onHood > 0.3) notes.push(L("소매로 잡힌 부분 하나가 모자 위에 있어 소매에서 뺐습니다.", "One area taken for a sleeve lies on the hood, so it wasn't counted as a sleeve.", "Una zona tomada por manga está sobre la capucha, así que no se contó como manga."));
      return onHood <= 0.3;
    });
  const partGrids = words.parts.includes("handle") ? masksOfWord("handle").map((m) => rasterize(m, photo.width, photo.height)) : sleeveGrids;

  // Second look (Muse Spark): which sleeves are really spread out, and how flat the garment lies.
  let layout = await cachedLayoutCheck(cacheDir, sleeveGrids.length);
  if (!layout && input.allowApi) {
    try {
      layout = await layoutCheck(photo, sleeveGrids.map((g) => simplifyClosed(traceOuter(largestComponent(g)), 2)), cacheDir);
    } catch (e) {
      console.error("layout check skipped", e);
      notes.push(L("소매가 펴졌는지 따로 확인하지 못해 윤곽 모양으로만 판단했습니다.", "Whether the sleeves are spread out was judged from the outline alone.", "Si las mangas están extendidas se juzgó solo por el contorno."));
    }
  }
  const measureOpts = {
    sleeveUsable: layout ? usableSleeves(layout, sleeveGrids.length) : undefined,
    extraRel: layout ? WRINKLE_REL[layout.wrinkles] : 0,
  };
  if (layout?.wrinkles === "some wrinkles") notes.push(L("옷에 주름이 조금 있어 ±를 키웠습니다.", "The garment has a few wrinkles, so the ± was widened.", "La prenda tiene algunas arrugas, así que se amplió el ±."));
  if (layout?.wrinkles === "heavily wrinkled or bunched") notes.push(L("옷이 많이 구겨져 ±를 크게 키웠습니다. 펴서 다시 찍으면 정확해집니다.", "The garment is badly wrinkled, so the ± was widened a lot. Smooth it out and take it again for exact values.", "La prenda está muy arrugada, así que el ± se amplió mucho. Alísala y vuelve a hacer la foto para valores exactos."));
  if (input.shoulders?.length) {
    const n = input.shoulders.length;
    notes.push(L(`어깨점 ${n}개는 사진에서 직접 찍은 점을 썼습니다.`, `${n} shoulder point${n > 1 ? "s were" : " was"} taken from your taps on the photo.`, `${n === 1 ? "Se usó 1 punto" : `Se usaron ${n} puntos`} de hombro marcados por ti en la foto.`));
  }
  if (layout?.hem === "folded or rolled") notes.push(L("밑단이 접혀 있는 것으로 보입니다. 총장이 짧게 나올 수 있습니다.", "The hem looks folded or rolled. The length may come out short.", "El bajo parece doblado o enrollado. El largo puede salir corto."));

  // The sheet: the most confident "paper" that fits as A4.
  const papers = masksOfWord(PAPER).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  let scale: A4Scale | null = null, paperGrid: Grid | null = null;
  let why: Local = L("사진에서 A4 용지를 찾지 못했습니다.", "No A4 sheet found in the photo.", "No encontramos la hoja A4 en la foto.");
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
  const nearEdge = ([x, y]: Pt) => x <= EDGE_PX || y <= EDGE_PX || x >= photo.width - 1 - EDGE_PX || y >= photo.height - 1 - EDGE_PX;
  const optsFor = (sh: Shape): TopOptions => ({
    ...measureOpts,
    hood: hasHood ? partPolygon(hood, sh.plane) : null,
    clipped: (p) => nearEdge(sh.plane.toPx(p)),
    userShoulders: input.shoulders?.map(([u, v]) => sh.plane.toCm([u * photo.width, v * photo.height])),
  });
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
    return { ok: false, stage: "scale", detail: L(`${why.ko} A4를 옆에 두고 다시 찍거나, 줄자로 잰 치수 하나를 입력해 주십시오.`, `${why.en} Take it again with an A4 sheet beside the garment, or enter one measurement taken with a tape.`, `${why.es} Vuelve a hacer la foto con una hoja A4 al lado, o escribe una medida tomada con cinta.`), missingA4: true };
  }

  const parts = partsFor(shape);
  const m0 = measureOf(garment, shape, parts, optsFor(shape));
  if ("ok" in m0) return { ok: false, stage: "measure", detail: m0.detail };

  // A measurement that ends on the photo's edge is of a garment cut off by the frame: refused.
  const toPhoto = (p: Pt) => shape.plane.toPx(applyAffine(invertAffine(m0.frame), p));
  const onEdge = (p: Pt) => nearEdge(toPhoto(p));
  const clipped = new Set(m0.segments.filter((sg) => !sg.mirrored && (onEdge(sg.a) || onEdge(sg.b))).map((sg) => sg.key));
  const kept = Object.fromEntries(Object.entries(m0.values).filter(([k]) => !clipped.has(k)));
  if (clipped.size) {
    const names = (lang: "ko" | "en" | "es") => [...clipped].map((k) => MEASURE_NAME[k]?.[lang] ?? k).join(", ");
    notes.push(
      L(
        `옷이 사진 가장자리에 잘려 다음은 재지 않았습니다: ${names("ko")}. 옷 전체가 사진 안에 들어오게 찍어 주십시오.`,
        `The garment is cut off by the edge of the photo, so these weren't measured: ${names("en")}. Get the whole garment in the photo.`,
        `La prenda queda cortada por el borde de la foto, así que no se midió: ${names("es")}. Haz que la prenda entera entre en la foto.`,
      ),
    );
  }
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

function measureOf(garment: GarmentKind, shape: Shape, parts: Pt[][], opts: TopOptions): Measured | { ok: false; detail: Local } {
  const m = isTop(garment)
    ? measureTop(shape, parts, opts)
    : garment === "pants"
      ? measurePants(shape)
      : garment === "skirt" || garment === "a-line-skirt"
        ? measureSkirt(shape)
        : garment === "apron"
          ? measureApron(shape)
          : garment === "cushion" || garment === "pouch"
            ? measureRect(shape)
            : measureBag(shape, parts);
  return m as Measured | { ok: false; detail: Local };
}

// Without an A4 sheet: measure once at a provisional scale, then set the scale so the reference
// value equals the tape. No perspective correction, so the ± grows (a phone held level over the
// floor still varies by a few % across a garment), plus the tape's own half centimetre.
const TAPE_PERSPECTIVE_REL = 0.04;
const TAPE_CM = 0.5;

function tapeScaled(
  garment: Grid,
  ref: { key: string; cm: number },
  measure: (s: Shape) => Measured | { ok: false; detail: Local },
): Shape | { ok: false; detail: Local } {
  const box = gridBox(garment);
  if (!box) return { ok: false, detail: NO_GARMENT };
  const k0 = Math.max(box[2] - box[0], box[3] - box[1]) / 75; // about the size of a garment
  const first = shapeWithPlainScale(garment, k0, 0);
  if (!first) return { ok: false, detail: NO_GARMENT };
  const m = measure(first);
  if ("ok" in m) return m;
  const v = (m.values as Record<string, { cm: number }>)[ref.key];
  if (!v) return { ok: false, detail: L("기준으로 넣은 치수를 사진에서 재지 못했습니다. 다른 치수를 넣어 주십시오.", "The measurement you entered couldn't be found in the photo. Enter a different one.", "No pudimos encontrar en la foto la medida que escribiste. Escribe otra.") };
  const k = (v.cm * k0) / ref.cm;
  const rel = Math.hypot(TAPE_PERSPECTIVE_REL, TAPE_CM / ref.cm);
  const name = MEASURE_NAME[ref.key] ?? L(ref.key, ref.key, ref.key);
  const shape = shapeWithPlainScale(garment, k, rel, [
    L(
      `A4가 없어 줄자로 잰 ${name.ko} ${ref.cm} cm를 기준으로 비례해 쟀습니다. 원근 보정이 없어 ±가 큽니다.`,
      `With no A4 sheet, everything was scaled from your tape measurement of ${name.en}, ${ref.cm} cm. Without perspective correction the ± is large.`,
      `Sin hoja A4, todo se escaló a partir de tu medida con cinta de ${name.es}, ${ref.cm} cm. Sin corrección de perspectiva el ± es grande.`,
    ),
  ]);
  return shape ?? { ok: false, detail: NO_GARMENT };
}
