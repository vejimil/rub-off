// Measurements in, pattern out. The one entry point for every garment, so grading (which changes
// measurements) and the photo pipeline (which produces them) share it.

import { draftBag, draftPants, draftSkirt } from "./garments/lower.ts";
import { draftTop } from "./garments/top.ts";
import { MEASURE_EN, withDefaults, type MeasuresOf } from "./measures.ts";
import type { Fabric, GarmentKind, Pattern } from "./types.ts";

export interface DraftInput<K extends GarmentKind = GarmentKind> {
  garment: K;
  measures: Partial<MeasuresOf[K]>;
  fabric: Fabric;
  sizeLabel?: string;
  elasticCm?: number;
}

export function draft<K extends GarmentKind>(input: DraftInput<K>): Pattern {
  const { measures, unmeasured } = withDefaults(input.garment, input.measures);
  const g = input.garment as GarmentKind;
  const values = measures as unknown as Record<string, number>;
  const missing = REQUIRED[g].filter((k) => !(Number.isFinite(values[k]) && values[k] > 0));
  if (missing.length) throw new Error(`Missing measurements: ${missing.join(", ")}`);
  const out =
    g === "shirt" || g === "t-shirt" || g === "hoodie"
      ? draftTop(g, measures as MeasuresOf["hoodie"], input.fabric, unmeasured)
      : g === "pants"
        ? draftPants(measures as MeasuresOf["pants"], unmeasured, input.elasticCm)
        : g === "skirt"
          ? draftSkirt(measures as MeasuresOf["skirt"], input.elasticCm)
          : draftBag(measures as MeasuresOf["eco-bag"]);
  const notes = [...out.notes];
  if (unmeasured.length) notes.push(`Not measured, set from typical values: ${unmeasured.map((k) => MEASURE_EN[k] ?? k).join(", ")}. Measure before cutting.`);
  return { garment: g, sizeLabel: input.sizeLabel ?? "Original", fabric: input.fabric, pieces: out.pieces, notes, measures: { ...values }, unmeasured };
}

// What each garment needs measured (the rest have defaults).
export const REQUIRED: Record<GarmentKind, string[]> = {
  shirt: ["length", "chest", "shoulder", "hem", "sleeve", "sleeveOpening", "bicep", "armholeDepth"],
  "t-shirt": ["length", "chest", "shoulder", "hem", "sleeve", "sleeveOpening", "bicep", "armholeDepth"],
  hoodie: ["length", "chest", "shoulder", "hem", "sleeve", "sleeveOpening", "bicep", "armholeDepth"],
  pants: ["waist", "hip", "frontRise", "outseam", "thigh", "legOpening"],
  skirt: ["length", "hem"],
  "eco-bag": ["width", "height", "handleLength"],
};
