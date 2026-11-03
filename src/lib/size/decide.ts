// Size decision: your own well-fitting garment against a shop's measurement table. Every number
// comes from your garment's geometry or the table's cells; the sentences are templates filled by
// code, and each passes the number guard.

import type { Fabric } from "../pattern/types.ts";
import { L, LANGS, type Local } from "../i18n/lang.ts";
import { PRIORITY, SIZE_KEY_NAME, tolerance, type Fit, type SizeKey } from "../rules/fit-tolerance.ts";
import { guardNumbers, numbersIn } from "../rules/numbers.ts";

export interface SizeTable {
  unit: "cm" | "inch";
  // Whether widths are flat (단면) or around the body (둘레). "unknown" must be asked, never guessed.
  basis: "flat" | "circumference" | "unknown";
  sizes: { label: string; values: Partial<Record<SizeKey, number>> }[];
}

export interface Mine {
  cm: number;
  plusMinusCm?: number;
}

export type Verdict = "fits" | "small" | "big";

export interface Check {
  key: SizeKey;
  table: number; // flat cm
  mine: number;
  diff: number; // table − mine, rounded to 0.5
  window: [number, number];
  verdict: Verdict;
}

export interface SizeResult {
  label: string;
  checks: Check[];
  fits: number;
}

// A length in the table that no size comes near: the table is for another style of the garment
// (long sleeves against a T-shirt's short ones, trousers against shorts). Not a size question.
export interface Unlike {
  key: SizeKey;
  mine: number;
  table: [number, number]; // smallest and largest in the table, flat cm
}

export type Decision =
  | { ok: true; best: SizeResult; all: SizeResult[]; sentences: Local[]; unlike: Unlike[] }
  | { ok: false; reason: "ask-basis" | "nothing-to-compare"; detail: Local };

const WIDTH_KEYS: readonly SizeKey[] = ["chest", "hem", "waist", "hip", "thigh", "legOpening"];
const STYLE_KEYS: readonly SizeKey[] = ["length", "sleeve", "outseam"];
// Neighbouring sizes differ by a few percent; a length half again as long (or two thirds as
// long) as yours in every size is another style, not another size.
const STYLE_RATIO = 1.5;
const half = (x: number) => Math.round(x * 2) / 2;

// Table cells into flat cm, the way your garment is measured.
export function toFlatCm(table: SizeTable): SizeTable {
  const k = table.unit === "inch" ? 2.54 : 1;
  return {
    unit: "cm",
    basis: "flat",
    sizes: table.sizes.map((s) => ({
      label: s.label,
      values: Object.fromEntries(
        Object.entries(s.values).map(([key, v]) => [key, v! * k / (table.basis === "circumference" && WIDTH_KEYS.includes(key as SizeKey) ? 2 : 1)]),
      ),
    })),
  };
}

export function decideSize(mine: Partial<Record<SizeKey, Mine>>, table: SizeTable, fabric: Fabric, fit: Fit): Decision {
  if (table.basis === "unknown" && table.sizes.some((s) => WIDTH_KEYS.some((k) => s.values[k] !== undefined))) {
    return {
      ok: false,
      reason: "ask-basis",
      detail: L(
        "표의 폭이 단면인지 둘레인지 표에 적혀 있지 않습니다.",
        "The table doesn't say whether widths are measured flat or around the body.",
        "La tabla no dice si los anchos se miden en plano o en contorno.",
      ),
    };
  }
  const flat = toFlatCm(table);
  // On a trouser table 총장 is the outseam; Spark may file it under either.
  if (mine.outseam && !mine.length) {
    for (const s of flat.sizes) if (s.values.length !== undefined && s.values.outseam === undefined) [s.values.outseam, s.values.length] = [s.values.length, undefined];
  }
  const unlike: Unlike[] = [];
  for (const key of STYLE_KEYS) {
    const m = mine[key];
    const ts = flat.sizes.flatMap((s) => (s.values[key] !== undefined ? [s.values[key]!] : []));
    if (!m || !ts.length) continue;
    if (ts.every((t) => t > STYLE_RATIO * m.cm || t * STYLE_RATIO < m.cm)) unlike.push({ key, mine: m.cm, table: [Math.min(...ts), Math.max(...ts)] });
  }
  const all: SizeResult[] = flat.sizes.map((s) => {
    const checks: Check[] = [];
    for (const key of PRIORITY) {
      const t = s.values[key], m = mine[key];
      if (t === undefined || !m || unlike.some((u) => u.key === key)) continue;
      const diff = half(t - m.cm);
      const window = tolerance(key, fabric, fit);
      checks.push({ key, table: t, mine: m.cm, diff, window, verdict: diff < window[0] ? "small" : diff > window[1] ? "big" : "fits" });
    }
    return { label: s.label, checks, fits: checks.filter((c) => c.verdict === "fits").length };
  });
  if (all.every((r) => r.checks.length === 0)) return { ok: false, reason: "nothing-to-compare", detail: L("표와 내 옷에 같은 측정 항목이 없습니다.", "The table and your garment have no measurement in common.", "La tabla y tu prenda no tienen ninguna medida en común.") };

  // Most points that fit; then the one whose most important point is closest to its window.
  const miss = (c: Check) => (c.verdict === "fits" ? 0 : c.verdict === "small" ? c.window[0] - c.diff : c.diff - c.window[1]);
  const best = [...all].sort((a, b) => {
    if (b.fits !== a.fits) return b.fits - a.fits;
    for (const key of PRIORITY) {
      const ca = a.checks.find((c) => c.key === key), cb = b.checks.find((c) => c.key === key);
      if (ca && cb && miss(ca) !== miss(cb)) return miss(ca) - miss(cb);
    }
    return 0;
  })[0];
  return { ok: true, best, all, sentences: [...sentences(best), ...unlike.flatMap(unlikeSentence)], unlike };
}

