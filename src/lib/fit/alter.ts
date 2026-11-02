// Alteration instructions for a garment you own, from two inputs: the body it should fit (body.ts
// turns tape measurements into target garment sizes) and what the wearer says is wrong, picked
// from a list or written in their own words (Muse Spark only sorts the words into this list; see
// read-complaint.ts). Every amount is a difference the code computed, a number the wearer typed or
// a rule constant below; every sentence is a template filled by code, in Korean, English and
// Spanish, and passed through the number guard. Seated-fit rules come from the research in Seated
// Tailor's docs/RULES-RESEARCH.md ([V] read at source, [E] estimate); [A] constants are drafted by
// Claude for the owner to confirm. Fit and comfort only: nothing here is health advice.

import { L, LANGS, type Local } from "../i18n/lang.ts";
import { MEASURE_NAME } from "../pattern/measures.ts";
import { GARMENT_NAME } from "../i18n/names.ts";
import { NOT_WORN, TOP_KINDS, type Fabric, type GarmentKind } from "../pattern/types.ts";
import { tolerance, SIZE_KEYS, type SizeKey } from "../rules/fit-tolerance.ts";
import { guardNumbers } from "../rules/numbers.ts";
import type { Target } from "./body.ts";

export type Difficulty = "easy" | "medium" | "hard";

export interface Alteration {
  id: string;
  part: Local;
  action: Local; // the short name: "옆선 줄이기"
  instruction: Local; // what the tailor does, with the amounts
  amountCm?: number;
  difficulty: Difficulty;
  reversible?: boolean;
  side?: "left" | "right" | "both"; // the wearer's side, for marks on one side only
  // How the measurements change if the pattern is drafted with this alteration (flat cm).
  delta?: Record<string, number>;
  from: Local; // why: the body working, the item picked, or the wearer's words
}

export const DIFFICULTY_NAME: Record<Difficulty, Local> = {
  easy: L("쉬움", "Easy", "Fácil"),
  medium: L("보통", "Moderate", "Media"),
  hard: L("어려움", "Hard", "Difícil"),
};

// [A] What a ready-made garment usually has to spare, cm.
export const LET_OUT_FLAT = 1; // side seams let out: 0.5 cm each side, so 1 cm flat, 2 cm around
export const HEM_SPARE = { top: 2, pants: 3 }; // hem allowance that can be let down
const BIG_TAKE_IN = 4; // flat; past this the armhole and sleeve need reshaping too
// [V] Ag Apparel's seated jeans add about 5 cm at the back; curved inserts are 5–7.5 cm.
export const BACK_RISE_DEFAULT = 5;
// [E] Seated Tailor: open the outseam to the cast's top plus this margin.
export const CAST_MARGIN = 5;

const half = (x: number) => Math.round(x * 2) / 2;
// Korean only: the particle that fits the word's last syllable, 을/를 or 이/가.
export function jo(word: string, p: "을" | "이"): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  const batchim = c >= 0 && c < 11172 && c % 28 !== 0;
  return word + (p === "을" ? (batchim ? "을" : "를") : batchim ? "이" : "가");
}
const f = (x: number) => (Math.round(x * 10) / 10).toString();
const TOP_GARMENTS: readonly GarmentKind[] = TOP_KINDS;

// Measurements as a sentence names them (Spanish with its article): "Take in the chest",
// "Mete el pecho". Korean uses the measurement's own name.
const SAY: Record<string, { en: string; es: string }> = {
  chest: { en: "chest", es: "el pecho" },
  hem: { en: "hem width", es: "el ancho del bajo" },
  waist: { en: "waist", es: "la cintura" },
  hip: { en: "hip", es: "la cadera" },
  thigh: { en: "thigh", es: "el muslo" },
  legOpening: { en: "leg opening", es: "el bajo de la pierna" },
  bicep: { en: "sleeve width", es: "el ancho de manga" },
  shoulder: { en: "shoulder width", es: "el ancho de hombros" },
  sleeve: { en: "sleeve length", es: "el largo de manga" },
  outseam: { en: "length", es: "el largo" },
  length: { en: "length", es: "el largo" },
  frontRise: { en: "front rise", es: "el tiro delantero" },
};
const sayName = (key: string): Local => L(MEASURE_NAME[key]?.ko ?? key, SAY[key]?.en ?? key, SAY[key]?.es ?? key);

export interface Comparison {
  key: string;
  target: Target;
  mine: number;
  diff: number; // target − mine, flat cm, to 0.5
  window: [number, number];
  verdict: "fits" | "small" | "big"; // the garment is … for the body
}

const WIDTHS = ["chest", "hem", "waist", "hip", "thigh", "legOpening", "bicep"];

// Each target against the garment, with the same windows the size decision uses.
export function compare(targets: Target[], mine: Record<string, number>, fabric: Fabric): Comparison[] {
  return targets.flatMap((t) => {
    const m = mine[t.key];
    if (!Number.isFinite(m)) return [];
    const diff = half(t.cm - m);
    const window: [number, number] = (SIZE_KEYS as readonly string[]).includes(t.key) ? tolerance(t.key as SizeKey, fabric, "same") : [-1, 1.5];
    // tolerance() is "table − yours": a shop garment bigger than yours by up to hi still fits.
    // Here the garment is the one being judged, so the window flips.
    const lo = -window[1], hi = -window[0];
    const verdict = t.min ? (diff > 0 ? "small" : "fits") : diff > hi ? "small" : diff < lo ? "big" : "fits";
    return [{ key: t.key, target: t, mine: m, diff, window: [lo, hi], verdict }];
  });
}

const CUFF_SHORTEN = (a: number) =>
  L(
    `커프스를 떼고 소매를 ${f(a)} cm 잘라 커프스를 다시 답니다.`,
    `Take off the cuffs, cut the sleeves ${f(a)} cm shorter and sew the cuffs back on.`,
    `Descose los puños, acorta las mangas ${f(a)} cm y vuelve a coser los puños.`,
  );

