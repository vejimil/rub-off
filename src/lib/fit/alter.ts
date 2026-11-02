// Alteration instructions for a garment you own, from two inputs: the body it should fit (body.ts
// turns tape measurements into target garment sizes) and what the wearer says is wrong, picked
// from a list or written in their own words (Muse Spark only sorts the words into this list; see
// read-complaint.ts). Every amount is a difference the code computed, a number the wearer typed or
// a rule constant below; every sentence is a template filled by code and passed through the number
// guard. Seated-fit rules come from the research in Seated Tailor's docs/RULES-RESEARCH.md
// ([V] read at source, [E] estimate); [A] constants are drafted by Claude for the owner to confirm.
// Fit and comfort only: nothing here is health advice.

import type { GarmentKind } from "../pattern/types.ts";
import { MEASURE_KO } from "../pattern/measures.ts";
import { tolerance, SIZE_KEYS, type SizeKey } from "../rules/fit-tolerance.ts";
import { guardNumbers } from "../rules/numbers.ts";
import type { Fabric } from "../pattern/types.ts";
import type { Target } from "./body.ts";

export type Difficulty = "easy" | "medium" | "hard";

export interface Alteration {
  id: string;
  partKo: string;
  actionKo: string; // the short name: "옆선 줄이기"
  instructionKo: string; // what the tailor does, with the amounts
  amountCm?: number;
  difficulty: Difficulty;
  reversible?: boolean;
  side?: "left" | "right" | "both"; // the wearer's side, for marks on one side only
  // How the measurements change if the pattern is drafted with this alteration (flat cm).
  delta?: Record<string, number>;
  fromKo: string; // why: "몸 치수: 가슴둘레", "선택: …", "글: '…'"
}

export const DIFFICULTY_KO: Record<Difficulty, string> = { easy: "쉬움", medium: "보통", hard: "어려움" };

// [A] What a ready-made garment usually has to spare, cm.
export const LET_OUT_FLAT = 1; // side seams let out: 0.5 cm each side, so 1 cm flat, 2 cm around
export const HEM_SPARE = { top: 2, pants: 3 }; // hem allowance that can be let down
const BIG_TAKE_IN = 4; // flat; past this the armhole and sleeve need reshaping too
// [V] Ag Apparel's seated jeans add about 5 cm at the back; curved inserts are 5–7.5 cm.
export const BACK_RISE_DEFAULT = 5;
// [E] Seated Tailor: open the outseam to the cast's top plus this margin.
export const CAST_MARGIN = 5;

const half = (x: number) => Math.round(x * 2) / 2;
// The particle that fits the word's last syllable: 을/를, 이/가.
export function jo(word: string, p: "을" | "이"): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  const batchim = c >= 0 && c < 11172 && c % 28 !== 0;
  return word + (p === "을" ? (batchim ? "을" : "를") : batchim ? "이" : "가");
}
const f = (x: number) => (Math.round(x * 10) / 10).toString();
const TOP_GARMENTS: readonly GarmentKind[] = ["shirt", "t-shirt", "hoodie"];

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

