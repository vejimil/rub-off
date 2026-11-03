// First look at a new photo: Muse Spark says what the item is, from the kinds the app can draft,
// whether the cloth is knit or woven, and which one short noun to hand SAM 3.1 for it. SAM takes a
// single noun and the word matters ("shirt" found nothing on the owner's T-shirt back where
// "t-shirt" found it at 0.99; "jacket" nothing on a zip hoodie where "hoodie" found it), so the
// noun is chosen per photo from a fixed list, and the app's own word for the kind stays as the
// fallback. Spark answers only from fixed options; it measures nothing.
// It also says which edge of the photo the item's top points to, and the photo is stood upright
// before SAM sees it: on the owner's denim zip hoodie lying with its hood to the left, "hoodie"
// and "hood" found nothing; the same photo turned neck-up, 0.64 and 0.94 (11/3).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { image, sparkJson, text } from "../meta/spark.ts";
import type { GarmentKind } from "../pattern/types.ts";
import { photoCacheDir, preparePhoto, type Prepared } from "./run.ts";

// What each kind means, for Spark. The app drafts these and nothing else; categories, not exact
// styles (it drafts any trousers as elastic-waist ones), so the closest one is the answer. Spark
// called the owner's shorts "something else" when pants read "elastic-waist trousers or shorts".
const KINDS: Record<GarmentKind, string> = {
  "t-shirt": "short-sleeved T-shirt (knit, no opening)",
  "long-sleeve": "long-sleeved T-shirt (knit, no opening, no ribbed hem)",
  sweatshirt: "sweatshirt (long sleeves, ribbed hem and cuffs, no hood, no zip)",
  dress: "T-shirt dress (a T-shirt long enough to be a dress)",
  shirt: "button-front shirt (woven, collar, cuffs)",
  hoodie: "zip-front hoodie (hood, zip down the centre front, ribbed hem and cuffs)",
  pants: "trousers or shorts, any waist",
  skirt: "straight or gathered skirt",
  "a-line-skirt": "A-line (flared) skirt",
  "eco-bag": "tote bag with two handles",
  apron: "bib apron",
  cushion: "cushion cover",
  pouch: "zip pouch",
};
const OTHER = "something else";
// What "the top" of each kind is, for saying which way it lies.
const TOP_OF: Record<GarmentKind, string> = {
  "t-shirt": "the neckline", "long-sleeve": "the neckline", sweatshirt: "the neckline", dress: "the neckline", shirt: "the collar", hoodie: "the hood",
  pants: "the waistband", skirt: "the waistband", "a-line-skirt": "the waistband", "eco-bag": "the handles", apron: "the bib and neck strap", cushion: "any edge; answer top", pouch: "the zip",
};

// Nouns SAM is asked with. Short, everyday, one per request.
export const SAM_WORDS = ["t-shirt", "shirt", "top", "sweatshirt", "hoodie", "dress", "pants", "shorts", "trousers", "skirt", "bag", "tote bag", "apron", "cushion", "pillow", "pouch"] as const;

const NECK = ["top", "right", "bottom", "left"] as const;
// Clockwise quarter turns that bring each edge to the top.
const TURN: Record<(typeof NECK)[number], number> = { top: 0, right: 270, bottom: 180, left: 90 };

export interface Identified {
  garment: GarmentKind | typeof OTHER;
  fabric: "knit" | "woven" | "unclear";
  word: (typeof SAM_WORDS)[number];
  neck?: (typeof NECK)[number]; // missing in answers kept from before 11/3: taken as top
  seen?: (typeof PARTS)[number][];
}

// Parts Spark first says it sees, before the kind: asked straight for the kind, it called the
// owner's denim hoodie lying on its side trousers in half the tries (sleeves as legs, 11/3).
const PARTS = ["hood", "collar", "neckline", "two sleeves", "two legs", "crotch", "waistband", "zip down the centre", "buttons down the centre", "handles", "none of these"] as const;