// What to change so the garment meets the body. One alteration per measurement that misses.
export function fromBody(garment: GarmentKind, comparisons: Comparison[]): Alteration[] {
  const top = TOP_GARMENTS.includes(garment);
  const out: Alteration[] = [];
  for (const c of comparisons) {
    if (c.verdict === "fits") continue;
    const amt = Math.abs(c.diff);
    const a = f(amt), a2 = f(2 * amt), ah = f(amt / 2);
    const part = MEASURE_NAME[c.key] ?? L(c.key, c.key, c.key);
    const nm = sayName(c.key);
    const from = L(`몸 치수 ${c.target.how.ko}`, `Body: ${c.target.how.en}`, `Cuerpo: ${c.target.how.es}`);
    const base = { id: `body-${c.key}`, amountCm: amt, delta: { [c.key]: c.diff }, from };
    if (WIDTHS.includes(c.key)) {
      if (c.key === "waist" && garment === "pants") {
        out.push({
          ...base,
          part: L("허리", "Waist", "Cintura"),
          difficulty: "easy",
          reversible: true,
          ...(c.verdict === "big"
            ? {
                action: L("고무줄 줄이기", "Shorten the elastic", "Acortar el elástico"),
                instruction: L(
                  `허리 고무줄을 ${a2} cm 짧게 다시 끼웁니다 (단면 ${a} cm).`,
                  `Rethread the waist elastic ${a2} cm shorter (${a} cm flat).`,
                  `Vuelve a pasar el elástico de la cintura ${a2} cm más corto (${a} cm en plano).`,
                ),
              }
            : {
                action: L("고무줄 늘리기", "Lengthen the elastic", "Alargar el elástico"),
                instruction: L(
                  `허리 고무줄을 ${a2} cm 길게 바꿉니다 (단면 ${a} cm). 허리단 천이 모자라면 고무줄만으로는 안 됩니다.`,
                  `Replace the waist elastic with one ${a2} cm longer (${a} cm flat). If the waistband fabric is too short, the elastic alone won't do it.`,
                  `Cambia el elástico de la cintura por uno ${a2} cm más largo (${a} cm en plano). Si a la cinturilla le falta tela, no basta con el elástico.`,
                ),
              }),
        });
        continue;
      }
      const where =
        c.key === "bicep"
          ? L("소매 밑선", "underarm seams", "costuras de la manga")
          : c.key === "thigh" || c.key === "legOpening"
            ? L("안솔기와 옆선", "inseams and outseams", "costuras de entrepierna y laterales")
            : L("양 옆선", "side seams", "costuras laterales");
      if (c.verdict === "big") {
        const big = amt > BIG_TAKE_IN && (c.key === "chest" || c.key === "hip");
        const more = L(top ? "진동과 소매" : "밑위 곡선", top ? "armholes and sleeves" : "crotch curve", top ? "las sisas y las mangas" : "la curva del tiro");
        out.push({
          ...base,
          part,
          action: L(`${where.ko} 줄이기`, `Take in the ${where.en}`, `Meter las ${where.es}`),
          instruction: L(
            `${jo(nm.ko, "을")} 단면 ${a} cm (둘레 ${a2} cm) 줄입니다: ${jo(where.ko, "을")} 각각 ${ah} cm씩 안으로 새로 박습니다.${big ? ` ${BIG_TAKE_IN} cm보다 크게 줄이면 ${more.ko}도 같이 고쳐야 합니다.` : ""}`,
            `Take in the ${nm.en} by ${a} cm flat (${a2} cm around): restitch each of the ${where.en} ${ah} cm further in.${big ? ` Past ${BIG_TAKE_IN} cm, reshape the ${more.en} too.` : ""}`,
            `Mete ${nm.es} ${a} cm en plano (${a2} cm de contorno): vuelve a coser cada una de las ${where.es} ${ah} cm más adentro.${big ? ` Si metes más de ${BIG_TAKE_IN} cm, rehaz también ${more.es}.` : ""}`,
          ),
          difficulty: big ? "hard" : "easy",
        });
      } else {
        const ok = amt <= LET_OUT_FLAT;
        out.push({
          ...base,
          part,
          action: ok ? L(`${where.ko} 늘리기`, `Let out the ${where.en}`, `Sacar las ${where.es}`) : L(`${where.ko}에 덧천 넣기`, `Add panels at the ${where.en}`, `Añadir piezas en las ${where.es}`),
          instruction: ok
            ? L(
                `${jo(nm.ko, "을")} 단면 ${a} cm (둘레 ${a2} cm) 늘립니다: ${where.ko} 시접을 각각 ${ah} cm씩 풀어 박습니다. 시접이 그만큼 남아 있는지 먼저 확인하십시오.`,
                `Let out the ${nm.en} by ${a} cm flat (${a2} cm around): unpick the ${where.en} and restitch each ${ah} cm into the seam allowance. First check that this much allowance is left.`,
                `Saca ${nm.es} ${a} cm en plano (${a2} cm de contorno): descose las ${where.es} y vuelve a coser cada una ${ah} cm dentro del margen. Comprueba antes que quede ese margen.`,
              )
            : L(
                `${jo(nm.ko, "이")} 단면 ${a} cm 모자랍니다. 시접으로 늘릴 수 있는 건 단면 ${f(LET_OUT_FLAT)} cm까지라, ${where.ko}에 덧천(무)을 넣거나 새 패턴으로 만드는 편이 낫습니다.`,
                `The ${nm.en} is ${a} cm short, flat. A seam allowance gives only up to ${f(LET_OUT_FLAT)} cm flat, so add panels at the ${where.en} or make a new pattern.`,
                `Faltan ${a} cm en plano en ${nm.es}. El margen de costura solo da hasta ${f(LET_OUT_FLAT)} cm en plano, así que añade piezas en las ${where.es} o haz un patrón nuevo.`,
              ),
          difficulty: ok ? "medium" : "hard",
        });
      }
      continue;
    }
    if (c.key === "shoulder") {
      out.push({
        ...base,
        part: L("어깨", "Shoulders", "Hombros"),
        action: c.verdict === "big" ? L("어깨 줄이기", "Narrow the shoulders", "Estrechar los hombros") : L("어깨 (늘릴 수 없음)", "Shoulders (can't be let out)", "Hombros (no se pueden sacar)"),
        instruction:
          c.verdict === "big"
            ? L(
                `어깨너비를 ${a} cm 줄입니다: 소매를 떼고 양쪽 어깨끝을 ${ah} cm씩 안으로 옮겨 진동을 다시 그린 뒤 소매를 답니다.`,
                `Narrow the shoulders by ${a} cm: take off the sleeves, move each shoulder point ${ah} cm in, redraw the armholes and set the sleeves back in.`,
                `Estrecha los hombros ${a} cm: descose las mangas, mete cada punto de hombro ${ah} cm, vuelve a trazar las sisas y monta de nuevo las mangas.`,
              )
            : L(
                `어깨너비가 ${a} cm 좁습니다. 어깨는 늘릴 수 없어 새 패턴으로 만드는 편이 낫습니다.`,
                `The shoulders are ${a} cm too narrow. Shoulders can't be let out, so a new pattern is the better choice.`,
                `Los hombros se quedan ${a} cm estrechos. Los hombros no se pueden sacar; es mejor hacer un patrón nuevo.`,
              ),
        difficulty: "hard",
      });
      continue;
    }
    // Lengths: sleeve, outseam, front rise.
    if (c.key === "frontRise") {
      const big = c.verdict === "big";
      out.push({
        ...base,
        part: L("밑위", "Rise", "Tiro"),
        action: big ? L("밑위 줄이기", "Shorten the rise", "Acortar el tiro") : L("밑위 늘리기", "Lengthen the rise", "Alargar el tiro"),
        instruction: L(
          `앞밑위가 ${a} cm ${big ? "깁니다" : "짧습니다"}. 허리단을 떼고 허리선을 ${a} cm ${big ? "내려" : "올려(덧단)"} 다시 답니다.`,
          `The front rise is ${a} cm too ${big ? "long" : "short"}. Take off the waistband, ${big ? "lower" : "raise (with an extension)"} the waistline ${a} cm and sew the band back on.`,
          `El tiro delantero es ${a} cm demasiado ${big ? "largo" : "corto"}. Descose la cinturilla, ${big ? "baja" : "sube (con una tira)"} la línea de cintura ${a} cm y vuelve a coserla.`,
        ),
        difficulty: "hard",
      });
      continue;
    }
    const spare = garment === "pants" ? HEM_SPARE.pants : HEM_SPARE.top;
    const sleeve = c.key === "sleeve";
    const partL = sleeve ? L("소매", "Sleeves", "Mangas") : L("밑단", "Hem", "Bajo");
    const hemOf = sleeve ? L("소매", "sleeve hems", "el bajo de las mangas") : L("밑단", "hem", "el bajo");
    const cuff = sleeve && garment === "shirt";
    if (c.verdict === "big") {
      out.push({
        ...base,
        part: partL,
        action: L(`${nm.ko} 줄이기`, `Shorten the ${nm.en}`, `Acortar ${nm.es}`),
        instruction: cuff
          ? CUFF_SHORTEN(amt)
          : L(`${jo(hemOf.ko, "을")} ${a} cm 올려 다시 박습니다.`, `Turn the ${hemOf.en} up ${a} cm and restitch.`, `Sube ${hemOf.es} ${a} cm y vuelve a coserlo.`),
        difficulty: cuff ? "medium" : "easy",
      });
    } else {
      const ok = amt <= spare;
      out.push({
        ...base,
        part: partL,
        action: ok ? L(`${nm.ko} 늘리기`, `Lengthen the ${nm.en}`, `Alargar ${nm.es}`) : L(`${hemOf.ko}에 덧단 달기`, `Add an extension to the ${hemOf.en}`, `Alargar ${hemOf.es} con una tira`),
        instruction: ok
          ? L(
              `${hemOf.ko} 시접을 ${a} cm 내려 다시 박습니다. 시접이 ${a} cm 이상 남아 있는지 먼저 확인하십시오.`,
              `Let the ${hemOf.en} down ${a} cm and restitch. First check that at least ${a} cm of allowance is left.`,
              `Saca ${hemOf.es} ${a} cm y vuelve a coserlo. Comprueba antes que queden al menos ${a} cm de dobladillo.`,
            )
          : L(
              `${jo(nm.ko, "이")} ${a} cm 모자랍니다. 시접으로는 ${f(spare)} cm까지라 ${hemOf.ko}에 덧단을 답니다.`,
              `The ${nm.en} is ${a} cm short. The allowance gives only ${f(spare)} cm, so add an extension band to the ${hemOf.en}.`,
              `Faltan ${a} cm en ${nm.es}. El dobladillo solo da ${f(spare)} cm, así que alarga ${hemOf.es} con una tira.`,
            ),
        difficulty: ok ? "medium" : "hard",
      });
    }
  }
  return out;
}

