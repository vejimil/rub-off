// How far a shop's measurement may differ from your own well-fitting garment and still fit the same
// way, per point of measure, in flat cm (table − yours). Positive = the shop's garment is bigger.
// The wanted fit shifts the window: "looser" wants the shop's garment bigger, "tighter" smaller.
// [A] Drafted by Claude from common fitting practice; the owner confirms.

import type { Fabric } from "../pattern/types.ts";

export type Fit = "same" | "looser" | "tighter";

export const SIZE_KEYS = ["chest", "length", "shoulder", "sleeve", "hem", "waist", "hip", "thigh", "frontRise", "outseam", "legOpening"] as const;
export type SizeKey = (typeof SIZE_KEYS)[number];

const WOVEN: Record<SizeKey, [number, number]> = {
  chest: [-1, 2], // a woven chest smaller than yours pulls at the buttons
  length: [-2, 2],
  shoulder: [-1, 1],
  sleeve: [-1.5, 1.5],
  hem: [-2, 3],
  waist: [-1, 1.5],
  hip: [-1, 2],
  thigh: [-1, 2],
  frontRise: [-1, 1.5],
  outseam: [-2, 2],
  legOpening: [-1.5, 2],
};

const KNIT: Record<SizeKey, [number, number]> = {
  ...WOVEN,
  chest: [-2, 2],
  hem: [-2.5, 3],
  waist: [-2, 2],
  hip: [-2, 2],
  thigh: [-2, 2],
};

// Shift for the wanted fit, applied to widths only; lengths stay.
const WIDTHS: readonly SizeKey[] = ["chest", "hem", "waist", "hip", "thigh", "legOpening"];
const FIT_SHIFT: Record<Fit, number> = { same: 0, looser: 2, tighter: -1.5 };

export function tolerance(key: SizeKey, fabric: Fabric, fit: Fit): [number, number] {
  const [lo, hi] = (fabric === "knit" ? KNIT : WOVEN)[key];
  const s = WIDTHS.includes(key) ? FIT_SHIFT[fit] : 0;
  return [lo + s, hi + s];
}

// Points of measure that decide first when sizes tie, most important first.
export const PRIORITY: readonly SizeKey[] = ["chest", "shoulder", "hip", "waist", "length", "sleeve", "outseam", "thigh", "hem", "frontRise", "legOpening"];

export const SIZE_KEY_KO: Record<SizeKey, string> = {
  chest: "가슴단면",
  length: "총장",
  shoulder: "어깨너비",
  sleeve: "소매길이",
  hem: "밑단단면",
  waist: "허리단면",
  hip: "엉덩이단면",
  thigh: "허벅지단면",
  frontRise: "밑위",
  outseam: "바지총장",
  legOpening: "밑단단면",
};
