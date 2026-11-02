// Grading: how each flat measurement moves per size step (one size up = +1). Grading the
// measurements and drafting again keeps every piece consistent: the sleeve cap is re-solved to
// the graded armhole, the collar to the graded neckline.
// Increments are flat (단면) values, so a chest +2 is +4 around the body.
// [A] Typical KS/ready-to-wear increments drafted by Claude; the owner writes the real table.

import type { MeasuresOf } from "../pattern/measures.ts";
import type { GarmentKind } from "../pattern/types.ts";

type Increments<K extends GarmentKind> = Partial<Record<keyof MeasuresOf[K], number>>;

const TOP: Increments<"shirt"> = {
  length: 1.5,
  chest: 2,
  shoulder: 1,
  hem: 2,
  sleeve: 1,
  sleeveOpening: 0.5,
  bicep: 0.75,
  neckWidth: 0.5,
  frontNeckDrop: 0.25,
  armholeDepth: 0.75,
};

export const GRADE_STEP: { [K in GarmentKind]: Increments<K> } = {
  "t-shirt": TOP,
  "long-sleeve": TOP,
  sweatshirt: TOP,
  dress: { ...TOP, length: 2 },
  shirt: TOP,
  hoodie: { ...TOP, hoodHeight: 0.5, hoodDepth: 0.5 },
  pants: { waist: 2, hip: 2, frontRise: 0.5, backRiseExtra: 0.25, outseam: 1, thigh: 1, legOpening: 0.5 },
  skirt: { length: 1, hem: 2 },
  "a-line-skirt": { waist: 2, length: 1, hem: 2 },
  "eco-bag": {},
  apron: {},
  cushion: {},
  pouch: {},
};

export const SIZE_LADDER = ["XS", "S", "M", "L", "XL", "XXL"] as const;

export function grade<K extends GarmentKind>(garment: K, measures: Partial<MeasuresOf[K]>, steps: number): Partial<MeasuresOf[K]> {
  const inc = GRADE_STEP[garment] as Record<string, number>;
  const out: Record<string, number> = { ...(measures as Record<string, number>) };
  for (const [k, v] of Object.entries(out)) if (inc[k] !== undefined && Number.isFinite(v)) out[k] = v + steps * inc[k];
  return out as Partial<MeasuresOf[K]>;
}

// The size name `steps` away on the ladder from `from`, or "+1" style when off the ladder.
export function gradedLabel(from: string, steps: number): string {
  const i = SIZE_LADDER.indexOf(from.toUpperCase() as (typeof SIZE_LADDER)[number]);
  const j = i + steps;
  if (i >= 0 && j >= 0 && j < SIZE_LADDER.length) return SIZE_LADDER[j];
  return steps === 0 ? from : `${from} ${steps > 0 ? "+" : ""}${steps}`;
}