// ---------- complaints ----------

export interface ComplaintDef {
  id: string;
  label: Local; // as the wearer would say it
  garments: readonly GarmentKind[];
  seated?: boolean; // from the seated-fit research
  ask?: Local; // the one number this rule can use, typed by the wearer
}

const PANTS: readonly GarmentKind[] = ["pants"];
const TOPS = TOP_GARMENTS;
const WAISTED: readonly GarmentKind[] = ["pants", "skirt"];
export const WORN: readonly GarmentKind[] = (Object.keys(GARMENT_NAME) as GarmentKind[]).filter((g) => !NOT_WORN.includes(g));
const LONG_SLEEVED: readonly GarmentKind[] = ["shirt", "hoodie", "sweatshirt", "long-sleeve"];

const SHORTER = L("줄이고 싶은 길이", "How much shorter", "Cuánto quieres acortarlo");
const LONGER = L("늘리고 싶은 길이", "How much longer", "Cuánto quieres alargarlo");

export const COMPLAINTS: readonly ComplaintDef[] = [
  {
    id: "seat-back-drops",
    label: L("휠체어에 앉으면 바지 뒤 허리가 내려가요", "In my wheelchair the back of my trousers drops", "En la silla de ruedas se me baja la parte de atrás del pantalón"),
    garments: PANTS,
    seated: true,
    ask: L("앉았을 때 뒤 허리가 내려가는 길이", "How far the back waist drops when seated", "Cuánto baja la cintura trasera al sentarte"),
  },
  {
    id: "seat-front-bunches",
    label: L("앉으면 배 앞에 천이 뭉쳐요", "Fabric bunches at the front when I sit", "Al sentarme se me arruga la tela delante"),
    garments: PANTS,
    seated: true,
    ask: L("앉아서 앞에 접히는 천의 높이", "Height of the fold at the front when seated", "Altura del pliegue delantero al sentarte"),
  },
  { id: "seat-presses", label: L("앉으면 뒷주머니나 리벳이 배겨요", "Back pockets or rivets dig in when I sit", "Al sentarme se me clavan los bolsillos traseros o los remaches"), garments: PANTS, seated: true },
  {
    id: "seat-hem-short",
    label: L("앉으면 바지 밑단이 짧아져요", "The hem rides up too short when I sit", "Al sentarme el bajo del pantalón queda corto"),
    garments: PANTS,
    seated: true,
    ask: L("앉았을 때 밑단이 더 내려와야 하는 길이", "How much lower the hem should come when seated", "Cuánto más debe bajar el bajo al sentarte"),
  },
  {
    id: "cast-leg",
    label: L("깁스나 보조기 때문에 바짓단이 안 들어가요", "The leg won't go over my cast or brace", "La pernera no pasa por la escayola o la férula"),
    garments: PANTS,
    seated: true,
    ask: L("발바닥부터 깁스 위 끝까지 높이", "Height of the cast, from the sole to its top", "Altura de la escayola, de la planta del pie al borde superior"),
  },
  { id: "hard-pull-up", label: L("앉은 채로 바지를 끌어올리기 힘들어요", "It's hard to pull my trousers up while seated", "Me cuesta subirme el pantalón sin levantarme"), garments: PANTS, seated: true },
  {
    id: "seat-top-bunches",
    label: L("앉으면 상의 앞자락이 무릎 위에 뭉쳐요", "The front of my top bunches on my lap when I sit", "Al sentarme el delantero de la prenda se amontona sobre las rodillas"),
    garments: TOPS,
    seated: true,
    ask: L("앉았을 때 앞자락이 남는 길이", "How much front hem is left over when seated", "Cuánto sobra del delantero al sentarte"),
  },
  { id: "elbows-wear", label: L("휠체어 바퀴를 밀다 보니 팔꿈치가 닳아요", "The elbows wear through from pushing my wheels", "Los codos se gastan de empujar las ruedas"), garments: LONG_SLEEVED, seated: true },
  { id: "crutch-underarm", label: L("목발 때문에 겨드랑이가 쓸려요", "My crutches rub the underarms", "Las muletas me rozan las axilas"), garments: TOPS, seated: true },
  { id: "hard-fasten", label: L("단추나 지퍼를 여닫기 어려워요", "Buttons or zips are hard to do up", "Me cuesta abrochar botones o cremalleras"), garments: ["shirt", "hoodie", "pants"], seated: true },
  { id: "sleeve-long", label: L("소매가 길어요", "The sleeves are too long", "Las mangas son demasiado largas"), garments: TOPS, ask: SHORTER },
  { id: "body-long", label: L("옷 길이가 길어요", "The top is too long", "La prenda es demasiado larga"), garments: TOPS, ask: SHORTER },
  { id: "pants-long", label: L("바지 길이가 길어요", "The trousers are too long", "El pantalón es demasiado largo"), garments: PANTS, ask: SHORTER },
  { id: "skirt-long", label: L("치마 길이가 길어요", "The skirt is too long", "La falda es demasiado larga"), garments: ["skirt", "a-line-skirt"], ask: SHORTER },
  {
    id: "waist-loose",
    label: L("허리가 헐렁해요", "The waist is too loose", "La cintura me queda floja"),
    garments: WAISTED,
    ask: L("허리 둘레로 줄이고 싶은 길이", "How much to take off the waist, all round", "Cuánto reducir el contorno de cintura"),
  },
  { id: "body-tight", label: L("가슴이나 몸판이 끼어요", "It's tight across the chest or body", "Me queda justo de pecho o de cuerpo"), garments: TOPS },
  { id: "sleeve-short", label: L("소매가 짧아요", "The sleeves are too short", "Las mangas son demasiado cortas"), garments: TOPS, ask: LONGER },
  { id: "body-short", label: L("옷 길이가 짧아요", "The top is too short", "La prenda es demasiado corta"), garments: TOPS, ask: LONGER },
  { id: "pants-short", label: L("바지 길이가 짧아요", "The trousers are too short", "El pantalón es demasiado corto"), garments: PANTS, ask: LONGER },
  {
    id: "body-loose",
    label: L("몸판이 너무 커요", "The body is too big", "El cuerpo me queda demasiado grande"),
    garments: TOPS,
    ask: L("가슴 단면으로 줄이고 싶은 폭", "How much to take off the chest, flat", "Cuánto quitar del pecho, en plano"),
  },
  {
    id: "shoulder-wide",
    label: L("어깨가 넓어서 처져요", "The shoulders are too wide and droop", "Los hombros son demasiado anchos y caen"),
    garments: TOPS,
    ask: L("줄이고 싶은 어깨너비", "How much narrower across the shoulders", "Cuánto estrechar los hombros"),
  },
  {
    id: "leg-wide",
    label: L("바지통이 너무 넓어요", "The legs are too wide", "Las perneras son demasiado anchas"),
    garments: PANTS,
    ask: L("밑단 단면으로 줄이고 싶은 폭", "How much to take off the leg opening, flat", "Cuánto quitar del bajo de la pierna, en plano"),
  },
  {
    id: "waist-tight",
    label: L("허리가 조여요", "The waist is too tight", "La cintura me aprieta"),
    garments: WAISTED,
    ask: L("허리 둘레로 늘리고 싶은 길이", "How much to add to the waist, all round", "Cuánto añadir al contorno de cintura"),
  },
];

