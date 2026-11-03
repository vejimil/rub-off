// "This garment, made in this fabric": Muse Image edits the garment photo with the fabric photo as
// its second input, and only the garment's own pixels are kept. Muse Image has no mask input, so
// the SAM 3.1 garment mask (with the hood, without the A4 sheet lying on it) is laid over the
// original as a soft-edged alpha: everything outside the garment stays the original photo, pixel
// for pixel. A picture to decide on a fabric, never a source of any measurement.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { dilate, type Grid } from "../geom/grid.ts";
import { META_BASE_URL, MODELS } from "../meta/client.ts";

export const PREVIEW_USD = 0.01;
// bump when the prompt changes, so a cached preview isn't reused. v3 asks for every edge to stay:
// v2 drew the owner's denim hoodie's sleeves a little thinner, leaving floor and a faint old
// outline inside the mask; v3 still did (the floor lines up exactly, only the sleeves move; 11/3).
const VERSION = 3;
const FEATHER_PX = 1.5;
// SAM's mask stops a pixel or two inside the garment's edge, which left a thin line of the old
// colour round the owner's denim hoodie in green (11/3); the mask is grown by this much first.
const GROW_PX = 2;

const PROMPT = `Image 1 is a photo of a garment laid flat on a floor, seen from above. Image 2 is a photo of a fabric.
Edit image 1 so that the whole garment, every part of it (body, sleeves, collar or neckband, hood, cuffs, hem), is made entirely of the fabric in image 2, as if it had been sewn from that fabric. Remove the garment's original colour, print and graphics. Scale the fabric's pattern as it would be on a real garment and let it follow the garment's folds and seams.
Keep the garment's outline, size and position exactly as in image 1: every edge stays where it is, and no part (sleeve, cuff, hood, hem) becomes thinner, wider, shorter or longer. Keep the floor, the sheet of paper and every other object exactly as they are.`;

export const previewFile = (cacheDir: string, fabricSha: string) => path.join(cacheDir, `preview-v${VERSION}-${fabricSha.slice(0, 16)}.jpg`);

export async function cachedPreview(cacheDir: string, fabricSha: string): Promise<Buffer | null> {
  try {
    return await readFile(previewFile(cacheDir, fabricSha));
  } catch {
    return null;
  }
}

// Whether making this preview again costs nothing (it, or Muse Image's output for it, is kept).
export async function previewIsFree(cacheDir: string, fabricSha: string): Promise<boolean> {
  const file = previewFile(cacheDir, fabricSha);
  return (await cachedPreview(cacheDir, fabricSha)) !== null || (await readFile(file.replace(/\.jpg$/, ".raw")).then(() => true, () => false));
}

export async function fabricPreview(
  garment: { bytes: Buffer; width: number; height: number },
  fabric: { bytes: Buffer; sha256: string },
  mask: Grid, // the garment, at the photo's size
  cacheDir: string,
): Promise<Buffer> {
  const cached = await cachedPreview(cacheDir, fabric.sha256);
  if (cached) return cached;
  const { width: w, height: h } = garment;
  // Muse Image's own output is kept, so a change in the compositing costs nothing.
  const rawFile = previewFile(cacheDir, fabric.sha256).replace(/\.jpg$/, ".raw");
  const raw = await readFile(rawFile).catch(() => null) ?? (await edit(garment, fabric, rawFile));
  // The edit at the photo's size; the garment's pixels from it, the rest from the original.
  const edited = await sharp(raw).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const grown = dilate(mask, GROW_PX);
  const alpha = Buffer.alloc(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = grown.data[i] ? 255 : 0;
  // blur() hands a single channel back as three; keep one.
  const soft = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(FEATHER_PX).extractChannel(0).raw().toBuffer();
  const garmentOnly = await sharp(edited, { raw: { width: w, height: h, channels: 3 } }).joinChannel(soft, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
  const out = await sharp(garment.bytes).composite([{ input: garmentOnly }]).jpeg({ quality: 88 }).toBuffer();
  await writeFile(previewFile(cacheDir, fabric.sha256), out);
  return out;
}

async function edit(garment: { bytes: Buffer; width: number; height: number }, fabric: { bytes: Buffer }, rawFile: string): Promise<Buffer> {
  const { width: w, height: h } = garment;
  // Several input images go as image[0], image[1]: the API refuses the OpenAI SDK's image[].
  const form = new FormData();
  form.set("model", MODELS.image);
  form.set("prompt", PROMPT);
  form.set("n", "1");
  form.set("size", `${w}x${h}`); // only its aspect is used
  form.set("image[0]", new Blob([new Uint8Array(garment.bytes)], { type: "image/jpeg" }), "garment.jpg");
  form.set("image[1]", new Blob([new Uint8Array(fabric.bytes)], { type: "image/jpeg" }), "fabric.jpg");
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not set. Copy .env.example to .env.local.");
  const http = await fetch(`${META_BASE_URL}/images/edits`, { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(120_000) });
  if (!http.ok) throw new Error(`Muse Image ${http.status}: ${(await http.text()).slice(0, 300)}`);
  const res = (await http.json()) as { data?: { b64_json?: string }[] };
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Muse Image returned no image");
  const bytes = Buffer.from(b64, "base64");
  await mkdir(path.dirname(rawFile), { recursive: true });
  await writeFile(rawFile, bytes);
  return bytes;
}
