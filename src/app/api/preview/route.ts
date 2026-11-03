import path from "node:path";
import { CACHE_BASE } from "@/lib/cache";
import { takeLiveRun } from "@/lib/limits";
import { SAM_WORDS } from "@/lib/photo/identify";
import { fabricPreview, previewIsFree } from "@/lib/photo/preview";
import { CONCEPTS, cachedGarmentMask, LAST_WORD, photoCacheDir, preparePhoto } from "@/lib/photo/run";

const MAX_BYTES = 8 * 1024 * 1024; // two photos, each resized to 2000 px JPEG in the browser
const WORDS = new Set<string>([...SAM_WORDS, ...Object.values(CONCEPTS).map((c) => c.garment), LAST_WORD]);

export const maxDuration = 60;

// The garment photo (already measured) and a fabric photo in; the garment shown in that fabric out,
// as a JPEG. Only the garment's pixels change.
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length"));
  if (!length) return Response.json({ error: "length_required" }, { status: 411 });
  if (length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  const form = await request.formData();
  const g = form.get("photo"), f = form.get("fabric"), word = String(form.get("word"));
  const isImage = (x: unknown): x is File => x instanceof File && /^image\/(jpeg|png|webp)$/.test(x.type);
  if (!isImage(g) || !isImage(f)) return Response.json({ error: "bad_type" }, { status: 400 });
  if (!WORDS.has(word)) return Response.json({ error: "bad_input" }, { status: 400 });

  let garment, fabric;
  try {
    [garment, fabric] = await Promise.all([preparePhoto(Buffer.from(await g.arrayBuffer())), preparePhoto(Buffer.from(await f.arrayBuffer()))]);
  } catch {
    return Response.json({ error: "bad_image" }, { status: 400 });
  }
  const cacheRoot = path.join(CACHE_BASE, "photos");
  const mask = await cachedGarmentMask(garment, cacheRoot, word);
  if (!mask) return Response.json({ error: "measure_first" }, { status: 409 });
  const cacheDir = photoCacheDir(cacheRoot, garment);
  if (!(await previewIsFree(cacheDir, fabric.sha256))) {
    const limit = takeLiveRun(request);
    if (limit) return Response.json({ error: limit }, { status: limit === "live_disabled" ? 503 : 429 });
  }
  let jpeg;
  try {
    jpeg = await fabricPreview(garment, fabric, mask, cacheDir);
  } catch (e) {
    console.error("preview failed", e);
    return Response.json({ error: "api_failed" }, { status: 502 });
  }
  return new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
}
