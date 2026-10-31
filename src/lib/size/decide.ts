// Size decision: your own well-fitting garment against a shop's measurement table. Every number
// comes from your garment's geometry or the table's cells; the sentences are templates filled by
// code, and each passes the number guard.

import type { Fabric } from "../pattern/types.ts";
import { PRIORITY, SIZE_KEY_KO, tolerance, type Fit, type SizeKey } from "../rules/fit-tolerance.ts";
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

export type Decision =
  | { ok: true; best: SizeResult; all: SizeResult[]; sentences: string[] }
  | { ok: false; reason: "ask-basis" | "nothing-to-compare"; detail: string };

const WIDTH_KEYS: readonly SizeKey[] = ["chest", "hem", "waist", "hip", "thigh", "legOpening"];
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
    return { ok: false, reason: "ask-basis", detail: "The table does not say whether widths are flat (단면) or around the body (둘레)." };
  }
  const flat = toFlatCm(table);
  const all: SizeResult[] = flat.sizes.map((s) => {
    const checks: Check[] = [];
    for (const key of PRIORITY) {
      const t = s.values[key], m = mine[key];
      if (t === undefined || !m) continue;
      const diff = half(t - m.cm);
      const window = tolerance(key, fabric, fit);
      checks.push({ key, table: t, mine: m.cm, diff, window, verdict: diff < window[0] ? "small" : diff > window[1] ? "big" : "fits" });
    }
    return { label: s.label, checks, fits: checks.filter((c) => c.verdict === "fits").length };
  });
  if (all.every((r) => r.checks.length === 0)) return { ok: false, reason: "nothing-to-compare", detail: "No point of measure appears both in the table and on your garment." };

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
  return { ok: true, best, all, sentences: sentences(best) };
}

// "M: 가슴단면 +1 맞음, 총장 −3 짧음". Built from the checks, then guarded.
export function sentences(r: SizeResult): string[] {
  const out: string[] = [];
  const sign = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0");
  const word = (c: Check) => {
    const long = ["length", "sleeve", "outseam", "frontRise"].includes(c.key);
    if (c.verdict === "fits") return "맞음";
    if (c.verdict === "small") return long ? "짧음" : "작음";
    return long ? "김" : "큼";
  };
  out.push(`${r.label}: ` + r.checks.map((c) => `${SIZE_KEY_KO[c.key]} ${sign(c.diff)} cm ${word(c)}`).join(", "));
  for (const c of r.checks.filter((x) => x.verdict !== "fits")) {
    out.push(`${SIZE_KEY_KO[c.key]}: 표 ${c.table.toFixed(1)} cm, 내 옷 ${c.mine.toFixed(1)} cm (${sign(c.diff)} cm, 허용 ${sign(c.window[0])} ~ ${sign(c.window[1])} cm).`);
  }
  const allowed = r.checks.flatMap((c) => [Math.abs(c.diff), Number(c.table.toFixed(1)), Number(c.mine.toFixed(1)), Math.abs(c.window[0]), Math.abs(c.window[1]), 0]);
  // Size labels can carry numbers (95, 100, 28): they are the table's, so they are allowed too.
  allowed.push(...numbersIn(r.label));
  return out.filter((s) => guardNumbers(s, allowed));
}
