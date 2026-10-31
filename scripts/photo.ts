// A flat-lay photo → measurements, an overlay to check them, and the pattern PDF.
//   npm run photo -- photo.jpg --garment=t-shirt            uses the SAM cache; prints the cost of anything uncached
//   npm run photo -- photo.jpg --garment=t-shirt --yes      also calls SAM for uncached concepts (one call each, $0.0025)
//   --concept=shorts   another SAM word for the garment     --fabric=knit
//   --raw              send the file as is (already upright, ≤ 2000 px), e.g. to reuse an existing cache
//   --tape=length:70,chest:54   tape-measured values, printed next to the photo's
//   --json=src/lib/sample/x.json   also write a golden run for sample mode
// Writes .cache/out/<name>-overlay.png and <name>-pattern.pdf.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { svgPath } from "../src/lib/geom/point.ts";
import { MEASURE_KO } from "../src/lib/pattern/measures.ts";
import { patternPdf } from "../src/lib/pattern/pdf.ts";
import type { Fabric, GarmentKind } from "../src/lib/pattern/types.ts";
import { preparePhoto, runPhoto, type Prepared } from "../src/lib/photo/run.ts";

const args = process.argv.slice(2);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const source = args.find((a) => !a.startsWith("--"));
if (!source) throw new Error("usage: npm run photo -- photo.jpg --garment=t-shirt [--yes]");
const garment = (opt("garment") ?? "t-shirt") as GarmentKind;
const input = await readFile(source);

let photo: Prepared;
if (args.includes("--raw")) {
  const meta = await sharp(input).metadata();
  photo = { bytes: input, width: meta.width!, height: meta.height!, sha256: createHash("sha256").update(input).digest("hex") };
} else photo = await preparePhoto(input);

const run = await runPhoto({
  photo,
  garment,
  fabric: (opt("fabric") as Fabric) ?? "woven",
  cacheRoot: path.resolve(".cache", "photos"),
  allowApi: args.includes("--yes"),
  garmentConcept: opt("concept"),
});
if (!run.ok) {
  if (run.stage === "cost") console.log(`SAM would run ${run.pendingConcepts!.length} concept(s) [${run.pendingConcepts!.join(", ")}] for about $${run.usd!.toFixed(4)}. Rerun with --yes.`);
  else console.log(`stopped at ${run.stage}: ${run.detail}`);
  process.exit(0);
}

const tape = Object.fromEntries((opt("tape") ?? "").split(",").filter(Boolean).map((kv) => [kv.split(":")[0], Number(kv.split(":")[1])]));
console.log(`scale ${run.scale.pxPerCm.toFixed(2)} px/cm, A4 aspect ${run.scale.aspect.toFixed(3)}, fill ${(run.scale.fill * 100).toFixed(1)}%, ±${(run.scale.relError * 100).toFixed(1)}%`);
for (const [k, v] of Object.entries(run.measured.values)) {
  if (!v) continue;
  const b = v.bound === "max" ? "≤ " : v.bound === "min" ? "≥ " : "";
  const t = tape[k] ? `   tape ${tape[k]} (${(((v.cm - tape[k]) / tape[k]) * 100).toFixed(1)}%)` : "";
  console.log(`  ${(MEASURE_KO[k] ?? k).padEnd(8)} ${k.padEnd(14)} ${b}${v.cm.toFixed(1)} ± ${v.plusMinusCm.toFixed(1)} cm  [${v.confidence}]${t}`);
}
for (const r of run.measured.refused) console.log(`  refused ${r.key}: ${r.cm.toFixed(1)} cm is outside ${r.range[0]}–${r.range[1]}`);
for (const n of run.measured.notes) console.log(`  note: ${n}`);

const name = path.basename(source).replace(/\.[^.]+$/, "");
const outDir = path.resolve(".cache", "out");
await mkdir(outDir, { recursive: true });

// Overlay: outline, parts, measured segments with their cm.
const o = run.overlay;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">
  <path d="${svgPath(o.outlinePx, true)}" fill="none" stroke="#00e0ff" stroke-width="4"/>
  ${o.partsPx.map((p) => `<path d="${svgPath(p, true)}" fill="rgba(255,200,0,0.25)" stroke="#ffc800" stroke-width="3"/>`).join("")}
  <path d="${svgPath(run.scale.cornersPx, true)}" fill="none" stroke="#ff3070" stroke-width="4"/>
  ${o.segmentsPx
    .map(
      (s) => `<line x1="${s.a[0]}" y1="${s.a[1]}" x2="${s.b[0]}" y2="${s.b[1]}" stroke="#ff2020" stroke-width="5"/>
  <text x="${(s.a[0] + s.b[0]) / 2 + 8}" y="${(s.a[1] + s.b[1]) / 2 - 8}" font-size="${Math.round(photo.width / 40)}" font-family="Helvetica" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">${s.key} ${s.cm.toFixed(1)}</text>`,
    )
    .join("\n  ")}
</svg>`;
await sharp(photo.bytes).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 85 }).toFile(path.join(outDir, `${name}-overlay.jpg`));
console.log(`wrote .cache/out/${name}-overlay.jpg`);

// A golden run for sample mode: the photo goes to public/samples, the run (without the pattern,
// which the browser drafts) next to it as JSON.
const jsonOut = opt("json");
if (jsonOut) {
  const publicPhoto = `samples/${name}.jpg`;
  await writeFile(path.resolve("public", publicPhoto), photo.bytes);
  const { pattern: _pattern, ...rest } = run;
  void _pattern;
  await writeFile(jsonOut, JSON.stringify({ photo: { src: `/${publicPhoto}`, width: photo.width, height: photo.height }, run: rest }) + "\n");
  console.log(`wrote ${jsonOut} and public/${publicPhoto}`);
}

if (run.pattern) {
  const { bytes, pages } = await patternPdf(run.pattern, { createdFor: path.basename(source) });
  await writeFile(path.join(outDir, `${name}-pattern.pdf`), bytes);
  console.log(`wrote .cache/out/${name}-pattern.pdf (${pages[0] * pages[1] + 1} pages)`);
  for (const n of run.pattern.notes) console.log(`  pattern note: ${n}`);
} else console.log(`no pattern: ${run.draftError}`);
