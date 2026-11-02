// Draft a pattern from flat measurements and write the tiled PDF. No API calls.
//   npm run pattern                         every garment with the example measurements
//   npm run pattern -- --garment=t-shirt --grade=1
//   npm run pattern -- --garment=skirt --m=length:60,hem:55 --fabric=woven
//   npm run pattern -- --lang=ko             Korean (or es) PDFs; English by default
// PDFs go to .cache/patterns/. The example measurements (src/lib/pattern/examples.ts) are typical
// ready-to-wear values, not a measured garment.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { draft } from "../src/lib/pattern/draft.ts";
import { EXAMPLES } from "../src/lib/pattern/examples.ts";
import { isLang } from "../src/lib/i18n/lang.ts";
import { patternPdf } from "../src/lib/pattern/pdf.ts";
import { readPdfFont } from "../src/lib/pattern/pdf-font-node.ts";
import type { Fabric, GarmentKind } from "../src/lib/pattern/types.ts";
import { grade, gradedLabel } from "../src/lib/rules/grading.ts";

const args = process.argv.slice(2);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const garments = (opt("garment")?.split(",") ?? Object.keys(EXAMPLES)) as GarmentKind[];
const steps = Number(opt("grade") ?? 0);
const custom = opt("m");
const langOpt = opt("lang");
const lang = isLang(langOpt) ? langOpt : "en";
const font = await readPdfFont(lang);

await mkdir(path.resolve(".cache", "patterns"), { recursive: true });
for (const g of garments) {
  const ex = EXAMPLES[g];
  if (!ex) throw new Error(`Unknown garment ${g}`);
  let m = { ...(ex.m as Record<string, number>) };
  if (custom) for (const kv of custom.split(",")) m[kv.split(":")[0]] = Number(kv.split(":")[1]);
  if (steps) m = grade(g, m, steps) as Record<string, number>;
  const fabric = (opt("fabric") as Fabric | undefined) ?? ex.fabric;
  const pattern = draft({ garment: g, measures: m, fabric, sizeLabel: gradedLabel(ex.size, steps) });
  const { bytes, pages } = await patternPdf(pattern, { createdFor: "example measurements", lang, font });
  const out = path.resolve(".cache", "patterns", `${g}-${pattern.sizeLabel}${lang === "en" ? "" : `-${lang}`}.pdf`);
  await writeFile(out, bytes);
  console.log(`${g} ${pattern.sizeLabel}: ${pattern.pieces.map((p) => p.names[lang]).join(", ")}; ${pages[0] * pages[1] + 1} pages → ${path.relative(process.cwd(), out)}`);
  for (const n of pattern.notes) console.log(`  note: ${n[lang]}`);
}
