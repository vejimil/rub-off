import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CACHE_BASE, readJson, writeJson } from "@/lib/cache";
import { takeLiveRun } from "@/lib/limits";
import { readSizeTable, type ReadTable } from "@/lib/size/read-table";

const MAX_BYTES = 4 * 1024 * 1024;

export const maxDuration = 60;

// A size table screenshot in, Spark's copy of its cells out (cached by the image's SHA-256).
// The browser shows it back for the user to confirm before deciding.
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length"));
  if (!length) return Response.json({ error: "length_required" }, { status: 411 });
  if (length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  const form = await request.formData();
  const file = form.get("table");
  if (!(file instanceof File) || !/^image\/(jpeg|png|webp)$/.test(file.type)) return Response.json({ error: "bad_type" }, { status: 400 });

  let png: Buffer;
  try {
    png = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 50e6 }).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    return Response.json({ error: "bad_image" }, { status: 400 });
  }
  const sha = createHash("sha256").update(png).digest("hex");
  const cacheFile = path.join(CACHE_BASE, "size-tables", `${sha.slice(0, 16)}.json`);
  const cached = await readJson<ReadTable>(cacheFile);
  if (cached) return Response.json({ table: cached });

  const limit = takeLiveRun(request);
  if (limit) return Response.json({ error: limit }, { status: limit === "live_disabled" ? 503 : 429 });
  try {
    const table = await readSizeTable(png, "image/png");
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeJson(cacheFile, table);
    return Response.json({ table });
  } catch (e) {
    console.error("size table read failed", e);
    return Response.json({ error: "api_failed" }, { status: 502 });
  }
}