const SCHEMA = {
  name: "identify_garment",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["seen", "neck", "garment", "fabric", "word"],
    properties: {
      seen: { type: "array", items: { type: "string", enum: PARTS }, description: "Every one of these parts you can actually see on the item." },
      neck: { type: "string", enum: NECK, description: "Which edge of the photo the item's top points toward: the neck or hood of a top or dress, the waistband of trousers or a skirt, the handles of a bag, the bib of an apron. Top if it has none." },
      garment: { type: "string", enum: [...Object.keys(KINDS), OTHER], description: "Which kind the item lying on the floor is." },
      fabric: { type: "string", enum: ["knit", "woven", "unclear"], description: "Knit (jersey, sweatshirt fleece, rib) or woven (shirting, denim, canvas, poplin)." },
      word: { type: "string", enum: SAM_WORDS, description: "The one everyday noun that best names this item." },
    },
  },
};

const LONG_SIDE = 1024;
const cacheFile = (cacheDir: string, kind?: GarmentKind) => path.join(cacheDir, kind ? `identify-${kind}.json` : "identify.json");

export async function cachedIdentify(cacheDir: string, kind?: GarmentKind): Promise<Identified | null> {
  try {
    return JSON.parse(await readFile(cacheFile(cacheDir, kind), "utf8")) as Identified;
  } catch {
    return null;
  }
}

// With `kind` (chosen by the user, or already told), Spark only says which way the item lies, the
// cloth and the SAM word. Lying on its side, the owner's denim hoodie was told as trousers in half
// the tries and as a hoodie in every try once turned neck-up (11/3); told it is a hoodie, Spark
// only has to find the hood.
export async function identify(photo: { bytes: Buffer }, cacheDir: string, kind?: GarmentKind): Promise<Identified> {
  const cached = await cachedIdentify(cacheDir, kind);
  if (cached) return cached;
  const jpeg = await sharp(photo.bytes).resize(LONG_SIDE, LONG_SIDE, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  const kinds = Object.entries(KINDS).map(([k, d]) => `- ${k}: ${d}`).join("\n");
  const intro = `An item of clothing or a sewn item is laid flat on the floor, photographed from above, usually with an A4 sheet of paper beside or on it. Ignore the paper and anything else on the floor.
The photo may be turned, so the item can lie on its side or upside down.`;
  const prompt = kind
    ? `${intro}
The item is a ${KINDS[kind]}. First list the parts you can see, then say which edge of the photo its top (${TOP_OF[kind]}) points toward.
Also say whether its cloth is knit or woven, and which single everyday noun from the list best names it. Choose only from the given options.`
    : `${intro} Tell a top from trousers by how it is built, not by which way it points: a top has a neckline (often a hood or collar) and two sleeves coming out of the sides of the body; trousers have a waistband and two legs that split apart at a crotch.
First list the parts you can see, then say which edge of the photo the item's top points toward, then which of these kinds it is closest to. Answer "${OTHER}" only if it belongs to none of these categories at all (for example a coat, a jacket with lapels, a shoe).
${kinds}
Also say whether its cloth is knit or woven, and which single everyday noun from the list best names it. Choose only from the given options.`;
  const schema = kind ? { ...SCHEMA, schema: { ...SCHEMA.schema, properties: { ...SCHEMA.schema.properties, garment: { type: "string", enum: [kind] } } } } : SCHEMA;
  const result = await sparkJson<Identified>([text(prompt), image(jpeg)], schema, 3000);
  await saveIdentified(cacheDir, result, kind);
  return result;
}

async function saveIdentified(cacheDir: string, id: Identified, kind?: GarmentKind) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cacheFile(cacheDir, kind), JSON.stringify(id, null, 2));
}

// The photo turned so the item's top is up, or null if it already is. The turned JPEG is what the
// browser shows and sends from then on; the photo prepared from it (the one measured) gets the
// same answer kept, turned to "top", so sending it again costs nothing.
export async function standUpright(photo: Prepared, id: Identified, cacheRoot: string, kind?: GarmentKind): Promise<{ jpeg: Buffer; photo: Prepared; id: Identified } | null> {
  const deg = TURN[id.neck ?? "top"];
  if (!deg) return null;
  const jpeg = await sharp(photo.bytes).rotate(deg).jpeg({ quality: 90 }).toBuffer();
  const turned = await preparePhoto(jpeg);
  const upright: Identified = { ...id, neck: "top" };
  await saveIdentified(photoCacheDir(cacheRoot, turned), upright, kind);
  return { jpeg, photo: turned, id: upright };
}