// What to change so the garment meets the body. One alteration per measurement that misses.
export function fromBody(garment: GarmentKind, comparisons: Comparison[]): Alteration[] {
  const top = TOP_GARMENTS.includes(garment);
  const out: Alteration[] = [];
  for (const c of comparisons) {
    if (c.verdict === "fits") continue;
    const amt = Math.abs(c.diff);
    const name = MEASURE_KO[c.key] ?? c.key;
    const fromKo = `몸 치수 ${c.target.howKo}`;
    const base = { id: `body-${c.key}`, amountCm: amt, delta: { [c.key]: c.diff }, fromKo };
    if (WIDTHS.includes(c.key)) {
      if (c.key === "waist" && garment === "pants") {
        out.push({
          ...base,
          partKo: "허리",
          ...(c.verdict === "big"
            ? { actionKo: "고무줄 줄이기", instructionKo: `허리 고무줄을 ${f(2 * amt)} cm 짧게 다시 끼웁니다 (단면 ${f(amt)} cm).`, difficulty: "easy" as const, reversible: true }
            : { actionKo: "고무줄 늘리기", instructionKo: `허리 고무줄을 ${f(2 * amt)} cm 길게 바꿉니다 (단면 ${f(amt)} cm). 허리단 천이 모자라면 고무줄만으로는 안 됩니다.`, difficulty: "easy" as const, reversible: true }),
        });
        continue;
      }
      const where = c.key === "bicep" ? "소매 밑선" : c.key === "thigh" || c.key === "legOpening" ? "안솔기와 옆선" : "양 옆선";
      if (c.verdict === "big") {
        const big = amt > BIG_TAKE_IN && (c.key === "chest" || c.key === "hip");
        out.push({
          ...base,
          partKo: name,
          actionKo: `${where} 줄이기`,
          instructionKo: `${jo(name, "을")} 단면 ${f(amt)} cm (둘레 ${f(2 * amt)} cm) 줄입니다: ${jo(where, "을")} 각각 ${f(amt / 2)} cm씩 안으로 새로 박습니다.${big ? ` ${BIG_TAKE_IN} cm보다 크게 줄이면 ${top ? "진동과 소매" : "밑위 곡선"}도 같이 고쳐야 합니다.` : ""}`,
          difficulty: big ? "hard" : "easy",
        });
      } else {
        const ok = amt <= LET_OUT_FLAT;
        out.push({
          ...base,
          partKo: name,
          actionKo: ok ? `${where} 늘리기` : `${where}에 덧천 넣기`,
          instructionKo: ok
            ? `${jo(name, "을")} 단면 ${f(amt)} cm (둘레 ${f(2 * amt)} cm) 늘립니다: ${where} 시접을 각각 ${f(amt / 2)} cm씩 풀어 박습니다. 시접이 그만큼 남아 있는지 먼저 확인하십시오.`
            : `${jo(name, "이")} 단면 ${f(amt)} cm 모자랍니다. 시접으로 늘릴 수 있는 건 단면 ${f(LET_OUT_FLAT)} cm까지라, ${where}에 덧천(무)을 넣거나 새 패턴으로 만드는 편이 낫습니다.`,
          difficulty: ok ? "medium" : "hard",
        });
      }
      continue;
    }
    if (c.key === "shoulder") {
      out.push({
        ...base,
        partKo: "어깨",
        actionKo: c.verdict === "big" ? "어깨 줄이기" : "어깨 (늘릴 수 없음)",
        instructionKo:
          c.verdict === "big"
            ? `어깨너비를 ${f(amt)} cm 줄입니다: 소매를 떼고 양쪽 어깨끝을 ${f(amt / 2)} cm씩 안으로 옮겨 진동을 다시 그린 뒤 소매를 답니다.`
            : `어깨너비가 ${f(amt)} cm 좁습니다. 어깨는 늘릴 수 없어 새 패턴으로 만드는 편이 낫습니다.`,
        difficulty: "hard",
      });
      continue;
    }
    // Lengths: sleeve, outseam, front rise.
    if (c.key === "frontRise") {
      out.push({
        ...base,
        partKo: "밑위",
        actionKo: c.verdict === "big" ? "밑위 줄이기" : "밑위 늘리기",
        instructionKo: `앞밑위가 ${f(amt)} cm ${c.verdict === "big" ? "깁니다" : "짧습니다"}. 허리단을 떼고 허리선을 ${f(amt)} cm ${c.verdict === "big" ? "내려" : "올려(덧단)"} 다시 답니다.`,
        difficulty: "hard",
      });
      continue;
    }
    const spare = garment === "pants" ? HEM_SPARE.pants : HEM_SPARE.top;
    const part = c.key === "sleeve" ? "소매" : "밑단";
    const cuff = c.key === "sleeve" && garment === "shirt";
    if (c.verdict === "big") {
      out.push({
        ...base,
        partKo: part,
        actionKo: `${name} 줄이기`,
        instructionKo: cuff ? `커프스를 떼고 소매를 ${f(amt)} cm 잘라 커프스를 다시 답니다.` : `${jo(part, "을")} ${f(amt)} cm 올려 다시 박습니다.`,
        difficulty: cuff ? "medium" : "easy",
      });
    } else {
      const ok = amt <= spare;
      out.push({
        ...base,
        partKo: part,
        actionKo: ok ? `${name} 늘리기` : `${part}에 덧단 달기`,
        instructionKo: ok ? `${part} 시접을 ${f(amt)} cm 내려 다시 박습니다. 시접이 ${f(amt)} cm 이상 남아 있는지 먼저 확인하십시오.` : `${jo(name, "이")} ${f(amt)} cm 모자랍니다. 시접으로는 ${f(spare)} cm까지라 ${part}에 덧단을 답니다.`,
        difficulty: ok ? "medium" : "hard",
      });
    }
  }
  return out;
}

// ---------- complaints ----------

export interface ComplaintDef {
  id: string;
  ko: string; // as the wearer would say it
  garments: readonly GarmentKind[];
  seated?: boolean; // from the seated-fit research
  askKo?: string; // the one number this rule can use, typed by the wearer
}

