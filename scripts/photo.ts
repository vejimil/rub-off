// Flat-lay photos of one garment → measurements, an overlay per photo to check them, and the pattern PDF.
//   npm run photo -- front.jpg [back.jpg] --garment=t-shirt        uses the caches; prints the cost of anything uncached
//   add --yes to call SAM (about $0.0025 per word) and the Muse Spark layout check (about $0.01) for what isn't cached
//   --concept=shorts   another SAM word for the garment     --fabric=knit
//   --raw              send the file as is (already upright, ≤ 2000 px), e.g. to reuse an existing cache
//   --ref=chest:54     no A4 in the photo: this tape value sets the scale
//   --shoulders=0.31,0.12,0.69,0.11   shoulder points tapped on the (first) photo, as fractions of width, height
//   --tape=length:70,chest:54   tape-measured values, printed next to the photo's
//   --json=src/lib/sample/x.json   also write a golden run (first photo) for sample mode
// Several photos are combined: each value from the photo that measured it most surely.
// Writes .cache/out/<name>-overlay.jpg per photo and <name>-pattern.pdf.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { svgPath } from "../src/lib/geom/point.ts";
import { combineMeasurements } from "../src/lib/measure/combine.ts";
import { draft } from "../src/lib/pattern/draft.ts";
import { MEASURE_KO, type MeasuresOf } from "../src/lib/pattern/measures.ts";
import { patternPdf } from "../src/lib/pattern/pdf.ts";
import type { Fabric, GarmentKind } from "../src/lib/pattern/types.ts";
import { preparePhoto, runPhoto, type PhotoRun, type Prepared } from "../src/lib/photo/run.ts";

const args = process.argv.slice(2);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const sources = args.filter((a) => !a.startsWith("--"));
if (!sources.length) throw new Error("usage: npm run photo -- photo.jpg [photo2.jpg] --garment=t-shirt [--yes]");
const garment = (opt("garment") ?? "t-shirt") as GarmentKind;
const fabric = (opt("fabric") as Fabric) ?? "woven";
const tape = Object.fromEntries((opt("tape") ?? "").split(",").filter(Boolean).map((kv) => [kv.split(":")[0], Number(kv.split(":")[1])]));
const outDir = path.resolve(".cache", "out");
const pairsOf = (csv: string) => {
  const n = csv.split(",").map(Number);
  return Array.from({ length: n.length >> 1 }, (_, i): [number, number] => [n[2 * i], n[2 * i + 1]]);
};
await mkdir(outDir, { recursive: true });

const line = (k: string, v: { cm: number; plusMinusCm: number; confidence: string; bound?: string }, extra = "") => {
  const b = v.bound === "max" ? "≤ " : v.bound === "min" ? "≥ " : "";
  const t = tape[k] ? `   tape ${tape[k]} (${(((v.cm - tape[k]) / tape[k]) * 100).toFixed(1)}%)` : "";
  console.log(`  ${(MEASURE_KO[k] ?? k).padEnd(8)} ${k.padEnd(14)} ${b}${v.cm.toFixed(1)} ± ${v.plusMinusCm.toFixed(1)} cm  [${v.confidence}]${t}${extra}`);
};

