// Draft a pattern from flat measurements and write the tiled PDF. No API calls.
//   npm run pattern                         every garment with the example measurements below
//   npm run pattern -- --garment=t-shirt --grade=1
//   npm run pattern -- --garment=skirt --m=length:60,hem:55 --fabric=woven
// PDFs go to .cache/patterns/. The example measurements are typical ready-to-wear values for
// trying the pipeline, not a measured garment.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { draft } from "../src/lib/pattern/draft.ts";
import type { MeasuresOf } from "../src/lib/pattern/measures.ts";
import { patternPdf } from "../src/lib/pattern/pdf.ts";
import type { Fabric, GarmentKind } from "../src/lib/pattern/types.ts";
import { grade, gradedLabel } from "../src/lib/rules/grading.ts";

const EXAMPLES: { [K in GarmentKind]: { fabric: Fabric; size: string; m: Partial<MeasuresOf[K]> } } = {
  shirt: { fabric: "woven", size: "M", m: { length: 74, chest: 55, shoulder: 46, hem: 54, sleeve: 61, sleeveOpening: 11, bicep: 20, armholeDepth: 24 } },
  "t-shirt": { fabric: "knit", size: "M", m: { length: 70, chest: 54, shoulder: 47, hem: 53, sleeve: 21, sleeveOpening: 17, bicep: 20, armholeDepth: 23 } },
  hoodie: { fabric: "knit", size: "M", m: { length: 70, chest: 58, shoulder: 50, hem: 48, sleeve: 62, sleeveOpening: 9, bicep: 21, armholeDepth: 26 } },
  pants: { fabric: "woven", size: "M", m: { waist: 34, hip: 52, frontRise: 28, outseam: 98, thigh: 31, legOpening: 19 } },
  skirt: { fabric: "woven", size: "M", m: { length: 70, hem: 90 } },
  "eco-bag": { fabric: "woven", size: "One", m: { width: 36, height: 40, handleLength: 55, gusset: 8 } },
};

const args = process.argv.slice(2);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const garments = (opt("garment")?.split(",") ?? Object.keys(EXAMPLES)) as GarmentKind[];
const steps = Number(opt("grade") ?? 0);
const custom = opt("m");

await mkdir(path.resolve(".cache", "patterns"), { recursive: true });
for (const g of garments) {
  const ex = EXAMPLES[g];
  if (!ex) throw new Error(`Unknown garment ${g}`);
  let m = { ...(ex.m as Record<string, number>) };
  if (custom) for (const kv of custom.split(",")) m[kv.split(":")[0]] = Number(kv.split(":")[1]);
  if (steps) m = grade(g, m, steps) as Record<string, number>;
  const fabric = (opt("fabric") as Fabric | undefined) ?? ex.fabric;
  const pattern = draft({ garment: g, measures: m, fabric, sizeLabel: gradedLabel(ex.size, steps) });
  const { bytes, pages } = await patternPdf(pattern, { createdFor: "example measurements" });
  const out = path.resolve(".cache", "patterns", `${g}-${pattern.sizeLabel}.pdf`);
  await writeFile(out, bytes);
  console.log(`${g} ${pattern.sizeLabel}: ${pattern.pieces.map((p) => p.name).join(", ")}; ${pages[0] * pages[1] + 1} pages → ${path.relative(process.cwd(), out)}`);
  for (const n of pattern.notes) console.log(`  note: ${n}`);
}
