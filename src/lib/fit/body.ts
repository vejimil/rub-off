// Body measurements (taken with a tape) into the flat garment measurements that would fit them,
// so a garment can be compared with its wearer and a pattern drafted for them. Circumferences get
// the ease for the wanted fit and are halved to flat (단면) widths; lengths get a small allowance.
// Nothing here describes the body: the numbers only become garment sizes.
// [A] Ease values drafted by Claude from common ready-to-wear practice; the owner confirms.

import { L, type Local } from "../i18n/lang.ts";
import { isTop, type Fabric, type GarmentKind } from "../pattern/types.ts";

export type BodyKey = "chestGirth" | "shoulderWidth" | "armLength" | "bicepGirth" | "waistGirth" | "hipGirth" | "thighGirth" | "crotchDepth" | "waistToAnkle";
export type BodyFit = "slim" | "regular" | "loose";

export const BODY_NAME: Record<BodyKey, Local> = {
  chestGirth: L("가슴둘레", "Chest", "Contorno de pecho"),
  shoulderWidth: L("어깨너비", "Shoulder width", "Ancho de hombros"),
  armLength: L("팔길이", "Arm length", "Largo de brazo"),
  bicepGirth: L("위팔둘레", "Upper arm", "Contorno de brazo"),
  waistGirth: L("허리둘레", "Waist", "Contorno de cintura"),
  hipGirth: L("엉덩이둘레", "Hip", "Contorno de cadera"),
  thighGirth: L("허벅지둘레", "Thigh", "Contorno de muslo"),
  crotchDepth: L("앉은 밑위", "Seated rise", "Tiro sentado"),
  waistToAnkle: L("허리–발목", "Waist to ankle", "Cintura a tobillo"),
};

// How to take each one, shown beside the field.
export const BODY_HOW: Record<BodyKey, Local> = {
  chestGirth: L("겨드랑이 아래 가장 두꺼운 곳을 수평으로 한 바퀴", "Level all round, at the fullest part just below the armpits", "En horizontal, por la parte más ancha justo bajo las axilas"),
  shoulderWidth: L("등 뒤에서 한쪽 어깨끝에서 다른 쪽 어깨끝까지", "Across the back, from one shoulder point to the other", "Por la espalda, de un extremo del hombro al otro"),
  armLength: L("어깨끝에서 팔을 편 채 손목뼈까지", "From the shoulder point to the wrist bone, arm straight", "Del extremo del hombro al hueso de la muñeca, con el brazo estirado"),
  bicepGirth: L("겨드랑이 바로 아래 위팔 한 바퀴", "Round the upper arm, just below the armpit", "Alrededor del brazo, justo bajo la axila"),
  waistGirth: L("바지나 치마를 입는 높이에서 한 바퀴", "All round, at the height you wear your trousers or skirt", "Alrededor, a la altura a la que llevas el pantalón o la falda"),
  hipGirth: L("엉덩이의 가장 나온 곳을 수평으로 한 바퀴", "Level round the fullest part of the hips", "En horizontal, por la parte más ancha de la cadera"),
  thighGirth: L("가랑이 바로 아래 허벅지 한 바퀴", "Round the thigh, just below the crotch", "Alrededor del muslo, justo bajo la entrepierna"),
  crotchDepth: L("의자에 앉아 옆에서, 허리에서 의자 면까지 수직으로", "Seated, from the side: straight down from the waist to the chair seat", "En posición sentada, de lado: en vertical de la cintura al asiento"),
  waistToAnkle: L("서서 옆에서, 허리에서 발목뼈까지", "Standing, from the side: from the waist to the ankle bone", "De pie, de lado: de la cintura al hueso del tobillo"),
};

const LONG_SLEEVED: BodyKey[] = ["chestGirth", "shoulderWidth", "armLength", "bicepGirth"];
const SHORT_SLEEVED: BodyKey[] = ["chestGirth", "shoulderWidth", "bicepGirth"];
export const BODY_KEYS: Record<GarmentKind, BodyKey[]> = {
  "t-shirt": SHORT_SLEEVED,
  "long-sleeve": LONG_SLEEVED,
  sweatshirt: LONG_SLEEVED,
  dress: SHORT_SLEEVED,
  shirt: LONG_SLEEVED,
  hoodie: LONG_SLEEVED,
  pants: ["waistGirth", "hipGirth", "thighGirth", "crotchDepth", "waistToAnkle"],
  skirt: ["hipGirth"],
  "a-line-skirt": ["waistGirth"],
  "eco-bag": [],
  apron: [],
  cushion: [],
  pouch: [],
};

