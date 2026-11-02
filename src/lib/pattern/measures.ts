// Flat measurements per garment, in cm, the way a shop's 실측표 gives them: widths are across the
// garment lying flat (단면), lengths along it. These are what the photo measures and what a pattern
// is drafted from, so grading and the size decision work on the same numbers.
// A value missing from a measured garment is filled from DEFAULTS and listed as unmeasured.

import { L, type Local } from "../i18n/lang.ts";
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

// A sweatshirt: hem and cuffs are rib bands.
export interface RibTopMeasures extends TopMeasures {
  ribHeight: number; // finished height of the rib bands at the hem and cuffs
}

export interface HoodieMeasures extends RibTopMeasures {
  hoodHeight: number; // neck seam at the shoulder to the top of the hood
  hoodDepth: number; // face opening to the back of the hood, at its widest
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

// A skirt with a waistband and a side zip, flaring from the waist to the hem.
export interface ALineMeasures {
  waist: number; // flat
  length: number; // top of the waistband to hem
  hem: number; // flat hem width
}

// A bib apron: a bib at the top, widening to the skirt at the waist ties.
export interface ApronMeasures {
  width: number; // the skirt's width, flat
  length: number; // top of the bib to hem
  bibWidth: number; // across the top of the bib
  bibHeight: number; // top of the bib down to the waist ties
  neckStrap: number; // finished, end to end
  tieLength: number; // finished, each
}

// An envelope cushion cover: one front and two backs that overlap.
export interface CushionMeasures {
  width: number;
  height: number;
  overlap: number; // how far the two backs overlap
}

export interface PouchMeasures {
  width: number;
  height: number;
  gusset: number; // box-corner depth; 0 for a flat pouch
}

export interface BagMeasures {
  width: number;
  height: number; // bottom to opening
  handleLength: number; // finished, between the two ends sewn into the bag
  handleWidth: number; // finished
  gusset: number; // box-corner depth; 0 for a flat bag
}

export interface MeasuresOf {
  "t-shirt": TopMeasures;
  "long-sleeve": TopMeasures;
  sweatshirt: RibTopMeasures;
  dress: TopMeasures;
  shirt: TopMeasures;
  hoodie: HoodieMeasures;
  pants: PantsMeasures;
  skirt: SkirtMeasures;
  "a-line-skirt": ALineMeasures;
  "eco-bag": BagMeasures;
  apron: ApronMeasures;
  cushion: CushionMeasures;
  pouch: PouchMeasures;
}

// Typical values for what a flat photo can't show well. [A] Owner to confirm.
export const DEFAULTS: { [K in GarmentKind]: Partial<MeasuresOf[K]> } = {
  "t-shirt": { frontNeckDrop: 9, backNeckDrop: 2, shoulderDrop: 4, neckWidth: 18 },
  "long-sleeve": { frontNeckDrop: 9, backNeckDrop: 2, shoulderDrop: 4, neckWidth: 18 },
  sweatshirt: { frontNeckDrop: 8, backNeckDrop: 2, shoulderDrop: 4, neckWidth: 18, ribHeight: 6 },
  dress: { frontNeckDrop: 10, backNeckDrop: 2, shoulderDrop: 4, neckWidth: 19 },
  shirt: { frontNeckDrop: 7.5, backNeckDrop: 2, shoulderDrop: 4, neckWidth: 17 },
  hoodie: { frontNeckDrop: 8, backNeckDrop: 2, shoulderDrop: 4, neckWidth: 18, hoodHeight: 34, hoodDepth: 24, ribHeight: 6 },
  pants: { backRiseExtra: 4 },
  skirt: {},
  "a-line-skirt": {},
  "eco-bag": { handleWidth: 3, gusset: 0 },
  apron: { bibHeight: 26, neckStrap: 60, tieLength: 70 },
  cushion: { overlap: 12 },
  pouch: { gusset: 0 },
};

export const MEASURE_NAME: Record<string, Local> = {
  length: L("총장", "Length", "Largo total"),
  chest: L("가슴단면", "Chest (flat)", "Pecho (plano)"),
  shoulder: L("어깨너비", "Shoulder", "Hombros"),
  hem: L("밑단단면", "Hem (flat)", "Bajo (plano)"),
  sleeve: L("소매길이", "Sleeve", "Largo de manga"),
  sleeveOpening: L("소매단면", "Sleeve opening (flat)", "Boca de manga (plano)"),
  bicep: L("팔통", "Bicep (flat)", "Bíceps (plano)"),
  neckWidth: L("목너비", "Neck width", "Ancho de cuello"),
  frontNeckDrop: L("앞목깊이", "Front neck drop", "Profundidad del escote delantero"),
  backNeckDrop: L("뒷목깊이", "Back neck drop", "Profundidad del escote trasero"),
  armholeDepth: L("진동깊이", "Armhole depth", "Profundidad de sisa"),
  shoulderDrop: L("어깨처짐", "Shoulder drop", "Caída de hombro"),
  waist: L("허리단면", "Waist (flat)", "Cintura (plano)"),
  hip: L("엉덩이단면", "Hip (flat)", "Cadera (plano)"),
  frontRise: L("앞밑위", "Front rise", "Tiro delantero"),
  backRiseExtra: L("뒷밑위 추가", "Back rise extra", "Tiro trasero extra"),
  outseam: L("바지총장", "Outseam", "Largo exterior"),
  inseam: L("안솔기 길이", "Inseam", "Largo de entrepierna"),
  thigh: L("허벅지단면", "Thigh (flat)", "Muslo (plano)"),
  legOpening: L("밑단단면", "Leg opening (flat)", "Bajo de pierna (plano)"),
  width: L("가로", "Width", "Ancho"),
  height: L("세로", "Height", "Alto"),
  handleLength: L("손잡이 길이", "Handle length", "Largo del asa"),
  handleWidth: L("손잡이 폭", "Handle width", "Ancho del asa"),
  gusset: L("바닥 폭", "Gusset", "Fuelle"),
  hoodHeight: L("모자 높이", "Hood height", "Alto de capucha"),
  hoodDepth: L("모자 폭", "Hood depth", "Fondo de capucha"),
  ribHeight: L("시보리 높이", "Rib height", "Alto del puño de canalé"),
  bibWidth: L("가슴판 너비", "Bib width", "Ancho del peto"),
  bibHeight: L("가슴판 높이", "Bib height", "Alto del peto"),
  neckStrap: L("목끈 길이", "Neck strap", "Tira del cuello"),
  tieLength: L("허리끈 길이", "Waist tie", "Cinta de la cintura"),
  overlap: L("겹침 길이", "Overlap", "Solapa"),
};

// Single-language views of the same table, for code that already knows its language.
export const MEASURE_KO: Record<string, string> = Object.fromEntries(Object.entries(MEASURE_NAME).map(([k, v]) => [k, v.ko]));
export const MEASURE_EN: Record<string, string> = Object.fromEntries(Object.entries(MEASURE_NAME).map(([k, v]) => [k, v.en]));

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
