// Flat-lay photos of one garment → measurements, an overlay per photo to check them, and the pattern PDF.
//   npm run photo -- front.jpg [back.jpg] --garment=t-shirt        uses the caches; prints the cost of anything uncached
//   add --yes to call SAM (about $0.0025 per word) and the Muse Spark layout check (about $0.01) for what isn't cached
//   --garment=auto     Muse Spark says what the item is, knit or woven, and the SAM word (about $0.01, cached);
//                      with a kind given, it says only which way the item lies, and the photo is stood upright
//   --concept=shorts   another SAM word for the garment     --fabric=knit
//   --raw              send the file as is (already upright, ≤ 2000 px), e.g. to reuse an existing cache
//   --ref=chest:54     no A4 in the photo: this tape value sets the scale
//   --shoulders=0.31,0.12,0.69,0.11   shoulder points tapped on the (first) photo, as fractions of width, height
//   --tape=length:70,chest:54   tape-measured values, printed next to the photo's
//   --json=src/lib/sample/x.json   also write a golden run (first photo) for sample mode
//   --cutout           the saved sample photo keeps only the garment and the A4 sheet; the floor goes plain
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
import { cachedIdentify, identify, standUpright } from "../src/lib/photo/identify.ts";
import { photoCacheDir, preparePhoto, runPhoto, type PhotoRun, type Prepared } from "../src/lib/photo/run.ts";

const args = process.argv.slice(2);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const sources = args.filter((a) => !a.startsWith("--"));
if (!sources.length) throw new Error("usage: npm run photo -- photo.jpg [photo2.jpg] --garment=t-shirt [--yes]");
let garment = (opt("garment") ?? "t-shirt") as GarmentKind | "auto";
const auto = garment === "auto";
let fabric = (opt("fabric") as Fabric) ?? "woven";
const concept = opt("concept");
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
  const cacheRoot = path.resolve(".cache", "photos");
  // Muse Spark first: what the item is (with --garment=auto) and which way it lies, so the photo is
  // stood upright before SAM sees it. Without --yes and nothing cached, the photo is used as it lies.
  const given = auto ? undefined : (garment as GarmentKind);
  const dir = photoCacheDir(cacheRoot, photo);
  const id = (await cachedIdentify(dir, given)) ?? (args.includes("--yes") ? await identify(photo, dir, given) : null);
  if (auto && !id) throw new Error("Telling the garment needs Muse Spark once (about $0.01). Rerun with --yes.");
  if (id) {
    console.log(`Spark: ${id.garment}, ${id.fabric}, SAM word "${id.word}", top of the item toward the photo's ${id.neck ?? "top"}`);
    if (id.garment === "something else") process.exit(0);
    const turned = await standUpright(photo, id, cacheRoot, given);
    if (turned) photo = turned.photo;
    if (auto) {
      garment = id.garment;
      if (id.fabric !== "unclear") fabric = id.fabric;
    }
  }
  const run = await runPhoto({
    photo,
    garment: garment as GarmentKind,
    fabric,
    cacheRoot,
    allowApi: args.includes("--yes"),
    garmentConcept: concept ?? id?.word,
    reference: opt("ref") ? { key: opt("ref")!.split(":")[0], cm: Number(opt("ref")!.split(":")[1]) } : undefined,
    shoulders: source === sources[0] && opt("shoulders") ? pairsOf(opt("shoulders")!) : undefined,
  });
  const name = path.basename(source).replace(/\.[^.]+$/, "");
  console.log(`\n== ${name}`);
  if (!run.ok) {
    if (run.stage === "cost") console.log(`SAM would run ${run.pendingConcepts!.length} word(s) [${run.pendingConcepts!.join(", ")}] plus a layout check, about $${run.usd!.toFixed(4)}. Rerun with --yes.`);
    else console.log(`stopped at ${run.stage}: ${run.detail.en}`);
    continue;
  }
  console.log(`scale (${run.scale.source}) ${run.scale.pxPerCm.toFixed(2)} px/cm, ±${(run.scale.relError * 100).toFixed(1)}%${run.layout ? `; Spark: ${run.layout.side}, ${run.layout.wrinkles}, hem ${run.layout.hem}, sleeves ${run.layout.sleeves.map((s) => `${s.number}:${s.state}`).join(" ")}` : ""}`);
  for (const [k, v] of Object.entries(run.measured.values)) if (v) line(k, v);
  for (const r of run.measured.refused) console.log(`  refused ${r.key}: ${r.cm.toFixed(1)} cm is outside ${r.range[0]}–${r.range[1]}`);
  for (const n of run.measured.notes) console.log(`  note: ${n.en}`);
  for (const p of run.pockets ?? []) console.log(`  pocket: ${p.kind} on the ${p.host}, ${p.width.toFixed(1)} × ${p.height.toFixed(1)} cm ± ${p.plusMinusCm}, top centre ${p.fromCentre.toFixed(1)} cm from the centre line, ${p.belowNeck.toFixed(1)} cm below the shoulder`);

  // Overlay: outline, parts, measured segments with their cm.
  const o = run.overlay;
  const fs = Math.round(photo.width / 40);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">
  <path d="${svgPath(o.outlinePx, true)}" fill="none" stroke="#00e0ff" stroke-width="4"/>
  ${o.partsPx.map((p) => `<path d="${svgPath(p, true)}" fill="rgba(255,200,0,0.25)" stroke="#ffc800" stroke-width="3"/>`).join("")}
  ${(o.pocketsPx ?? []).map((p) => `<path d="${svgPath(p, true)}" fill="rgba(0,180,255,0.25)" stroke="#00b4ff" stroke-width="4"/>`).join("")}
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
    let bytes = photo.bytes;
    if (args.includes("--cutout")) {
      // Garment outline, its parts and the A4 sheet, grown by a little so edges keep their shadow.
      const keep = [o.outlinePx, ...o.partsPx, ...(run.scale.source === "a4" ? [run.scale.cornersPx] : [])];
      const grow = Math.round(photo.width / 60);
      const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">${keep
        .map((p) => `<path d="${svgPath(p, true)}" fill="#fff" stroke="#fff" stroke-width="${grow}" stroke-linejoin="round"/>`)
        .join("")}</svg>`;
      const cut = await sharp(photo.bytes).ensureAlpha().composite([{ input: Buffer.from(mask), blend: "dest-in" }]).png().toBuffer();
      bytes = await sharp(cut).flatten({ background: "#e6dbc7" }).jpeg({ quality: 85 }).toBuffer(); // the site's sand ground
    }
    await writeFile(path.resolve("public", publicPhoto), bytes);
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
  const pattern = draft({ garment: garment as GarmentKind, measures, fabric });
  const { bytes, pages } = await patternPdf(pattern, { createdFor: names.join(" + ") });
  await writeFile(path.join(outDir, `${names[0]}-pattern.pdf`), bytes);
  console.log(`\nwrote .cache/out/${names[0]}-pattern.pdf (${pages[0] * pages[1] + 1} pages)`);
  for (const n of pattern.notes) console.log(`  pattern note: ${n.en}`);
} catch (e) {
  console.log(`\nno pattern: ${(e as Error).message}`);
}