// Ease around the body, cm, per fit: [slim, regular, loose].
const EASE: Record<"chest" | "hip" | "thigh" | "bicep" | "waist", Record<Fabric, [number, number, number]>> = {
  waist: { woven: [1, 2, 4], knit: [0, 1, 3] }, // a waistband sits on the waist
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
  how: Local;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function targetsFromBody(garment: GarmentKind, body: Partial<Record<BodyKey, number>>, fit: BodyFit, fabric: Fabric, garmentNow: Record<string, number> = {}): Target[] {
  const i = FIT_INDEX[fit];
  const out: Target[] = [];
  const has = (k: BodyKey) => Number.isFinite(body[k]) && body[k]! > 0 && BODY_KEYS[garment].includes(k);
  const girth = (key: string, b: BodyKey, ease: number) => {
    if (!has(b)) return;
    const around = body[b]! + ease;
    const n = BODY_NAME[b], v = r1(body[b]!), ar = r1(around), fl = r1(around / 2);
    out.push({
      key,
      cm: fl,
      how: L(`${n.ko} ${v} + 여유 ${ease} = 둘레 ${ar}, 단면 ${fl}`, `${n.en} ${v} + ${ease} ease = ${ar} around, ${fl} flat`, `${n.es} ${v} + ${ease} de holgura = ${ar} de contorno, ${fl} en plano`),
    });
  };
  const plus = (key: string, b: BodyKey, add: number) => {
    if (!has(b)) return;
    const n = BODY_NAME[b], v = r1(body[b]!), tail = add ? ` + ${add}` : "";
    out.push({ key, cm: r1(body[b]! + add), how: L(`${n.ko} ${v}${tail}`, `${n.en} ${v}${tail}`, `${n.es} ${v}${tail}`) });
  };

  if (isTop(garment)) {
    girth("chest", "chestGirth", EASE.chest[fabric][i]);
    plus("shoulder", "shoulderWidth", SHOULDER_ADD[i]);
    plus("sleeve", "armLength", SLEEVE_ADD[i]); // only long sleeves ask for it: a short sleeve's length is a style
    girth("bicep", "bicepGirth", EASE.bicep[fabric][i]);
  } else if (garment === "pants") {
    // Elastic waist: relaxed, the elastic is cut shorter than the waist so it holds (pattern notes).
    if (has("waistGirth")) {
      const relaxed = r1(ELASTIC_SHARE * body.waistGirth!);
      const n = BODY_NAME.waistGirth, v = r1(body.waistGirth!), fl = r1(relaxed / 2);
      out.push({
        key: "waist",
        cm: fl,
        how: L(
          `${n.ko} ${v} × ${ELASTIC_SHARE} = ${relaxed} (고무줄은 허리보다 짧게), 단면 ${fl}`,
          `${n.en} ${v} × ${ELASTIC_SHARE} = ${relaxed} (the elastic is cut shorter than the waist), ${fl} flat`,
          `${n.es} ${v} × ${ELASTIC_SHARE} = ${relaxed} (el elástico se corta más corto que la cintura), ${fl} en plano`,
        ),
      });
    }
    girth("hip", "hipGirth", EASE.hip[fabric][i]);
    girth("thigh", "thighGirth", EASE.thigh[fabric][i]);
    plus("frontRise", "crotchDepth", RISE_ADD[i]);
    if (has("waistToAnkle") && (garmentNow.outseam ?? Infinity) >= FULL_LENGTH_SHARE * body.waistToAnkle!) plus("outseam", "waistToAnkle", 0);
  } else if (garment === "a-line-skirt") {
    girth("waist", "waistGirth", EASE.waist[fabric][i]);
  } else if (garment === "skirt" && has("hipGirth")) {
    const around = body.hipGirth! + SKIRT_PASS_EASE;
    const n = BODY_NAME.hipGirth, v = r1(body.hipGirth!), ar = r1(around), fl = r1(around / 2);
    out.push({
      key: "hem",
      cm: fl,
      min: true,
      how: L(
        `${n.ko} ${v} + ${SKIRT_PASS_EASE} = 둘레 ${ar}, 단면 ${fl} 이상 (엉덩이를 지나야 함)`,
        `${n.en} ${v} + ${SKIRT_PASS_EASE} = ${ar} around, at least ${fl} flat (it has to pass over the hips)`,
        `${n.es} ${v} + ${SKIRT_PASS_EASE} = ${ar} de contorno, al menos ${fl} en plano (tiene que pasar por la cadera)`,
      ),
    });
  }
  return out;
}
