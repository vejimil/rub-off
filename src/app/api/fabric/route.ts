import path from "node:path";
import { CACHE_BASE } from "@/lib/cache";
import { takeLiveRun } from "@/lib/limits";
import { runFabric } from "@/lib/photo/fabric";
import { preparePhoto } from "@/lib/photo/run";

const MAX_BYTES = 4 * 1024 * 1024;

export const maxDuration = 60;

// Fabric scraps photo in, cm polygons out. The layout itself runs in the browser.
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length"));
  if (!length) return Response.json({ error: "length_required" }, { status: 411 });
  if (length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  const file = (await request.formData()).get("photo");
  if (!(file instanceof File) || !/^image\/(jpeg|png|webp)$/.test(file.type)) return Response.json({ error: "bad_type" }, { status: 400 });

  let photo;
  try {
    photo = await preparePhoto(Buffer.from(await file.arrayBuffer()));
  } catch {
    return Response.json({ error: "bad_image" }, { status: 400 });
  }
  const cacheRoot = path.join(CACHE_BASE, "fabric");
  let run = await runFabric(photo, cacheRoot, false);
  if (!run.ok && run.stage === "cost") {
    const limit = takeLiveRun(request);
    if (limit) return Response.json({ error: limit }, { status: limit === "live_disabled" ? 503 : 429 });
    try {
      run = await runFabric(photo, cacheRoot, true);
    } catch (e) {
      console.error("fabric run failed", e);
      return Response.json({ error: "api_failed" }, { status: 502 });
    }
  }
  return Response.json({ run, size: [photo.width, photo.height] });
}
