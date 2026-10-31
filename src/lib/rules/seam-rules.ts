// Seam allowance per edge, in cm. Common home-sewing allowances for a woven or knit garment.
// [A] Drafted from ARCHITECTURE.md; the owner confirms or changes these values.

import type { EdgeKind, Fabric } from "../pattern/types.ts";

const WOVEN: Record<EdgeKind, number> = {
  side: 1,
  shoulder: 1,
  armhole: 1,
  "sleeve-cap": 1,
  underarm: 1,
  hem: 2.5,
  "sleeve-hem": 2.5,
  neck: 0.7,
  waist: 1,
  casing: 0, // set from the elastic width, see casingAllowance
  "bag-top": 3,
  inseam: 1,
  crotch: 1,
  seam: 1,
  fold: 0,
};

// Knits are serged with a narrow allowance; hems stay deeper for a twin-needle finish.
const KNIT: Record<EdgeKind, number> = {
  ...WOVEN,
  side: 0.7,
  shoulder: 0.7,
  armhole: 0.7,
  "sleeve-cap": 0.7,
  underarm: 0.7,
  neck: 0.7,
  inseam: 0.7,
  crotch: 0.7,
  seam: 0.7,
  hem: 2,
  "sleeve-hem": 2,
};

export function seamAllowance(kind: EdgeKind, fabric: Fabric): number {
  return (fabric === "knit" ? KNIT : WOVEN)[kind];
}

// A fold-over elastic casing: the elastic's width plus room to move, plus a turn-under.
export const casingAllowance = (elasticCm: number) => elasticCm + 0.5 + 1;