export const COMPLAINT_IDS = COMPLAINTS.map((c) => c.id);

export interface Complaint {
  id: string; // a COMPLAINTS id, or "other"
  side?: "left" | "right" | "both";
  amountCm?: number; // typed by the wearer, or written in their words
  quote?: string; // the wearer's own words, when the complaint came from text
}

const SIDE = { left: L("왼쪽", "left", "izquierda"), right: L("오른쪽", "right", "derecha") } as const;
const OTHER = L("기타", "Other", "Otro");

// One complaint into an alteration, or a "talk to the tailor" item when no rule fits.
export function fromComplaint(garment: GarmentKind, c: Complaint): Alteration {
  const def = COMPLAINTS.find((d) => d.id === c.id);
  const a = c.amountCm !== undefined && c.amountCm > 0 ? c.amountCm : undefined;
  const label = def?.label ?? OTHER;
  const from = c.quote ? L(`적은 글 "${c.quote}"`, `Your words "${c.quote}"`, `Lo que escribiste "${c.quote}"`) : L(`고른 것 "${label.ko}"`, `You picked "${label.en}"`, `Elegiste "${label.es}"`);
  const id = `say-${c.id}`;
  const measureFirst = (what: Local) =>
    L(`${jo(what.ko, "을")} 재서 적어 주시면 길이가 들어갑니다. 아니면 수선집에서 잽니다.`, `Measure ${what.en} and enter it to get the amount; otherwise the tailor measures it.`, `Mide ${what.es} y anótalo para tener la medida; si no, la toma el taller.`);
  const join = (first: Local, then: Local) => L(`${first.ko} ${then.ko}`, `${first.en} ${then.en}`, `${first.es} ${then.es}`);
  const side = c.side && c.side !== "both" ? SIDE[c.side] : undefined;
  const shorten = (part: Local, hemOf: Local, action: Local, key: string, cuff = false): Alteration => ({
    id,
    from,
    part,
    action,
    amountCm: a,
    instruction: a
      ? cuff
        ? CUFF_SHORTEN(a)
        : L(`${jo(hemOf.ko, "을")} ${f(a)} cm 올려 다시 박습니다.`, `Turn the ${hemOf.en} up ${f(a)} cm and restitch.`, `Sube ${hemOf.es} ${f(a)} cm y vuelve a coserlo.`)
      : measureFirst(L("줄이고 싶은 길이", "how much shorter you want it", "cuánto quieres acortarlo")),
    difficulty: cuff ? "medium" : "easy",
    delta: a ? { [key]: -a } : undefined,
  });
  const HEM = L("밑단", "hem", "el bajo");
  // Let a hem down from its allowance; past what a ready-made hem has spare, add a band.
  const lengthen = (part: Local, hemOf: Local, key: string, spare: number, sleeve = false): Alteration => {
    const ok = a !== undefined && a <= spare;
    return {
      id,
      from,
      part,
      action: a && !ok
        ? sleeve ? L("소매에 커프스 덧달기", "Add a cuff band to the sleeves", "Añadir un puño a las mangas") : L("밑단에 덧단 달기", "Add a hem band", "Alargar el bajo con una tira")
        : sleeve ? L("소매 단 내리기", "Let the sleeve hems down", "Sacar el bajo de las mangas") : L("밑단 내리기", "Let the hem down", "Sacar el bajo"),
      amountCm: a,
      instruction: a
        ? ok
          ? L(
              `${jo(hemOf.ko, "을")} ${f(a)} cm 내려 다시 박습니다. 시접이 ${f(a)} cm 이상 남아 있는지 먼저 확인하십시오.`,
              `Let ${hemOf.en} down ${f(a)} cm and restitch. First check that at least ${f(a)} cm of hem allowance is left.`,
              `Saca ${hemOf.es} ${f(a)} cm y vuelve a coserlo. Comprueba antes que queden al menos ${f(a)} cm de dobladillo.`,
            )
          : L(
              `${f(a)} cm 길어져야 합니다. 기성복 시접으로는 보통 ${f(spare)} cm까지라, 같은 천이나 어울리는 천으로 ${sleeve ? "소매 끝에 커프스를" : "밑단에 덧단을"} 덧답니다.`,
              `It needs to be ${f(a)} cm longer. A ready-made hem usually has only ${f(spare)} cm to spare, so add ${sleeve ? "a cuff band to the sleeve ends" : "a band to the hem"}, in the same or a matching fabric.`,
              `Debe quedar ${f(a)} cm más largo. Un bajo de confección suele dar solo ${f(spare)} cm, así que añade ${sleeve ? "un puño al final de las mangas" : "una tira al bajo"}, de la misma tela o una que combine.`,
            )
        : measureFirst(L("늘리고 싶은 길이", "how much longer you want it", "cuánto quieres alargarlo")),
      difficulty: a && !ok ? "hard" : "easy",
      delta: a ? { [key]: a } : undefined,
    };
  };

  switch (c.id) {
    case "seat-back-drops": {
      const amt = a ?? BACK_RISE_DEFAULT;
      return {
        id,
        from,
        part: L("뒤 밑위", "Back rise", "Tiro trasero"),
        action: L("뒤 밑위 늘리기", "Raise the back rise", "Subir el tiro trasero"),
        amountCm: amt,
        instruction: a
          ? L(
              `뒤 허리에 곡선 덧단을 넣어 뒤 밑위를 ${f(amt)} cm 늘립니다. 앞은 그대로 둡니다.`,
              `Add a curved insert at the back waist to raise the back rise by ${f(amt)} cm. Leave the front as it is.`,
              `Añade una pieza curva en la cintura trasera para subir el tiro trasero ${f(amt)} cm. Deja el delantero como está.`,
            )
          : L(
              `뒤 허리에 곡선 덧단을 넣어 뒤 밑위를 늘립니다. 휠체어용으로 나온 기성 바지는 뒤를 약 ${f(amt)} cm 높여 만듭니다. 앉아서 내려가는 길이를 재면 그 값으로 바꿉니다.`,
              `Add a curved insert at the back waist to raise the back rise. Ready-made wheelchair trousers are cut about ${f(amt)} cm higher at the back. Measure how far it drops when you sit to use your own amount.`,
              `Añade una pieza curva en la cintura trasera para subir el tiro trasero. Los pantalones hechos para silla de ruedas llevan la espalda unos ${f(amt)} cm más alta. Mide cuánto baja al sentarte para usar tu propia medida.`,
            ),
        difficulty: "hard",
        delta: { backRiseExtra: amt },
      };
    }
    case "seat-front-bunches":
      return {
        id,
        from,
        part: L("앞 밑위", "Front rise", "Tiro delantero"),
        action: L("앞 밑위 줄이기", "Lower the front rise", "Bajar el tiro delantero"),
        amountCm: a,
        instruction: a
          ? L(
              `앞 허리선을 앞중심에서 ${f(a)} cm 내려 앞 밑위를 줄입니다. 고무줄 허리는 옆선부터 앞중심까지 앞 고무줄만 ${f(a)} cm 낮춰 박고, 뒤는 그대로 둡니다.`,
              `Lower the front waistline ${f(a)} cm at centre front to shorten the front rise. On an elastic waist, restitch only the front elastic ${f(a)} cm lower, from the side seams to centre front, and leave the back as it is.`,
              `Baja la cintura ${f(a)} cm en el centro delantero para acortar el tiro delantero. En cintura elástica, cose solo el elástico delantero ${f(a)} cm más abajo, de las costuras laterales al centro delantero, y deja la espalda como está.`,
            )
          : join(
              L(
                "앞 허리선을 앞중심에서 내려 앞 밑위를 줄입니다. 고무줄 허리는 앞 고무줄만 낮춰 박습니다.",
                "Lower the front waistline at centre front to shorten the front rise. On an elastic waist, restitch only the front elastic lower.",
                "Baja la cintura en el centro delantero para acortar el tiro delantero. En cintura elástica, cose solo el elástico delantero más abajo.",
              ),
              measureFirst(L("앉아서 접히는 천의 높이", "the height of the fold when you sit", "la altura del pliegue al sentarte")),
            ),
        difficulty: "medium",
      };
    case "seat-presses":
      return {
        id,
        from,
        part: L("뒷주머니·리벳", "Back pockets, rivets", "Bolsillos traseros, remaches"),
        action: L("뒷주머니·리벳 떼기", "Remove back pockets and rivets", "Quitar bolsillos traseros y remaches"),
        instruction: L(
          "뒷주머니와 리벳을 떼고 자국을 정리합니다. 주머니가 필요하면 허벅지 옆으로 옮겨 답니다.",
          "Remove the back pockets and rivets and tidy the marks. If you need a pocket, move it to the side of the thigh.",
          "Quita los bolsillos traseros y los remaches y repasa las marcas. Si necesitas un bolsillo, pásalo al lateral del muslo.",
        ),
        difficulty: "easy",
      };
    case "seat-hem-short": {
      const ok = a !== undefined && a <= HEM_SPARE.pants;
      return {
        id,
        from,
        part: L("밑단", "Hem", "Bajo"),
        action: a && !ok ? L("밑단에 덧단 달기", "Add a hem extension", "Alargar el bajo con una tira") : L("밑단 내리기", "Let the hem down", "Sacar el bajo"),
        amountCm: a,
        instruction: a
          ? ok
            ? L(
                `밑단 시접을 ${f(a)} cm 내려 다시 박습니다. 시접이 ${f(a)} cm 이상 남아 있는지 먼저 확인하십시오.`,
                `Let the hem down ${f(a)} cm and restitch. First check that at least ${f(a)} cm of hem allowance is left.`,
                `Saca el bajo ${f(a)} cm y vuelve a coserlo. Comprueba antes que queden al menos ${f(a)} cm de dobladillo.`,
              )
            : L(
                `밑단이 ${f(a)} cm 더 내려와야 합니다. 시접으로는 ${f(HEM_SPARE.pants)} cm까지라 밑단에 덧단을 답니다.`,
                `The hem needs to come ${f(a)} cm lower. The hem allowance gives only ${f(HEM_SPARE.pants)} cm, so add an extension band to the hem.`,
                `El bajo debe bajar ${f(a)} cm. El dobladillo solo da ${f(HEM_SPARE.pants)} cm, así que alárgalo con una tira.`,
              )
          : join(
              L("밑단을 내립니다. 무릎을 90도로 굽혀 앉은 채 재야 합니다.", "Let the hem down. Measure it seated, with the knee bent at 90°.", "Saca el bajo. Mídelo en posición sentada, con la rodilla doblada a 90°."),
              measureFirst(L("더 내려와야 하는 길이", "how much lower it should come", "cuánto más debe bajar")),
            ),
        difficulty: a && !ok ? "hard" : "medium",
        delta: a ? { outseam: a } : undefined,
      };
    }
    case "cast-leg": {
      const open = a !== undefined ? a + CAST_MARGIN : undefined;
      const sk = side ? `${side.ko} ` : "", se = side ? `${side.en} ` : "", ss = side ? ` ${side.es}` : "";
      return {
        id,
        from,
        part: L(`${sk}바지 옆선`, side ? `${side.en[0].toUpperCase()}${side.en.slice(1)} outseam` : "Outseam", `Costura lateral${ss}`),
        side: c.side ?? "both",
        action: L("옆선 트임 + 스냅", "Open the outseam, add snaps", "Abertura lateral con broches"),
        amountCm: open,
        instruction: open
          ? L(
              `${sk}바지 옆선을 밑단에서 위로 ${f(open)} cm 뜯고 (깁스 ${f(a!)} cm + 여유 ${f(CAST_MARGIN)} cm), 큰 스냅으로 여밉니다. 손을 쓰기 불편하면 고리가 큰 지퍼로 답니다. 깁스를 푼 뒤 다시 박아 되돌릴 수 있습니다.`,
              `Unpick the ${se}outseam ${f(open)} cm up from the hem (cast ${f(a!)} cm + ${f(CAST_MARGIN)} cm ease) and close it with large snaps. If using your hands is hard, use a zip with a large pull instead. Once the cast is off, it can be sewn shut again.`,
              `Descose la costura lateral${ss} ${f(open)} cm desde el bajo (escayola ${f(a!)} cm + ${f(CAST_MARGIN)} cm de holgura) y ciérrala con broches grandes. Si te cuesta usar las manos, pon una cremallera con tirador grande. Cuando quites la escayola, se puede volver a coser.`,
            )
          : join(
              L(
                `${sk}바지 옆선을 밑단에서 위로 뜯고 큰 스냅으로 여밉니다. 깁스 높이에 ${f(CAST_MARGIN)} cm를 더한 만큼 뜯습니다.`,
                `Unpick the ${se}outseam up from the hem and close it with large snaps. Open it to the cast's height plus ${f(CAST_MARGIN)} cm.`,
                `Descose la costura lateral${ss} desde el bajo y ciérrala con broches grandes. Ábrela hasta la altura de la escayola más ${f(CAST_MARGIN)} cm.`,
              ),
              measureFirst(L("깁스 높이", "the cast's height", "la altura de la escayola")),
            ),
        difficulty: "medium",
        reversible: true,
      };
    }
    case "hard-pull-up":
      return {
        id,
        from,
        part: L("허리단 안쪽", "Inside the waistband", "Interior de la cinturilla"),
        action: L("당김 고리 달기", "Add pull loops", "Poner presillas para tirar"),
        instruction: L(
          "허리단 안쪽 양옆과 뒤에 손목이 들어가는 당김 고리를 답니다.",
          "Sew pull loops wide enough for a wrist inside the waistband, at both sides and at the back.",
          "Cose por dentro de la cinturilla, a los lados y en la espalda, presillas donde quepa la muñeca.",
        ),
        difficulty: "easy",
        reversible: true,
      };
    case "seat-top-bunches":
      return {
        id,
        from,
        part: L("앞 밑단", "Front hem", "Bajo delantero"),
        action: L("앞자락만 줄이기", "Shorten the front only", "Acortar solo el delantero"),
        amountCm: a,
        instruction: a
          ? L(
              `앞 밑단만 ${f(a)} cm 올리고 옆선에서 뒤 밑단으로 곡선으로 이어 박습니다. 뒤판은 그대로 둡니다.`,
              `Raise only the front hem by ${f(a)} cm and curve it into the back hem at the side seams. Leave the back as it is.`,
              `Sube solo el bajo delantero ${f(a)} cm y únelo en curva con el bajo trasero en los costados. Deja la espalda como está.`,
            )
          : join(
              L("앞 밑단만 올리고 뒤판은 그대로 둡니다.", "Raise only the front hem and leave the back as it is.", "Sube solo el bajo delantero y deja la espalda como está."),
              measureFirst(L("앉았을 때 남는 앞자락 길이", "how much front hem is left over when you sit", "cuánto sobra del delantero al sentarte")),
            ),
        difficulty: "medium",
      };
    case "elbows-wear":
      return {
        id,
        from,
        part: L("팔꿈치", "Elbows", "Codos"),
        action: L("팔꿈치 덧댐", "Elbow patches", "Coderas"),
        instruction: L(
          "소매 팔꿈치 안쪽이나 바깥에 질긴 천을 덧댑니다. 떼어 낼 수 있게 달면 바꿔 달 수 있습니다.",
          "Patch the elbows with a sturdy fabric, inside or outside. Attached so they come off, the patches can be replaced.",
          "Pon coderas de tela resistente, por dentro o por fuera. Si las pones desmontables, podrás cambiarlas.",
        ),
        difficulty: "easy",
        reversible: true,
      };
    case "crutch-underarm":
      return {
        id,
        from,
        part: L("겨드랑이", "Underarms", "Axilas"),
        action: L("겨드랑이 덧댐", "Underarm patches", "Refuerzo en las axilas"),
        instruction: L("겨드랑이 안쪽에 부드러운 천을 덧대거나 거셋을 넣습니다.", "Line the underarms with a soft fabric patch, or set in a gusset.", "Refuerza las axilas por dentro con una tela suave o pon una cuña (escudete)."),
        difficulty: "medium",
      };
    case "hard-fasten": {
      const top = TOP_GARMENTS.includes(garment);
      return {
        id,
        from,
        part: L("여밈", "Fastening", "Cierre"),
        action: top ? L("자석 단추로 바꾸기", "Switch to magnetic buttons", "Cambiar a botones imantados") : L("큰 당김 고리와 후크", "Large zip pull and a hook", "Tirador grande y corchete"),
        instruction: top
          ? L("단추를 자석 단추로 바꾸고, 지퍼에는 큰 당김 고리를 답니다.", "Replace the buttons with magnetic ones, and add a large pull to any zip.", "Cambia los botones por botones imantados y pon un tirador grande en la cremallera.")
          : L("지퍼에 큰 당김 고리를 달고, 허리 단추를 후크로 바꿉니다.", "Add a large pull to the zip and replace the waist button with a hook and bar.", "Pon un tirador grande en la cremallera y cambia el botón de la cintura por un corchete."),
        difficulty: "medium",
        reversible: true,
      };
    }
    case "sleeve-long":
      return shorten(L("소매", "Sleeves", "Mangas"), L("소매", "sleeve hems", "el bajo de las mangas"), L("소매 줄이기", "Shorten the sleeves", "Acortar las mangas"), "sleeve", garment === "shirt");
    case "body-long":
    case "skirt-long":
      return shorten(L("밑단", "Hem", "Bajo"), HEM, L("밑단 줄이기", "Shorten the hem", "Acortar el bajo"), "length");
    case "pants-long":
      return shorten(L("밑단", "Hem", "Bajo"), HEM, L("밑단 줄이기", "Shorten the hem", "Acortar el bajo"), "outseam");
    case "waist-loose":
      return {
        id,
        from,
        part: L("허리", "Waist", "Cintura"),
        action: L("고무줄 줄이기", "Shorten the elastic", "Acortar el elástico"),
        amountCm: a,
        instruction: a
          ? L(`허리 고무줄을 ${f(a)} cm 짧게 다시 끼웁니다.`, `Rethread the waist elastic ${f(a)} cm shorter.`, `Vuelve a pasar el elástico de la cintura ${f(a)} cm más corto.`)
          : join(
              L("허리 고무줄을 허리에 맞춰 짧게 다시 끼웁니다.", "Rethread the waist elastic shorter, to fit.", "Vuelve a pasar el elástico de la cintura más corto, a tu medida."),
              measureFirst(L("줄이고 싶은 허리 둘레", "how much to take off the waist", "cuánto quieres reducir la cintura")),
            ),
        difficulty: "easy",
        reversible: true,
      };
    case "body-tight":
      return {
        id,
        from,
        part: L("몸판", "Body", "Cuerpo"),
        action: L("옆선 늘리기", "Let out the side seams", "Sacar las costuras laterales"),
        instruction: L(
          `양 옆선 시접을 풀어 늘립니다. 시접으로는 단면 ${f(LET_OUT_FLAT)} cm까지이고, 그보다 끼면 옆선에 덧천을 넣거나 한 치수 큰 패턴으로 만듭니다. 몸 치수를 넣으면 늘릴 길이가 계산됩니다.`,
          `Let out both side seams. The seam allowance gives up to ${f(LET_OUT_FLAT)} cm flat; if it is tighter than that, add panels at the side seams or make a pattern one size up. Enter body measurements to get the amount.`,
          `Saca ambas costuras laterales. El margen de costura da hasta ${f(LET_OUT_FLAT)} cm en plano; si queda más justo, añade piezas en los costados o haz un patrón una talla más grande. Introduce las medidas del cuerpo para calcular cuánto.`,
        ),
        difficulty: "medium",
      };
    case "sleeve-short":
      return lengthen(L("소매", "Sleeves", "Mangas"), L("소매 단", "the sleeve hems", "el bajo de las mangas"), "sleeve", HEM_SPARE.top, true);
    case "body-short":
      return lengthen(L("밑단", "Hem", "Bajo"), L("밑단", "the hem", "el bajo"), "length", HEM_SPARE.top);
    case "pants-short":
      return lengthen(L("밑단", "Hem", "Bajo"), L("밑단", "the hem", "el bajo"), "outseam", HEM_SPARE.pants);
    case "body-loose": {
      const big = a !== undefined && a > BIG_TAKE_IN;
      return {
        id,
        from,
        part: L("옆선", "Side seams", "Costuras laterales"),
        action: L("옆선 줄이기", "Take in the side seams", "Meter las costuras laterales"),
        amountCm: a,
        instruction: a
          ? big
            ? L(
                `양 옆선을 ${f(a / 2)} cm씩, 단면 ${f(a)} cm 줄입니다. ${f(BIG_TAKE_IN)} cm가 넘으면 진동둘레가 작아지므로 소매 밑선도 같이 줄여 진동을 다시 맞춥니다.`,
                `Take in each side seam ${f(a / 2)} cm, ${f(a)} cm flat. Past ${f(BIG_TAKE_IN)} cm the armhole gets smaller, so take in the sleeve seam too and match the armhole again.`,
                `Mete cada costura lateral ${f(a / 2)} cm, ${f(a)} cm en plano. A partir de ${f(BIG_TAKE_IN)} cm la sisa se reduce, así que mete también la costura de la manga y vuelve a casar la sisa.`,
              )
            : L(
                `양 옆선을 ${f(a / 2)} cm씩, 단면 ${f(a)} cm 줄입니다. 겨드랑이에서 밑단까지 고르게 줄입니다.`,
                `Take in each side seam ${f(a / 2)} cm, ${f(a)} cm flat, evenly from the underarm to the hem.`,
                `Mete cada costura lateral ${f(a / 2)} cm, ${f(a)} cm en plano, por igual de la axila al bajo.`,
              )
          : join(
              L("양 옆선을 같은 폭으로 줄입니다.", "Take in both side seams by the same amount.", "Mete las dos costuras laterales lo mismo."),
              measureFirst(L("줄이고 싶은 가슴 단면 폭", "how much to take off the chest, flat", "cuánto quitar del pecho, en plano")),
            ),
        difficulty: big ? "hard" : "medium",
        delta: a ? { chest: -a } : undefined,
      };
    }
    case "shoulder-wide":
      return {
        id,
        from,
        part: L("어깨", "Shoulders", "Hombros"),
        action: L("어깨너비 줄이기", "Narrow the shoulders", "Estrechar los hombros"),
        amountCm: a,
        instruction: a
          ? L(
              `소매를 떼고 진동선을 어깨 끝에서 ${f(a / 2)} cm씩 안으로 옮겨 그린 뒤, 소매를 다시 답니다. 어깨너비가 ${f(a)} cm 줄어듭니다.`,
              `Take the sleeves off, redraw the armhole seam ${f(a / 2)} cm in from each shoulder point and set the sleeves back in. The shoulders come in ${f(a)} cm.`,
              `Descose las mangas, traza de nuevo la sisa ${f(a / 2)} cm hacia dentro desde cada punta de hombro y vuelve a montar las mangas. Los hombros se estrechan ${f(a)} cm.`,
            )
          : join(
              L("소매를 떼고 진동선을 어깨 끝에서 안으로 옮겨 그린 뒤, 소매를 다시 답니다.", "Take the sleeves off, redraw the armhole seam in from the shoulder points and set the sleeves back in.", "Descose las mangas, traza la sisa más hacia dentro desde las puntas de hombro y vuelve a montar las mangas."),
              measureFirst(L("줄이고 싶은 어깨너비", "how much narrower you want the shoulders", "cuánto quieres estrechar los hombros")),
            ),
        difficulty: "hard",
        delta: a ? { shoulder: -a } : undefined,
      };
    case "leg-wide":
      return {
        id,
        from,
        part: L("바지 안솔기", "Inseam", "Entrepierna"),
        action: L("바지통 줄이기", "Taper the legs", "Estrechar las perneras"),
        amountCm: a,
        instruction: a
          ? L(
              `안솔기를 밑단에서 ${f(a)} cm 줄이고, 무릎 위에서 원래 선으로 자연스럽게 이어 박습니다. 밑단 단면이 ${f(a)} cm 좁아집니다.`,
              `Take in the inseam ${f(a)} cm at the hem and blend it back into the original line above the knee. The leg opening comes in ${f(a)} cm flat.`,
              `Mete la entrepierna ${f(a)} cm en el bajo y únela suavemente con la línea original por encima de la rodilla. El bajo se estrecha ${f(a)} cm en plano.`,
            )
          : join(
              L("안솔기를 밑단 쪽에서 줄이고, 무릎 위에서 원래 선으로 이어 박습니다.", "Take in the inseam at the hem and blend it into the original line above the knee.", "Mete la entrepierna en el bajo y únela con la línea original por encima de la rodilla."),
              measureFirst(L("줄이고 싶은 밑단 단면 폭", "how much to take off the leg opening, flat", "cuánto quitar del bajo, en plano")),
            ),
        difficulty: "medium",
        delta: a ? { legOpening: -a } : undefined,
      };
    case "waist-tight":
      return {
        id,
        from,
        part: L("허리", "Waist", "Cintura"),
        action: L("고무줄 늘리기", "Lengthen the elastic", "Alargar el elástico"),
        amountCm: a,
        instruction: a
          ? L(`허리 고무줄을 ${f(a)} cm 길게 다시 끼웁니다.`, `Rethread the waist elastic ${f(a)} cm longer.`, `Vuelve a pasar el elástico de la cintura ${f(a)} cm más largo.`)
          : join(
              L("허리 고무줄을 허리에 맞춰 길게 다시 끼웁니다.", "Rethread the waist elastic longer, to fit.", "Vuelve a pasar el elástico de la cintura más largo, a tu medida."),
              measureFirst(L("늘리고 싶은 허리 둘레", "how much to add to the waist", "cuánto quieres añadir a la cintura")),
            ),
        difficulty: "easy",
        reversible: true,
      };
    default:
      return {
        id,
        from,
        part: OTHER,
        action: L("수선집과 상의", "Talk it over with a tailor", "Consultar en el taller de arreglos"),
        instruction: L(
          "옷을 입은 채 수선집에 보여 주고 어디를 어떻게 고칠지 상의하십시오.",
          "Wear the garment to a tailor and decide together what to change and how.",
          "Lleva la prenda puesta al taller de arreglos y decide allí qué cambiar y cómo.",
        ),
        difficulty: "medium",
      };
  }
}

