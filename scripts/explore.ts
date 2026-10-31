// Try SAM words on a real photo: one overlay per word with every mask and its confidence.
//   npm run explore -- photo.jpg shirt,t-shirt,sleeve,paper          prints the cost of uncached words
//   npm run explore -- photo.jpg shirt,t-shirt,sleeve,paper --yes    calls SAM for them ($0.0025 each)
// Overlays go to .cache/explore/<name>-<word>.jpg. Use this before choosing a garment's words.

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { rasterize, traceOuter } from "../src/lib/geom/grid.ts";
import { simplifyClosed } from "../src/lib/geom/polygon.ts";
import { svgPath } from "../src/lib/geom/point.ts";
import { cachedImageConcept, imageMasks, SAM_IMAGE_USD, segmentImageConcept } from "../src/lib/meta/sam-image.ts";
import { preparePhoto } from "../src/lib/photo/run.ts";

const args = process.argv.slice(2);
const [source, words] = args.filter((a) => !a.startsWith("--"));
if (!source || !words) throw new Error("usage: npm run explore -- photo.jpg word,word [--yes]");
const photo = await preparePhoto(await readFile(source));
const cacheDir = path.resolve(".cache", "photos", photo.sha256.slice(0, 16));
const concepts = words.split(",");
const pending = [];
for (const c of concepts) if (!(await cachedImageConcept(cacheDir, c))) pending.push(c);
if (pending.length && !args.includes("--yes")) {
  console.log(`SAM would run ${pending.length} word(s) [${pending.join(", ")}] for $${(pending.length * SAM_IMAGE_USD).toFixed(4)}. Rerun with --yes.`);
  process.exit(0);
}
const out = path.resolve(".cache", "explore");
await mkdir(out, { recursive: true });
const name = path.basename(source).replace(/\.[^.]+$/, "");
const colors = ["#ff2050", "#20a0ff", "#20d060", "#ffb000", "#c040ff", "#00e0e0"];
for (const c of concepts) {
  const masks = imageMasks(await segmentImageConcept({ bytes: photo.bytes, mime: "image/jpeg" }, c, cacheDir));
  console.log(`${name} ${c}: ${masks.length} mask(s) ${masks.map((m) => m.confidence?.toFixed(2)).join(" ")}`);
  const paths = masks.map((m, i) => {
    const poly = simplifyClosed(traceOuter(rasterize(m, photo.width, photo.height)), 2);
    const col = colors[i % colors.length];
    return `<path d="${svgPath(poly, true)}" fill="${col}" fill-opacity="0.3" stroke="${col}" stroke-width="5"/>
      <text x="${m.bounds.left + 10}" y="${m.bounds.top + 50}" font-size="44" font-family="Helvetica" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">${c} ${i} ${m.confidence?.toFixed(2)}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">${paths.join("")}</svg>`;
  const drawn = await sharp(photo.bytes).composite([{ input: Buffer.from(svg) }]).toBuffer();
  await sharp(drawn).resize(900, 900, { fit: "inside" }).jpeg({ quality: 80 }).toFile(path.join(out, `${name}-${c}.jpg`));
}
