// Several photos of one garment (front and back, or a retake): each value from the photo that
// measured it most surely, unbounded before bounded. Where two photos disagree by more than their
// ± allows, the garment lay differently in them (wrinkles, a pulled hem), so the ± is widened to
// cover the gap and the gap is named. Nothing is averaged into a number neither photo measured.

import { confidenceOf } from "../scale/a4.ts";
import type { Value } from "./shape.ts";

export interface Combined {
  values: Record<string, Value>;
  from: Record<string, number>; // which photo each value came from
  conflicts: { key: string; values: number[] }[];
}

export function combineMeasurements(runs: readonly Partial<Record<string, Value>>[]): Combined {
  const keys = [...new Set(runs.flatMap((r) => Object.keys(r)))];
  const values: Record<string, Value> = {};
  const from: Record<string, number> = {};
  const conflicts: Combined["conflicts"] = [];
  for (const key of keys) {
    const c = runs.flatMap((r, i) => (r[key] ? [{ v: r[key]!, i }] : []));
    const best = [...c].sort((a, b) => Number(!!a.v.bound) - Number(!!b.v.bound) || a.v.plusMinusCm - b.v.plusMinusCm)[0];
    let v = best.v;
    const others = c.filter((x) => x !== best && !x.v.bound && !best.v.bound);
    const worst = Math.max(0, ...others.map((x) => Math.abs(x.v.cm - best.v.cm) - (x.v.plusMinusCm + best.v.plusMinusCm)));
    if (worst > 0) {
      const gap = Math.max(...others.map((x) => Math.abs(x.v.cm - best.v.cm)));
      const pm = Math.max(v.plusMinusCm, gap);
      v = { ...v, plusMinusCm: pm, confidence: confidenceOf(pm / Math.max(v.cm, 1)) };
      conflicts.push({ key, values: c.map((x) => x.v.cm) });
    }
    values[key] = v;
    from[key] = best.i;
  }
  return { values, from, conflicts };
}
