import path from "node:path";
import { CACHE_BASE } from "@/lib/cache";
import { takeLiveRun } from "@/lib/limits";
import type { Fabric, GarmentKind } from "@/lib/pattern/types";
import { CONCEPTS, preparePhoto, runPhoto } from "@/lib/photo/run";

const MAX_BYTES = 4 * 1024 * 1024; // the browser resizes to 2000 px JPEG first, well under this
const FABRICS: readonly Fabric[] = ["woven", "knit"];

export const maxDuration = 60;

// Photo in, measurements out. The browser already has the photo, so only the run comes back;
// the pattern is drafted in the browser from the measurements (which the user may correct).
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length"));
  if (!length) return Response.json({ error: "length_required" }, { status: 411 });
  if (length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  const form = await request.formData();
  const file = form.get("photo"), garment = String(form.get("garment")), fabric = String(form.get("fabric"));
  if (!(file instanceof File) || !/^image\/(jpeg|png|webp)$/.test(file.type)) return Response.json({ error: "bad_type" }, { status: 400 });
  if (!(garment in CONCEPTS) || !FABRICS.includes(fabric as Fabric)) return Response.json({ error: "bad_input" }, { status: 400 });

  let photo;
  try {
    photo = await preparePhoto(Buffer.from(await file.arrayBuffer()));
  } catch {
    return Response.json({ error: "bad_image" }, { status: 400 });
  }
  // No A4 in the photo: one tape-measured value may set the scale instead.
  const refKey = String(form.get("refKey") ?? ""), refCm = Number(form.get("refCm"));
  const reference = /^[a-zA-Z]+$/.test(refKey) && refCm > 0 && refCm < 200 ? { key: refKey, cm: refCm } : undefined;
  const input = { photo, garment: garment as GarmentKind, fabric: fabric as Fabric, cacheRoot: path.join(CACHE_BASE, "photos"), reference };
  // A photo already segmented costs nothing and doesn't count against the limits.
  let run = await runPhoto({ ...input, allowApi: false });
  if (!run.ok && run.stage === "cost") {
    const limit = takeLiveRun(request);
    if (limit) return Response.json({ error: limit }, { status: limit === "live_disabled" ? 503 : 429 });
    try {
      run = await runPhoto({ ...input, allowApi: true });
    } catch (e) {
      console.error("photo run failed", e);
      return Response.json({ error: "api_failed" }, { status: 502 });
    }
  }
  if (!run.ok) return Response.json({ run });
  const { pattern: _pattern, ...rest } = run;
  void _pattern;
  return Response.json({ run: rest, size: [photo.width, photo.height] });
}