const PANTS: readonly GarmentKind[] = ["pants"];
const TOPS = TOP_GARMENTS;
const WAISTED: readonly GarmentKind[] = ["pants", "skirt"];
export const WORN: readonly GarmentKind[] = ["shirt", "t-shirt", "hoodie", "pants", "skirt"];

export const COMPLAINTS: readonly ComplaintDef[] = [
  { id: "seat-back-drops", ko: "휠체어에 앉으면 바지 뒤 허리가 내려가요", garments: PANTS, seated: true, askKo: "앉았을 때 뒤 허리가 내려가는 길이" },
  { id: "seat-front-bunches", ko: "앉으면 배 앞에 천이 뭉쳐요", garments: PANTS, seated: true, askKo: "앉아서 앞에 접히는 천의 높이" },
  { id: "seat-presses", ko: "앉으면 뒷주머니나 리벳이 배겨요", garments: PANTS, seated: true },
  { id: "seat-hem-short", ko: "앉으면 바지 밑단이 짧아져요", garments: PANTS, seated: true, askKo: "앉았을 때 밑단이 더 내려와야 하는 길이" },
  { id: "cast-leg", ko: "깁스나 보조기 때문에 바짓단이 안 들어가요", garments: PANTS, seated: true, askKo: "발바닥부터 깁스 위 끝까지 높이" },
  { id: "hard-pull-up", ko: "앉은 채로 바지를 끌어올리기 힘들어요", garments: PANTS, seated: true },
  { id: "seat-top-bunches", ko: "앉으면 상의 앞자락이 무릎 위에 뭉쳐요", garments: TOPS, seated: true, askKo: "앉았을 때 앞자락이 남는 길이" },
  { id: "elbows-wear", ko: "휠체어 바퀴를 밀다 보니 팔꿈치가 닳아요", garments: ["shirt", "hoodie"], seated: true },
  { id: "crutch-underarm", ko: "목발 때문에 겨드랑이가 쓸려요", garments: TOPS, seated: true },
  { id: "hard-fasten", ko: "단추나 지퍼를 여닫기 어려워요", garments: ["shirt", "hoodie", "pants"], seated: true },
  { id: "sleeve-long", ko: "소매가 길어요", garments: ["shirt", "hoodie", "t-shirt"], askKo: "줄이고 싶은 길이" },
  { id: "body-long", ko: "옷 길이가 길어요", garments: TOPS, askKo: "줄이고 싶은 길이" },
  { id: "pants-long", ko: "바지 길이가 길어요", garments: PANTS, askKo: "줄이고 싶은 길이" },
  { id: "skirt-long", ko: "치마 길이가 길어요", garments: ["skirt"], askKo: "줄이고 싶은 길이" },
  { id: "waist-loose", ko: "허리가 헐렁해요", garments: WAISTED, askKo: "허리 둘레로 줄이고 싶은 길이" },
  { id: "body-tight", ko: "가슴이나 몸판이 끼어요", garments: TOPS },
];

export const COMPLAINT_IDS = COMPLAINTS.map((c) => c.id);

export interface Complaint {
  id: string; // a COMPLAINTS id, or "other"
  side?: "left" | "right" | "both";
  amountCm?: number; // typed by the wearer, or written in their words
  quote?: string; // the wearer's own words, when the complaint came from text
}

const SIDE_KO = { left: "왼쪽", right: "오른쪽", both: "양쪽" } as const;

