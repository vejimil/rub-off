// Second look at the photo before measuring: Muse Spark sees it with each SAM sleeve mask filled in
// a colour and numbered, and chooses from fixed answers whether each sleeve is spread flat,
// folded, hidden, bent or not a sleeve at all, and how wrinkled the garment is. Spark doesn't
// measure anything: the answers only decide which side the geometry trusts and how much ± the
// wrinkles add. Seated Tailor found Spark weak at pointing and strong at choosing from a list
// about coloured masks; this is the same pattern.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Pt } from "../geom/point.ts";
import { svgPath } from "../geom/point.ts";
import { image, sparkJson, text } from "../meta/spark.ts";

export const SLEEVE_STATES = ["spread flat", "folded over the body", "folded under or hidden", "bent or twisted", "not a sleeve"] as const;
export const WRINKLES = ["flat", "some wrinkles", "heavily wrinkled or bunched"] as const;
const COLORS = [
  { name: "red", hex: "#ff1a3c" },
  { name: "blue", hex: "#1a6dff" },
  { name: "green", hex: "#14c45a" },
  { name: "orange", hex: "#ff9a00" },
] as const;

export interface LayoutCheck {
  side: "front" | "back" | "unclear";
  sleeves: { number: number; state: (typeof SLEEVE_STATES)[number] }[];
  wrinkles: (typeof WRINKLES)[number];
  hem: "flat" | "folded or rolled";
}

// Extra relative ± for wrinkles: a wrinkled garment lies smaller than it is. On the owner's
// T-shirt (10/31), front and back photos both read "some wrinkles" and differed by 7–11% in hem
// and length, so "some" carries 4%.
export const WRINKLE_REL: Record<LayoutCheck["wrinkles"], number> = { flat: 0, "some wrinkles": 0.04, "heavily wrinkled or bunched": 0.08 };

const SCHEMA = {
  name: "layout_check",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["side", "sleeves", "wrinkles", "hem"],
    properties: {
      side: { type: "string", enum: ["front", "back", "unclear"], description: "Which side of the garment faces the camera." },
      sleeves: {
        type: "array",
        description: "One entry per numbered coloured region.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["number", "state"],
          properties: { number: { type: "integer" }, state: { type: "string", enum: SLEEVE_STATES } },
        },
      },
      wrinkles: { type: "string", enum: WRINKLES, description: "How flat the garment's body lies." },
      hem: { type: "string", enum: ["flat", "folded or rolled"], description: "Whether the bottom edge of the garment lies flat or is folded or rolled." },
    },
  },
};

const LONG_SIDE = 1024;

export function layoutCacheFile(cacheDir: string) {
  return path.join(cacheDir, "layout-check.json");
}

export async function cachedLayoutCheck(cacheDir: string, sleeveCount: number): Promise<LayoutCheck | null> {
  try {
    const c = JSON.parse(await readFile(layoutCacheFile(cacheDir), "utf8")) as LayoutCheck & { sleeveCount: number };
    return c.sleeveCount === sleeveCount ? c : null;
  } catch {
    return null;
  }
}

export async function layoutCheck(photo: { bytes: Buffer; width: number; height: number }, sleevesPx: Pt[][], cacheDir: string): Promise<LayoutCheck> {
  const cached = await cachedLayoutCheck(cacheDir, sleevesPx.length);
  if (cached) return cached;
  const { jpeg, regions } = await markedImage(photo, sleevesPx);
  const prompt = `This is a garment laid on the floor to be measured from above.
${sleevesPx.length ? `A segmentation model marked these regions as sleeves: ${regions}. For each numbered region, say what it really is: spread flat (lying out to the side, not folded), folded over the body, folded under or hidden, bent or twisted, or not a sleeve (for example a hood or a pocket).` : "No sleeves were marked; return an empty sleeves list."}
Also say which side faces the camera, how wrinkled the garment's body is, and whether the hem lies flat. Choose only from the given options.`;
  const result = await sparkJson<LayoutCheck>([text(prompt), image(jpeg)], SCHEMA, 4000);
  await mkdir(cacheDir, { recursive: true });
  await writeFile(layoutCacheFile(cacheDir), JSON.stringify({ ...result, sleeveCount: sleevesPx.length }, null, 2));
  return result;
}

// The photo at 1024 px with each region filled in its colour and numbered, and the regions named
// for the prompt ("region 1 (red), region 2 (blue)"). At most four regions.
export async function markedImage(photo: { bytes: Buffer; width: number; height: number }, regionsPx: Pt[][]): Promise<{ jpeg: Buffer; regions: string }> {
  const k = Math.min(1, LONG_SIDE / Math.max(photo.width, photo.height));
  const w = Math.round(photo.width * k), h = Math.round(photo.height * k);
  const marks = regionsPx.slice(0, COLORS.length).map((poly, i) => {
    const pts = poly.map(([x, y]): Pt => [x * k, y * k]);
    const c: Pt = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    return `<path d="${svgPath(pts, true)}" fill="${COLORS[i].hex}" fill-opacity="0.35" stroke="${COLORS[i].hex}" stroke-width="4"/>
      <text x="${c[0]}" y="${c[1]}" font-size="56" font-family="Helvetica" font-weight="bold" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${i + 1}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${marks.join("")}</svg>`;
  const jpeg = await sharp(await sharp(photo.bytes).resize(w, h).toBuffer()).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 85 }).toBuffer();
  const regions = regionsPx.slice(0, COLORS.length).map((_, i) => `region ${i + 1} (${COLORS[i].name})`).join(", ");
  return { jpeg, regions };
}
export const MAX_REGIONS = COLORS.length;

// Spark's answer per sleeve mask, in mask order: usable only when spread flat. A bent sleeve is
// left out too: its length measured straight would come out short.
export function usableSleeves(check: LayoutCheck, count: number): boolean[] {
  return Array.from({ length: count }, (_, i) => {
    const a = check.sleeves.find((s) => s.number === i + 1);
    return !a || a.state === "spread flat";
  });
}
