// Flat measurements per garment, in cm, the way a shop's 실측표 gives them: widths are across the
// garment lying flat (단면), lengths along it. These are what the photo measures and what a pattern
// is drafted from, so grading and the size decision work on the same numbers.
// A value missing from a measured garment is filled from DEFAULTS and listed as unmeasured.

import type { GarmentKind } from "./types.ts";

export interface TopMeasures {
  length: number; // high point of shoulder to hem
  chest: number; // armpit to armpit, flat
  shoulder: number; // shoulder point to shoulder point
  hem: number; // flat hem width
  sleeve: number; // shoulder point to cuff, along the top of the sleeve
  sleeveOpening: number; // flat cuff width
  bicep: number; // flat sleeve width at the armpit
  neckWidth: number; // side neck point to side neck point
  frontNeckDrop: number;
  backNeckDrop: number;
  armholeDepth: number; // high point of shoulder straight down to the armpit level
  shoulderDrop: number; // high point of shoulder straight down to the shoulder point level
}

export interface PantsMeasures {
  waist: number; // relaxed, flat (an elastic waist gathers; the pattern waist follows the hip)
  hip: number; // flat, across the widest part at crotch level
  frontRise: number; // waist to crotch
  backRiseExtra: number; // how much higher the centre back sits than the centre front
  outseam: number; // waist to hem along the side
  thigh: number; // flat, one leg just below the crotch
  legOpening: number; // flat, one leg
}

export interface SkirtMeasures {
  length: number; // waist to hem
  hem: number; // flat hem width
}

export interface BagMeasures {
  width: number;
  height: number; // bottom to opening
  handleLength: number; // finished, between the two ends sewn into the bag
  handleWidth: number; // finished
  gusset: number; // box-corner depth; 0 for a flat bag
}

export interface MeasuresOf {
  shirt: TopMeasures;
  "t-shirt": TopMeasures;
  pants: PantsMeasures;
  skirt: SkirtMeasures;
  "eco-bag": BagMeasures;
}

// Typical values for what a flat photo can't show well. [A] Owner to confirm.
export const DEFAULTS: { [K in GarmentKind]: Partial<MeasuresOf[K]> } = {
  shirt: { frontNeckDrop: 7.5, backNeckDrop: 2, shoulderDrop: 4, neckWidth: 17 },
  "t-shirt": { frontNeckDrop: 9, backNeckDrop: 2, shoulderDrop: 4, neckWidth: 18 },
  pants: { backRiseExtra: 4 },
  skirt: {},
  "eco-bag": { handleWidth: 3, gusset: 0 },
};

export const MEASURE_KO: Record<string, string> = {
  length: "총장",
  chest: "가슴단면",
  shoulder: "어깨너비",
  hem: "밑단단면",
  sleeve: "소매길이",
  sleeveOpening: "소매단면",
  bicep: "팔통",
  neckWidth: "목너비",
  frontNeckDrop: "앞목깊이",
  backNeckDrop: "뒷목깊이",
  armholeDepth: "진동깊이",
  shoulderDrop: "어깨처짐",
  waist: "허리단면",
  hip: "엉덩이단면",
  frontRise: "앞밑위",
  backRiseExtra: "뒷밑위 추가",
  outseam: "바지총장",
  thigh: "허벅지단면",
  legOpening: "밑단단면",
  width: "가로",
  height: "세로",
  handleLength: "손잡이 길이",
  handleWidth: "손잡이 폭",
  gusset: "바닥 폭",
};

export const MEASURE_EN: Record<string, string> = {
  length: "Length",
  chest: "Chest (flat)",
  shoulder: "Shoulder",
  hem: "Hem (flat)",
  sleeve: "Sleeve",
  sleeveOpening: "Sleeve opening (flat)",
  bicep: "Bicep (flat)",
  neckWidth: "Neck width",
  frontNeckDrop: "Front neck drop",
  backNeckDrop: "Back neck drop",
  armholeDepth: "Armhole depth",
  shoulderDrop: "Shoulder drop",
  waist: "Waist (flat)",
  hip: "Hip (flat)",
  frontRise: "Front rise",
  backRiseExtra: "Back rise extra",
  outseam: "Outseam",
  thigh: "Thigh (flat)",
  legOpening: "Leg opening (flat)",
  width: "Width",
  height: "Height",
  handleLength: "Handle length",
  handleWidth: "Handle width",
  gusset: "Gusset",
};

// Measured values, with defaults filled in for the missing ones and named.
export function withDefaults<K extends GarmentKind>(kind: K, m: Partial<MeasuresOf[K]>): { measures: MeasuresOf[K]; unmeasured: string[] } {
  const d = DEFAULTS[kind] as Record<string, number>;
  const out = { ...m } as Record<string, number>;
  const unmeasured: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (out[k] === undefined || !Number.isFinite(out[k])) {
      out[k] = v;
      unmeasured.push(k);
    }
  }
  return { measures: out as unknown as MeasuresOf[K], unmeasured };
}