// One complaint into an alteration, or a "talk to the tailor" item when no rule fits.
export function fromComplaint(garment: GarmentKind, c: Complaint): Alteration {
  const def = COMPLAINTS.find((d) => d.id === c.id);
  const a = c.amountCm !== undefined && c.amountCm > 0 ? c.amountCm : undefined;
  const fromKo = c.quote ? `적은 글 "${c.quote}"` : `고른 것 "${def?.ko ?? "기타"}"`;
  const id = `say-${c.id}`;
  const measureFirst = (what: string) => `${jo(what, "을")} 재서 적어 주시면 길이가 들어갑니다. 아니면 수선집에서 잽니다.`;
  const side = c.side && c.side !== "both" ? `${SIDE_KO[c.side]} ` : "";
  const shorten = (part: string, key: string, cuff = false): Alteration => ({
    id,
    fromKo,
    partKo: part,
    actionKo: `${part} 줄이기`,
    amountCm: a,
    instructionKo: a ? (cuff ? `커프스를 떼고 소매를 ${f(a)} cm 잘라 커프스를 다시 답니다.` : `${jo(part, "을")} ${f(a)} cm 올려 다시 박습니다.`) : measureFirst("줄이고 싶은 길이"),
    difficulty: cuff ? "medium" : "easy",
    delta: a ? { [key]: -a } : undefined,
  });

  switch (c.id) {
    case "seat-back-drops": {
      const amt = a ?? BACK_RISE_DEFAULT;
      return {
        id,
        fromKo,
        partKo: "뒤 밑위",
        actionKo: "뒤 밑위 늘리기",
        amountCm: amt,
        instructionKo: a
          ? `뒤 허리에 곡선 덧단을 넣어 뒤 밑위를 ${f(amt)} cm 늘립니다. 앞은 그대로 둡니다.`
          : `뒤 허리에 곡선 덧단을 넣어 뒤 밑위를 늘립니다. 휠체어용으로 나온 기성 바지는 뒤를 약 ${f(amt)} cm 높여 만듭니다. 앉아서 내려가는 길이를 재면 그 값으로 바꿉니다.`,
        difficulty: "hard",
        delta: { backRiseExtra: amt },
      };
    }
    case "seat-front-bunches":
      return {
        id,
        fromKo,
        partKo: "앞 밑위",
        actionKo: "앞 밑위 줄이기",
        amountCm: a,
        instructionKo: a
          ? `앞 허리선을 앞중심에서 ${f(a)} cm 내려 앞 밑위를 줄입니다. 고무줄 허리는 옆선부터 앞중심까지 앞 고무줄만 ${f(a)} cm 낮춰 박고, 뒤는 그대로 둡니다.`
          : `앞 허리선을 앞중심에서 내려 앞 밑위를 줄입니다. 고무줄 허리는 앞 고무줄만 낮춰 박습니다. ${measureFirst("앉아서 접히는 천의 높이")}`,
        difficulty: "medium",
      };
    case "seat-presses":
      return { id, fromKo, partKo: "뒷주머니·리벳", actionKo: "뒷주머니·리벳 떼기", instructionKo: "뒷주머니와 리벳을 떼고 자국을 정리합니다. 주머니가 필요하면 허벅지 옆으로 옮겨 답니다.", difficulty: "easy" };
    case "seat-hem-short": {
      const ok = a !== undefined && a <= HEM_SPARE.pants;
      return {
        id,
        fromKo,
        partKo: "밑단",
        actionKo: a && !ok ? "밑단에 덧단 달기" : "밑단 내리기",
        amountCm: a,
        instructionKo: a
          ? ok
            ? `밑단 시접을 ${f(a)} cm 내려 다시 박습니다. 시접이 ${f(a)} cm 이상 남아 있는지 먼저 확인하십시오.`
            : `밑단이 ${f(a)} cm 더 내려와야 합니다. 시접으로는 ${f(HEM_SPARE.pants)} cm까지라 밑단에 덧단을 답니다.`
          : `밑단을 내립니다. 무릎을 90도로 굽혀 앉은 채 재야 합니다. ${measureFirst("더 내려와야 하는 길이")}`,
        difficulty: a && !ok ? "hard" : "medium",
        delta: a ? { outseam: a } : undefined,
      };
    }
    case "cast-leg": {
      const open = a !== undefined ? a + CAST_MARGIN : undefined;
      return {
        id,
        fromKo,
        partKo: `${side}바지 옆선`,
        side: c.side ?? "both",
        actionKo: "옆선 트임 + 스냅",
        amountCm: open,
        instructionKo: open
          ? `${side}바지 옆선을 밑단에서 위로 ${f(open)} cm 뜯고 (깁스 ${f(a!)} cm + 여유 ${f(CAST_MARGIN)} cm), 큰 스냅으로 여밉니다. 손을 쓰기 불편하면 고리가 큰 지퍼로 답니다. 깁스를 푼 뒤 다시 박아 되돌릴 수 있습니다.`
          : `${side}바지 옆선을 밑단에서 위로 뜯고 큰 스냅으로 여밉니다. 깁스 높이에 ${f(CAST_MARGIN)} cm를 더한 만큼 뜯습니다. ${measureFirst("깁스 높이")}`,
        difficulty: "medium",
        reversible: true,
      };
    }
    case "hard-pull-up":
      return { id, fromKo, partKo: "허리단 안쪽", actionKo: "당김 고리 달기", instructionKo: "허리단 안쪽 양옆과 뒤에 손목이 들어가는 당김 고리를 답니다.", difficulty: "easy", reversible: true };
    case "seat-top-bunches":
      return {
        id,
        fromKo,
        partKo: "앞 밑단",
        actionKo: "앞자락만 줄이기",
        amountCm: a,
        instructionKo: a ? `앞 밑단만 ${f(a)} cm 올리고 옆선에서 뒤 밑단으로 곡선으로 이어 박습니다. 뒤판은 그대로 둡니다.` : `앞 밑단만 올리고 뒤판은 그대로 둡니다. ${measureFirst("앉았을 때 남는 앞자락 길이")}`,
        difficulty: "medium",
      };
    case "elbows-wear":
      return { id, fromKo, partKo: "팔꿈치", actionKo: "팔꿈치 덧댐", instructionKo: "소매 팔꿈치 안쪽이나 바깥에 질긴 천을 덧댑니다. 떼어 낼 수 있게 달면 바꿔 달 수 있습니다.", difficulty: "easy", reversible: true };
    case "crutch-underarm":
      return { id, fromKo, partKo: "겨드랑이", actionKo: "겨드랑이 덧댐", instructionKo: "겨드랑이 안쪽에 부드러운 천을 덧대거나 거셋을 넣습니다.", difficulty: "medium" };
    case "hard-fasten":
      return {
        id,
        fromKo,
        partKo: "여밈",
        actionKo: TOP_GARMENTS.includes(garment) ? "자석 단추로 바꾸기" : "큰 당김 고리와 후크",
        instructionKo: TOP_GARMENTS.includes(garment) ? "단추를 자석 단추로 바꾸고, 지퍼에는 큰 당김 고리를 답니다." : "지퍼에 큰 당김 고리를 달고, 허리 단추를 후크로 바꿉니다.",
        difficulty: "medium",
        reversible: true,
      };
    case "sleeve-long":
      return shorten("소매", "sleeve", garment === "shirt");
    case "body-long":
      return shorten("밑단", "length");
    case "pants-long":
      return shorten("밑단", "outseam");
    case "skirt-long":
      return shorten("밑단", "length");
    case "waist-loose":
      return {
        id,
        fromKo,
        partKo: "허리",
        actionKo: "고무줄 줄이기",
        amountCm: a,
        instructionKo: a ? `허리 고무줄을 ${f(a)} cm 짧게 다시 끼웁니다.` : `허리 고무줄을 허리에 맞춰 짧게 다시 끼웁니다. ${measureFirst("줄이고 싶은 허리 둘레")}`,
        difficulty: "easy",
        reversible: true,
      };
    case "body-tight":
      return {
        id,
        fromKo,
        partKo: "몸판",
        actionKo: "옆선 늘리기",
        instructionKo: `양 옆선 시접을 풀어 늘립니다. 시접으로는 단면 ${f(LET_OUT_FLAT)} cm까지이고, 그보다 끼면 옆선에 덧천을 넣거나 한 치수 큰 패턴으로 만듭니다. 몸 치수를 넣으면 늘릴 길이가 계산됩니다.`,
        difficulty: "medium",
      };
    default:
      return { id, fromKo, partKo: "기타", actionKo: "수선집과 상의", instructionKo: "옷을 입은 채 수선집에 보여 주고 어디를 어떻게 고칠지 상의하십시오.", difficulty: "medium" };
  }
}

// Every number a sentence may carry: the amounts and the constants above. A sentence that carries
// any other number is replaced, so nothing unchecked reaches the sheet. The wearer's quoted words
// are theirs and are not checked.
export function guarded(a: Alteration, extra: readonly number[] = []): Alteration {
  const base = [a.amountCm ?? 0, LET_OUT_FLAT, HEM_SPARE.top, HEM_SPARE.pants, BIG_TAKE_IN, BACK_RISE_DEFAULT, CAST_MARGIN, 90, ...extra];
  const allowed = base.flatMap((x) => [x, x / 2, 2 * x, x - CAST_MARGIN]).map((x) => Math.round(x * 10) / 10);
  if (guardNumbers(a.instructionKo, allowed)) return a;
  return { ...a, instructionKo: "길이는 수선집에서 재서 정합니다.", amountCm: undefined, delta: undefined };
}

// Alterations that touch the same measurement: the later one wins in the pattern delta.
export function patternDelta(alterations: readonly Alteration[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of alterations) for (const [k, v] of Object.entries(a.delta ?? {})) out[k] = v;
  return out;
}

export const complaintsFor = (garment: GarmentKind) => COMPLAINTS.filter((c) => c.garments.includes(garment) && WORN.includes(garment));
