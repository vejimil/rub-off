// What each pocket SAM 3.1 found really is. Spark sees the photo with every "pocket" mask filled
// in a colour and numbered, and chooses from fixed answers: a patch pocket sewn on top (square or
// rounded corners), a kangaroo pocket across the centre front, one half of a kangaroo split by a
// zip, a pocket let into a seam or a welt (which changes the garment's own seams, so the pattern
// leaves it out), or not a pocket at all (a print, a label, the A4 sheet); and whether the whole
// pocket is in view or partly covered. Spark gives no size or place: those come from the masks.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Pt } from "../geom/point.ts";
import { image, sparkJson, text } from "../meta/spark.ts";
import { markedImage } from "./layout-check.ts";

export const POCKET_KINDS = [
  "patch pocket with square corners",
  "patch pocket with rounded bottom corners",
  "kangaroo pocket across the centre front",
  "half of a kangaroo pocket split by a zip",
  "set into a seam, or a welt pocket",
  "not a pocket",
] as const;
export const POCKET_VIEW = ["whole pocket in view", "partly covered or folded"] as const;

export interface PocketCheck {
  pockets: { number: number; kind: (typeof POCKET_KINDS)[number]; view: (typeof POCKET_VIEW)[number] }[];
}

const SCHEMA = {
  name: "pocket_check",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["pockets"],
    properties: {
      pockets: {
        type: "array",
        description: "One entry per numbered coloured region.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["number", "kind", "view"],
          properties: { number: { type: "integer" }, kind: { type: "string", enum: POCKET_KINDS }, view: { type: "string", enum: POCKET_VIEW } },
        },
      },
    },
  },
};

const cacheFile = (cacheDir: string) => path.join(cacheDir, "pocket-check.json");

export async function cachedPocketCheck(cacheDir: string, count: number): Promise<PocketCheck | null> {
  try {
    const c = JSON.parse(await readFile(cacheFile(cacheDir), "utf8")) as PocketCheck & { count: number };
    return c.count === count ? c : null;
  } catch {
    return null;
  }
}

export async function pocketCheck(photo: { bytes: Buffer; width: number; height: number }, pocketsPx: Pt[][], cacheDir: string): Promise<PocketCheck> {
  const cached = await cachedPocketCheck(cacheDir, pocketsPx.length);
  if (cached) return cached;
  const { jpeg, regions } = await markedImage(photo, pocketsPx);
  const prompt = `This is a garment laid on the floor, photographed from above. A segmentation model marked these regions as pockets: ${regions}.
For each numbered region, say what kind of pocket it is, or that it is not a pocket (for example a print, a label, a sheet of paper or a fold), and whether the whole pocket is in view or part of it is covered or folded. Choose only from the given options.`;
  const result = await sparkJson<PocketCheck>([text(prompt), image(jpeg)], SCHEMA, 1500);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cacheFile(cacheDir), JSON.stringify({ ...result, count: pocketsPx.length }, null, 2));
  return result;
}
