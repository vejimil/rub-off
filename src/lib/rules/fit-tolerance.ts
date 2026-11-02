// How far a shop's measurement may differ from your own well-fitting garment and still fit the same
// way, per point of measure, in flat cm (table − yours). Positive = the shop's garment is bigger.
// The wanted fit shifts the window: "looser" wants the shop's garment bigger, "tighter" smaller.
// [A] Drafted by Claude from common fitting practice; the owner confirms.

import { L, type Local } from "../i18n/lang.ts";
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

export const SIZE_KEY_NAME: Record<SizeKey, Local> = {
  chest: L("가슴단면", "Chest (flat)", "Pecho (plano)"),
  length: L("총장", "Length", "Largo total"),
  shoulder: L("어깨너비", "Shoulder", "Hombros"),
  sleeve: L("소매길이", "Sleeve", "Largo de manga"),
  hem: L("밑단단면", "Hem (flat)", "Bajo (plano)"),
  waist: L("허리단면", "Waist (flat)", "Cintura (plano)"),
  hip: L("엉덩이단면", "Hip (flat)", "Cadera (plano)"),
  thigh: L("허벅지단면", "Thigh (flat)", "Muslo (plano)"),
  frontRise: L("밑위", "Rise", "Tiro"),
  outseam: L("바지총장", "Outseam", "Largo exterior"),
  legOpening: L("밑단단면", "Leg opening (flat)", "Bajo de pierna (plano)"),
};