const UNCHECKED = L("길이는 수선집에서 재서 정합니다.", "The tailor measures and sets the amount.", "El taller mide y decide la medida.");

// Every number a sentence may carry: the amounts and the constants above. When a sentence in any
// language carries any other number, all three are replaced, so nothing unchecked reaches the sheet.
// The wearer's quoted words are theirs and are not checked.
export function guarded(a: Alteration, extra: readonly number[] = []): Alteration {
  const base = [a.amountCm ?? 0, LET_OUT_FLAT, HEM_SPARE.top, HEM_SPARE.pants, BIG_TAKE_IN, BACK_RISE_DEFAULT, CAST_MARGIN, 90, ...extra];
  const allowed = base.flatMap((x) => [x, x / 2, 2 * x, x - CAST_MARGIN]).map((x) => Math.round(x * 10) / 10);
  if (LANGS.every((l) => guardNumbers(a.instruction[l], allowed))) return a;
  return { ...a, instruction: UNCHECKED, amountCm: undefined, delta: undefined };
}

// Alterations that touch the same measurement: the later one wins in the pattern delta.
export function patternDelta(alterations: readonly Alteration[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of alterations) for (const [k, v] of Object.entries(a.delta ?? {})) out[k] = v;
  return out;
}

export const complaintsFor = (garment: GarmentKind) => COMPLAINTS.filter((c) => c.garments.includes(garment) && WORN.includes(garment));
