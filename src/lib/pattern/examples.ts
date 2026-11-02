// Typical ready-to-wear flat measurements, one garment each, for trying the pipeline without a
// photo (npm run pattern, the sample page). Not a measured garment.

import type { MeasuresOf } from "./measures.ts";
import type { Fabric, GarmentKind } from "./types.ts";

export const EXAMPLES: { [K in GarmentKind]: { fabric: Fabric; size: string; m: Partial<MeasuresOf[K]> } } = {
  "t-shirt": { fabric: "knit", size: "M", m: { length: 70, chest: 54, shoulder: 47, hem: 53, sleeve: 21, sleeveOpening: 17, bicep: 20, armholeDepth: 23 } },
  "long-sleeve": { fabric: "knit", size: "M", m: { length: 68, chest: 51, shoulder: 45, hem: 50, sleeve: 61, sleeveOpening: 9, bicep: 18, armholeDepth: 22 } },
  sweatshirt: { fabric: "knit", size: "M", m: { length: 68, chest: 58, shoulder: 52, hem: 47, sleeve: 60, sleeveOpening: 9, bicep: 22, armholeDepth: 25 } },
  dress: { fabric: "woven", size: "M", m: { length: 98, chest: 52, shoulder: 42, hem: 62, sleeve: 20, sleeveOpening: 16, bicep: 19, armholeDepth: 23 } },
  shirt: { fabric: "woven", size: "M", m: { length: 74, chest: 55, shoulder: 46, hem: 54, sleeve: 61, sleeveOpening: 11, bicep: 20, armholeDepth: 24 } },
  hoodie: { fabric: "knit", size: "M", m: { length: 70, chest: 58, shoulder: 50, hem: 48, sleeve: 62, sleeveOpening: 9, bicep: 21, armholeDepth: 26 } },
  pants: { fabric: "woven", size: "M", m: { waist: 34, hip: 52, frontRise: 28, outseam: 98, thigh: 31, legOpening: 19 } },
  skirt: { fabric: "woven", size: "M", m: { length: 70, hem: 90 } },
  "a-line-skirt": { fabric: "woven", size: "M", m: { waist: 35, length: 60, hem: 60 } },
  "eco-bag": { fabric: "woven", size: "One", m: { width: 36, height: 40, handleLength: 55, gusset: 8 } },
  apron: { fabric: "woven", size: "One", m: { width: 60, length: 85, bibWidth: 26 } },
  cushion: { fabric: "woven", size: "One", m: { width: 45, height: 45 } },
  pouch: { fabric: "woven", size: "One", m: { width: 22, height: 15, gusset: 4 } },
};
