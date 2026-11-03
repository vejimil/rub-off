// The garment in another fabric, from a garment photo already measured and a fabric photo.
//   npm run preview -- garment.jpg fabric.jpg --word=t-shirt [--garment=hoodie]   prints the cost if not cached
//   --word: the SAM word the photo was measured with (npm run photo prints it); --garment: the kind
//   it was measured as, when it was chosen rather than told, so the photo is turned the same way
//   add --yes to call Muse Image once (about $0.01). Writes .cache/out/<garment>-in-<fabric>.jpg.
// The garment's mask comes from the SAM cache of `npm run photo`, so measure the photo first.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fabricPreview, previewIsFree, PREVIEW_USD } from "../src/lib/photo/preview.ts";
import type { GarmentKind } from "../src/lib/pattern/types.ts";
import { cachedIdentify, standUpright } from "../src/lib/photo/identify.ts";
import { cachedGarmentMask, photoCacheDir, preparePhoto } from "../src/lib/photo/run.ts";

const args = process.argv.slice(2);
const [garmentFile, fabricFile] = args.filter((a) => !a.startsWith("--"));
if (!garmentFile || !fabricFile) throw new Error("usage: npm run preview -- garment.jpg fabric.jpg --word=t-shirt [--yes]");
const word = args.find((a) => a.startsWith("--word="))?.slice(7) ?? "t-shirt";
const fabric = await preparePhoto(await readFile(fabricFile));
let garment = await preparePhoto(await readFile(garmentFile));
const cacheRoot = path.resolve(".cache", "photos");
// A photo that `npm run photo --garment=auto` stood upright is measured, and previewed, turned.
const kind = args.find((a) => a.startsWith("--garment="))?.slice(10) as GarmentKind | undefined;
const id = await cachedIdentify(photoCacheDir(cacheRoot, garment), kind);
if (id) garment = (await standUpright(garment, id, cacheRoot))?.photo ?? garment;
const mask = await cachedGarmentMask(garment, cacheRoot, word);
if (!mask) throw new Error(`No "${word}" mask cached for this photo. Run npm run photo on it first.`);
const cacheDir = photoCacheDir(cacheRoot, garment);
if (!(await previewIsFree(cacheDir, fabric.sha256)) && !args.includes("--yes")) {
  console.log(`Muse Image would run once, about $${PREVIEW_USD.toFixed(2)}. Rerun with --yes.`);
  process.exit(0);
}
const t0 = Date.now();
const jpeg = await fabricPreview(garment, fabric, mask, cacheDir);
const name = (f: string) => path.basename(f).replace(/\.[^.]+$/, "");
const out = path.resolve(".cache", "out", `${name(garmentFile)}-in-${name(fabricFile)}.jpg`);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, jpeg);
console.log(`wrote ${out} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
