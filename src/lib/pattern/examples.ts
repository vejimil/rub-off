// Typical ready-to-wear flat measurements, one garment each, for trying the pipeline without a
// photo (npm run pattern, the sample page). Not a measured garment.

import type { MeasuresOf } from "./measures.ts";
import type { Fabric, GarmentKind } from "./types.ts";

export const EXAMPLES: { [K in GarmentKind]: { fabric: Fabric; size: string; m: Partial<MeasuresOf[K]> } } = {
  shirt: { fabric: "woven", size: "M", m: { length: 74, chest: 55, shoulder: 46, hem: 54, sleeve: 61, sleeveOpening: 11, bicep: 20, armholeDepth: 24 } },
  "t-shirt": { fabric: "knit", size: "M", m: { length: 70, chest: 54, shoulder: 47, hem: 53, sleeve: 21, sleeveOpening: 17, bicep: 20, armholeDepth: 23 } },
  hoodie: { fabric: "knit", size: "M", m: { length: 70, chest: 58, shoulder: 50, hem: 48, sleeve: 62, sleeveOpening: 9, bicep: 21, armholeDepth: 26 } },
  pants: { fabric: "woven", size: "M", m: { waist: 34, hip: 52, frontRise: 28, outseam: 98, thigh: 31, legOpening: 19 } },
  skirt: { fabric: "woven", size: "M", m: { length: 70, hem: 90 } },
  "eco-bag": { fabric: "woven", size: "One", m: { width: 36, height: 40, handleLength: 55, gusset: 8 } },
};