const runs: Extract<PhotoRun, { ok: true }>[] = [];
const names: string[] = [];
for (const source of sources) {
  const input = await readFile(source);
  let photo: Prepared;
  if (args.includes("--raw")) {
    const meta = await sharp(input).metadata();
    photo = { bytes: input, width: meta.width!, height: meta.height!, sha256: createHash("sha256").update(input).digest("hex") };
  } else photo = await preparePhoto(input);
  const run = await runPhoto({
    photo,
    garment,
    fabric,
    cacheRoot: path.resolve(".cache", "photos"),
    allowApi: args.includes("--yes"),
    garmentConcept: opt("concept"),
    reference: opt("ref") ? { key: opt("ref")!.split(":")[0], cm: Number(opt("ref")!.split(":")[1]) } : undefined,
    shoulders: source === sources[0] && opt("shoulders") ? pairsOf(opt("shoulders")!) : undefined,
  });
  const name = path.basename(source).replace(/\.[^.]+$/, "");
  console.log(`\n== ${name}`);
  if (!run.ok) {
    if (run.stage === "cost") console.log(`SAM would run ${run.pendingConcepts!.length} word(s) [${run.pendingConcepts!.join(", ")}] plus a layout check, about $${run.usd!.toFixed(4)}. Rerun with --yes.`);
    else console.log(`stopped at ${run.stage}: ${run.detail}`);
    continue;
  }
  console.log(`scale (${run.scale.source}) ${run.scale.pxPerCm.toFixed(2)} px/cm, ±${(run.scale.relError * 100).toFixed(1)}%${run.layout ? `; Spark: ${run.layout.side}, ${run.layout.wrinkles}, hem ${run.layout.hem}, sleeves ${run.layout.sleeves.map((s) => `${s.number}:${s.state}`).join(" ")}` : ""}`);
  for (const [k, v] of Object.entries(run.measured.values)) if (v) line(k, v);
  for (const r of run.measured.refused) console.log(`  refused ${r.key}: ${r.cm.toFixed(1)} cm is outside ${r.range[0]}–${r.range[1]}`);
  for (const n of run.measured.notes) console.log(`  note: ${n}`);

  // Overlay: outline, parts, measured segments with their cm.
  const o = run.overlay;
  const fs = Math.round(photo.width / 40);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">
  <path d="${svgPath(o.outlinePx, true)}" fill="none" stroke="#00e0ff" stroke-width="4"/>
  ${o.partsPx.map((p) => `<path d="${svgPath(p, true)}" fill="rgba(255,200,0,0.25)" stroke="#ffc800" stroke-width="3"/>`).join("")}
  ${run.scale.source === "a4" ? `<path d="${svgPath(run.scale.cornersPx, true)}" fill="none" stroke="#ff3070" stroke-width="4"/>` : ""}
  ${o.segmentsPx
    .map(
      (s) => `<line x1="${s.a[0]}" y1="${s.a[1]}" x2="${s.b[0]}" y2="${s.b[1]}" stroke="#ff2020" stroke-width="5"/>
  <text x="${(s.a[0] + s.b[0]) / 2 + 8}" y="${(s.a[1] + s.b[1]) / 2 - 8}" font-size="${fs}" font-family="Helvetica" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">${s.key} ${s.cm.toFixed(1)}</text>`,
    )
    .join("\n  ")}
</svg>`;
  await sharp(await sharp(photo.bytes).composite([{ input: Buffer.from(svg) }]).toBuffer()).jpeg({ quality: 85 }).toFile(path.join(outDir, `${name}-overlay.jpg`));
  console.log(`wrote .cache/out/${name}-overlay.jpg`);

  // A golden run for sample mode: the photo goes to public/samples, the run (without the pattern,
  // which the browser drafts) next to it as JSON.
  const jsonOut = opt("json");
  if (jsonOut && runs.length === 0) {
    const publicPhoto = `samples/${name}.jpg`;
    await writeFile(path.resolve("public", publicPhoto), photo.bytes);
    const { pattern: _pattern, ...rest } = run;
    void _pattern;
    await writeFile(jsonOut, JSON.stringify({ photo: { src: `/${publicPhoto}`, width: photo.width, height: photo.height }, run: rest }) + "\n");
    console.log(`wrote ${jsonOut} and public/${publicPhoto}`);
  }
  runs.push(run);
  names.push(name);
}
if (!runs.length) process.exit(0);

const combined = combineMeasurements(runs.map((r) => r.measured.values));
if (runs.length > 1) {
  console.log(`\n== combined (${names.join(" + ")})`);
  for (const [k, v] of Object.entries(combined.values)) line(k, v, `  from ${names[combined.from[k]]}`);
  for (const c of combined.conflicts) console.log(`  conflict ${c.key}: ${c.values.map((x) => x.toFixed(1)).join(" vs ")} cm`);
}

const measures = Object.fromEntries(Object.entries(combined.values).map(([k, v]) => [k, v.cm])) as Partial<MeasuresOf[GarmentKind]>;
try {
  const pattern = draft({ garment, measures, fabric });
  const { bytes, pages } = await patternPdf(pattern, { createdFor: names.join(" + ") });
  await writeFile(path.join(outDir, `${names[0]}-pattern.pdf`), bytes);
  console.log(`\nwrote .cache/out/${names[0]}-pattern.pdf (${pages[0] * pages[1] + 1} pages)`);
  for (const n of pattern.notes) console.log(`  pattern note: ${n}`);
} catch (e) {
  console.log(`\nno pattern: ${(e as Error).message}`);
}
