// Body measurements (taken with a tape) into the flat garment measurements that would fit them,
// so a garment can be compared with its wearer and a pattern drafted for them. Circumferences get
// the ease for the wanted fit and are halved to flat (단면) widths; lengths get a small allowance.
// Nothing here describes the body: the numbers only become garment sizes.
// [A] Ease values drafted by Claude from common ready-to-wear practice; the owner confirms.

import type { Fabric, GarmentKind } from "../pattern/types.ts";

export type BodyKey = "chestGirth" | "shoulderWidth" | "armLength" | "bicepGirth" | "waistGirth" | "hipGirth" | "thighGirth" | "crotchDepth" | "waistToAnkle";
export type BodyFit = "slim" | "regular" | "loose";

export const BODY_KO: Record<BodyKey, string> = {
  chestGirth: "가슴둘레",
  shoulderWidth: "어깨너비",
  armLength: "팔길이",
  bicepGirth: "위팔둘레",
  waistGirth: "허리둘레",
  hipGirth: "엉덩이둘레",
  thighGirth: "허벅지둘레",
  crotchDepth: "앉은 밑위",
  waistToAnkle: "허리–발목",
};

// How to take each one, shown beside the field.
export const BODY_HOW: Record<BodyKey, string> = {
  chestGirth: "겨드랑이 아래 가장 두꺼운 곳을 수평으로 한 바퀴",
  shoulderWidth: "등 뒤에서 한쪽 어깨끝에서 다른 쪽 어깨끝까지",
  armLength: "어깨끝에서 팔을 편 채 손목뼈까지",
  bicepGirth: "겨드랑이 바로 아래 위팔 한 바퀴",
  waistGirth: "바지를 입는 높이에서 한 바퀴",
  hipGirth: "엉덩이의 가장 나온 곳을 수평으로 한 바퀴",
  thighGirth: "가랑이 바로 아래 허벅지 한 바퀴",
  crotchDepth: "의자에 앉아 옆에서, 허리에서 의자 면까지 수직으로",
  waistToAnkle: "서서 옆에서, 허리에서 발목뼈까지",
};

export const BODY_KEYS: Record<GarmentKind, BodyKey[]> = {
  shirt: ["chestGirth", "shoulderWidth", "armLength", "bicepGirth"],
  "t-shirt": ["chestGirth", "shoulderWidth", "bicepGirth"],
  hoodie: ["chestGirth", "shoulderWidth", "armLength", "bicepGirth"],
  pants: ["waistGirth", "hipGirth", "thighGirth", "crotchDepth", "waistToAnkle"],
  skirt: ["hipGirth"],
  "eco-bag": [],
};

// Ease around the body, cm, per fit: [slim, regular, loose].
const EASE: Record<"chest" | "hip" | "thigh" | "bicep", Record<Fabric, [number, number, number]>> = {
  chest: { woven: [8, 14, 22], knit: [4, 10, 18] },
  hip: { woven: [4, 8, 14], knit: [2, 6, 12] },
  thigh: { woven: [4, 8, 14], knit: [2, 6, 12] },
  bicep: { woven: [4, 8, 12], knit: [2, 6, 10] },
};
// Added to lengths and the shoulder, cm, per fit. A loose top has a dropped shoulder.
const SHOULDER_ADD: [number, number, number] = [0, 1, 6];
const SLEEVE_ADD: [number, number, number] = [0, 1, 2];
const RISE_ADD: [number, number, number] = [1, 2, 3];
// A skirt with an elastic waist must pass over the hips: its hem at least this much around them.
const SKIRT_PASS_EASE = 4;
// An elastic waist, relaxed, is about this share of the body's waist ("waist minus about 10%").
const ELASTIC_SHARE = 0.9;
// A trouser shorter than this share of the waist-to-ankle length is shorts: its length is a choice.
const FULL_LENGTH_SHARE = 0.8;

const FIT_INDEX: Record<BodyFit, 0 | 1 | 2> = { slim: 0, regular: 1, loose: 2 };

export interface Target {
  key: string; // a flat garment measurement (MeasuresOf keys)
  cm: number;
  min?: boolean; // only a lower bound: bigger is fine (a gathered skirt)
  // How it was worked out, every number in it computed here.
  howKo: string;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function targetsFromBody(garment: GarmentKind, body: Partial<Record<BodyKey, number>>, fit: BodyFit, fabric: Fabric, garmentNow: Record<string, number> = {}): Target[] {
  const i = FIT_INDEX[fit];
  const out: Target[] = [];
  const has = (k: BodyKey) => Number.isFinite(body[k]) && body[k]! > 0 && BODY_KEYS[garment].includes(k);
  const girth = (key: string, b: BodyKey, ease: number) => {
    if (!has(b)) return;
    const around = body[b]! + ease;
    out.push({ key, cm: r1(around / 2), howKo: `${BODY_KO[b]} ${r1(body[b]!)} + 여유 ${ease} = 둘레 ${r1(around)}, 단면 ${r1(around / 2)}` });
  };
  const plus = (key: string, b: BodyKey, add: number) => {
    if (!has(b)) return;
    out.push({ key, cm: r1(body[b]! + add), howKo: add ? `${BODY_KO[b]} ${r1(body[b]!)} + ${add}` : `${BODY_KO[b]} ${r1(body[b]!)}` });
  };

  if (garment === "shirt" || garment === "t-shirt" || garment === "hoodie") {
    girth("chest", "chestGirth", EASE.chest[fabric][i]);
    plus("shoulder", "shoulderWidth", SHOULDER_ADD[i]);
    if (garment !== "t-shirt") plus("sleeve", "armLength", SLEEVE_ADD[i]); // a T-shirt sleeve's length is a style
    girth("bicep", "bicepGirth", EASE.bicep[fabric][i]);
  } else if (garment === "pants") {
    // Elastic waist: relaxed, the elastic is cut shorter than the waist so it holds (pattern notes).
    if (has("waistGirth")) {
      const relaxed = r1(ELASTIC_SHARE * body.waistGirth!);
      out.push({ key: "waist", cm: r1(relaxed / 2), howKo: `${BODY_KO.waistGirth} ${r1(body.waistGirth!)} × ${ELASTIC_SHARE} = ${relaxed} (고무줄은 허리보다 짧게), 단면 ${r1(relaxed / 2)}` });
    }
    girth("hip", "hipGirth", EASE.hip[fabric][i]);
    girth("thigh", "thighGirth", EASE.thigh[fabric][i]);
    plus("frontRise", "crotchDepth", RISE_ADD[i]);
    if (has("waistToAnkle") && (garmentNow.outseam ?? Infinity) >= FULL_LENGTH_SHARE * body.waistToAnkle!) plus("outseam", "waistToAnkle", 0);
  } else if (garment === "skirt" && has("hipGirth")) {
    const around = body.hipGirth! + SKIRT_PASS_EASE;
    out.push({ key: "hem", cm: r1(around / 2), min: true, howKo: `${BODY_KO.hipGirth} ${r1(body.hipGirth!)} + ${SKIRT_PASS_EASE} = 둘레 ${r1(around)}, 단면 ${r1(around / 2)} 이상 (엉덩이를 지나야 함)` });
  }
  return out;
}
