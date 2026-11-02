// Fabric scraps photographed flat next to an A4 sheet → each scrap as a cm polygon on the floor
// plane, plus the matrix that maps cm back onto the photo for drawing the layout over it.

import path from "node:path";
import { components, rasterize, traceOuter, unionAll, area, type Grid } from "../geom/grid.ts";
import { homography, type Mat3 } from "../geom/homography.ts";
import { simplifyClosed } from "../geom/polygon.ts";
import type { Pt } from "../geom/point.ts";
import { cachedImageConcept, imageMasks, SAM_IMAGE_USD, segmentImageConcept } from "../meta/sam-image.ts";
import { a4Scale, garmentPlane, type A4Scale } from "../scale/a4.ts";
import { PAPER, type Prepared } from "./run.ts";

// [A] "fabric" against "cloth" to be compared on a real photo.
export const FABRIC = "fabric";
const MIN_SCRAP_CM2 = 50;

export type FabricRun =
  | { ok: false; stage: "cost" | "segment" | "scale"; detail: string; pendingConcepts?: string[]; usd?: number }
  | { ok: true; scrapsCm: Pt[][]; cmToPx: Mat3; paperPx: Pt[]; rel: number };

export async function runFabric(photo: Prepared, cacheRoot: string, allowApi: boolean): Promise<FabricRun> {
  const cacheDir = path.join(cacheRoot, photo.sha256.slice(0, 16));
  const pending: string[] = [];
  for (const c of [FABRIC, PAPER]) if (!(await cachedImageConcept(cacheDir, c))) pending.push(c);
  if (pending.length && !allowApi) return { ok: false, stage: "cost", detail: `SAM would run ${pending.length} concept(s)`, pendingConcepts: pending, usd: pending.length * SAM_IMAGE_USD };

  const image = { bytes: photo.bytes, mime: "image/jpeg" as const };
  const [fab, pap] = await Promise.all([segmentImageConcept(image, FABRIC, cacheDir), segmentImageConcept(image, PAPER, cacheDir)]);
  const good = (r: typeof fab) => imageMasks(r).filter((m) => (m.confidence ?? 1) >= 0.5);
  if (good(fab).length === 0) return { ok: false, stage: "segment", detail: "사진에서 원단을 찾지 못했습니다. 원단을 바닥에 펴고 전체가 보이게 다시 찍어 주십시오." };

  let scale: A4Scale | null = null, paperGrid: Grid | null = null, why = "A4 용지를 찾지 못했습니다.";
  for (const p of good(pap).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))) {
    const g = rasterize(p, photo.width, photo.height);
    const s = a4Scale(g);
    if (s.ok) {
      [scale, paperGrid] = [s, g];
      break;
    }
    why = s.detail;
  }
  if (!scale || !paperGrid) return { ok: false, stage: "scale", detail: why };

  // Each separate scrap, the sheet cut out of it (it may lie on the fabric).
  const fabricGrid = unionAll(good(fab).map((m) => rasterize(m, photo.width, photo.height)), photo.width, photo.height);
  for (let i = 0; i < fabricGrid.data.length; i++) if (paperGrid.data[i]) fabricGrid.data[i] = 0;
  const contours = components(fabricGrid).filter((c) => area(c) > 0).map(traceOuter);
  const plane = garmentPlane(scale, contours.flat());
  if ("ok" in plane) return { ok: false, stage: "scale", detail: plane.detail };
  const scrapsCm = contours
    .map((c) => simplifyClosed(c.map(plane.toCm), 0.3))
    .filter((p) => p.length >= 3 && Math.abs(areaOf(p)) >= MIN_SCRAP_CM2);
  // cm → px: the inverse homography, or the plain scale.
  const k = scale.pxPerCm;
  const cmToPx = (plane.perspective ? homography(scale.cornersPx.map(plane.toCm), scale.cornersPx) : null) ?? [k, 0, 0, 0, k, 0, 0, 0, 1];
  return { ok: true, scrapsCm, cmToPx, paperPx: scale.cornersPx, rel: plane.rel };
}

function areaOf(p: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) a += p[i][0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * p[i][1];
  return a / 2;
}