function unlikeSentence(u: Unlike): Local[] {
  const [lo, hi] = u.table.map((x) => x.toFixed(1));
  const range = lo === hi ? lo : `${lo}–${hi}`;
  const m = u.mine.toFixed(1);
  const longer = u.table[0] > u.mine;
  const s = L(
    `${SIZE_KEY_NAME[u.key].ko}: 표는 ${range} cm, 내 옷은 ${m} cm. 사이즈가 아니라 옷의 종류가 달라 보여(${longer ? "표의 옷이 훨씬 김" : "표의 옷이 훨씬 짧음"}) 비교하지 않았습니다.`,
    `${SIZE_KEY_NAME[u.key].en}: the table says ${range} cm, your garment ${m} cm. That's a different style of garment (${longer ? "much longer" : "much shorter"}), not a different size, so it wasn't compared.`,
    `${SIZE_KEY_NAME[u.key].es}: la tabla dice ${range} cm y tu prenda ${m} cm. Es otro estilo de prenda (${longer ? "mucho más larga" : "mucho más corta"}), no otra talla, así que no se comparó.`,
  );
  const allowed = [...u.table.map((x) => Number(x.toFixed(1))), Number(m)];
  return LANGS.every((l) => guardNumbers(s[l], allowed)) ? [s] : [];
}

// "M: 가슴단면 +1 cm 맞음, 총장 −3 cm 짧음", in every language. Built from the checks, then
// guarded: a sentence whose numbers fail in any language is dropped in all of them.
const VERDICT: Record<"fits" | "small" | "big" | "short" | "long", Local> = {
  fits: L("맞음", "fits", "queda bien"),
  small: L("작음", "too small", "pequeño"),
  big: L("큼", "too big", "grande"),
  short: L("짧음", "too short", "corto"),
  long: L("김", "too long", "largo"),
};

export function sentences(r: SizeResult): Local[] {
  const out: Local[] = [];
  const sign = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0");
  const word = (c: Check): Local => {
    const long = ["length", "sleeve", "outseam", "frontRise"].includes(c.key);
    if (c.verdict === "fits") return VERDICT.fits;
    if (c.verdict === "small") return long ? VERDICT.short : VERDICT.small;
    return long ? VERDICT.long : VERDICT.big;
  };
  const each = (f: (lang: (typeof LANGS)[number]) => string): Local => L(f("ko"), f("en"), f("es"));
  out.push(each((l) => `${r.label}: ` + r.checks.map((c) => `${SIZE_KEY_NAME[c.key][l]} ${sign(c.diff)} cm ${word(c)[l]}`).join(", ")));
  for (const c of r.checks.filter((x) => x.verdict !== "fits")) {
    const [t, m, d, lo, hi] = [c.table.toFixed(1), c.mine.toFixed(1), sign(c.diff), sign(c.window[0]), sign(c.window[1])];
    out.push(
      L(
        `${SIZE_KEY_NAME[c.key].ko}: 표 ${t} cm, 내 옷 ${m} cm (${d} cm, 허용 ${lo} ~ ${hi} cm).`,
        `${SIZE_KEY_NAME[c.key].en}: table ${t} cm, your garment ${m} cm (${d} cm, allowed ${lo} to ${hi} cm).`,
        `${SIZE_KEY_NAME[c.key].es}: tabla ${t} cm, tu prenda ${m} cm (${d} cm, margen de ${lo} a ${hi} cm).`,
      ),
    );
  }
  const allowed = r.checks.flatMap((c) => [Math.abs(c.diff), Number(c.table.toFixed(1)), Number(c.mine.toFixed(1)), Math.abs(c.window[0]), Math.abs(c.window[1]), 0]);
  // Size labels can carry numbers (95, 100, 28): they are the table's, so they are allowed too.
  allowed.push(...numbersIn(r.label));
  return out.filter((s) => LANGS.every((l) => guardNumbers(s[l], allowed)));
}
