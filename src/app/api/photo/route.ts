import path from "node:path";
import { CACHE_BASE } from "@/lib/cache";
import { takeLiveRun } from "@/lib/limits";
import type { Fabric, GarmentKind } from "@/lib/pattern/types";
import { L } from "@/lib/i18n/lang";
import { GARMENT_NAME } from "@/lib/i18n/names";
import { cachedIdentify, identify, standUpright, type Identified } from "@/lib/photo/identify";
import { CONCEPTS, photoCacheDir, preparePhoto, runPhoto, type PhotoRun } from "@/lib/photo/run";

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
  // "auto": Muse Spark says what the item is and which word to hand SAM.
  const auto = garment === "auto";
  if ((!auto && !(garment in CONCEPTS)) || !FABRICS.includes(fabric as Fabric)) return Response.json({ error: "bad_input" }, { status: 400 });

  let photo;
  try {
    photo = await preparePhoto(Buffer.from(await file.arrayBuffer()));
  } catch {
    return Response.json({ error: "bad_image" }, { status: 400 });
  }
  // No A4 in the photo: one tape-measured value may set the scale instead.
  const refKey = String(form.get("refKey") ?? ""), refCm = Number(form.get("refCm"));
  const reference = /^[a-zA-Z]+$/.test(refKey) && refCm > 0 && refCm < 200 ? { key: refKey, cm: refCm } : undefined;
  // Shoulder points tapped on the photo: up to two, as fractions of its width and height.
  let shoulders: [number, number][] | undefined;
  try {
    const raw = JSON.parse(String(form.get("shoulders") ?? "[]"));
    if (Array.isArray(raw) && raw.length <= 2 && raw.every((p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === "number" && x >= 0 && x <= 1))) shoulders = raw.length ? raw : undefined;
  } catch {
    return Response.json({ error: "bad_input" }, { status: 400 });
  }
  const cacheRoot = path.join(CACHE_BASE, "photos");
  // One live run covers everything this photo needs: taken once, the first time an API call is due.
  let paid = false;
  const pay = () => {
    if (paid) return null;
    const limit = takeLiveRun(request);
    if (!limit) paid = true;
    return limit;
  };
  // Muse Spark looks first: with "auto" it says what the item is; either way it says which way the
  // item lies (and the SAM word), so the photo can be stood upright before SAM sees it.
  const given = auto ? undefined : (garment as GarmentKind);
  const dir = photoCacheDir(cacheRoot, photo);
  let identified: Identified | null = await cachedIdentify(dir, given);
  if (!identified) {
    const limit = pay();
    if (limit) return Response.json({ error: limit }, { status: limit === "live_disabled" ? 503 : 429 });
    try {
      identified = await identify(photo, dir, given);
    } catch (e) {
      console.error("identify failed", e);
      // Without the kind nothing can go on; with it, the photo is measured as it lies.
      if (auto) return Response.json({ error: "api_failed" }, { status: 502 });
    }
  }
  if (identified && identified.garment === "something else") {
    const run: PhotoRun = { ok: false, stage: "identify", detail: L("이 옷은 아직 패턴으로 만들 수 있는 종류가 아닙니다. 위에서 가장 가까운 종류를 골라 주십시오.", "This isn't one of the kinds the app can make a pattern of yet. Choose the closest kind above.", "Esta prenda aún no es de los tipos que la app sabe convertir en patrón. Elige arriba el tipo más parecido.") };
    return Response.json({ run, identified });
  }
  // Lying on its side: stood upright before SAM sees it, and the browser shows the turned photo.
  let upright: { jpeg: string; width: number; height: number } | undefined;
  if (identified) {
    const turned = await standUpright(photo, identified, cacheRoot, given);
    if (turned) {
      [photo, identified] = [turned.photo, turned.id];
      upright = { jpeg: turned.jpeg.toString("base64"), width: photo.width, height: photo.height };
    }
  }
  const kind = (auto && identified ? identified.garment : garment) as GarmentKind;
  const input = {
    photo,
    garment: kind,
    fabric: (auto && identified && identified.fabric !== "unclear" ? identified.fabric : fabric) as Fabric,
    cacheRoot,
    reference,
    shoulders,
    garmentConcept: identified?.word,
  };
  let run;
  try {
    // A photo already segmented costs nothing and doesn't count against the limits. If Spark's word
    // finds nothing, the run tries the kind's own word and then "clothing".
    run = await runPhoto({ ...input, allowApi: false });
    if (!run.ok && run.stage === "cost") run = pay() ?? (await runPhoto({ ...input, allowApi: true }));
  } catch (e) {
    console.error("photo run failed", e);
    return Response.json({ error: "api_failed" }, { status: 502 });
  }
  if (typeof run === "string") return Response.json({ error: run }, { status: run === "live_disabled" ? 503 : 429 });
  // Told wrong (Spark took the owner's hoodie lying on its side for trousers half the time), the
  // garment's own geometry fails: say what it was taken for, so the user can choose the kind.
  if (!run.ok && auto && identified && (run.stage === "segment" || run.stage === "measure")) {
    const name = GARMENT_NAME[kind];
    run = { ...run, detail: L(`${run.detail.ko} 사진 속 옷을 ‘${name.ko}’(으)로 알아봤습니다. 다른 옷이면 위에서 종류를 직접 골라 다시 재 주십시오.`, `${run.detail.en} The item was taken for: ${name.en}. If it is something else, choose the kind above and measure again.`, `${run.detail.es} La prenda se tomó por: ${name.es}. Si es otra cosa, elige el tipo arriba y vuelve a medir.`) };
  }
  if (!run.ok) return Response.json({ run, upright, ...(auto && identified ? { identified } : {}) });
  const { pattern: _pattern, ...rest } = run;
  void _pattern;
  return Response.json({ run: auto && identified ? { ...rest, identified } : rest, size: [photo.width, photo.height], upright });
}
