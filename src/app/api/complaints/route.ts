import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { CACHE_BASE, readJson, writeJson } from "@/lib/cache";
import { takeLiveRun } from "@/lib/limits";
import { sparkJson, text as textPart } from "@/lib/meta/spark";
import type { GarmentKind } from "@/lib/pattern/types";
import { WORN } from "@/lib/fit/alter";
import { MAX_TEXT, prompt, SCHEMA, type ReadComplaints } from "@/lib/fit/read-complaint";

export const maxDuration = 60;

// The wearer's words in, Spark's sorting of them out (cached by text and garment). The browser
// checks the result against the text and applies the alteration rules.
export async function POST(request: Request) {
  let body: { text?: unknown; garment?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_input" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const garment = String(body.garment);
  if (!text || text.length > MAX_TEXT || !WORN.includes(garment as GarmentKind)) return Response.json({ error: "bad_input" }, { status: 400 });

  const sha = createHash("sha256").update(`${garment}\n${text}`).digest("hex");
  const cacheFile = path.join(CACHE_BASE, "complaints", `${sha.slice(0, 16)}.json`);
  const cached = await readJson<ReadComplaints>(cacheFile);
  if (cached) return Response.json({ read: cached });

  const limit = takeLiveRun(request);
  if (limit) return Response.json({ error: limit }, { status: limit === "live_disabled" ? 503 : 429 });
  try {
    const read = await sparkJson<ReadComplaints>([textPart(prompt(garment as GarmentKind, text))], SCHEMA, 1500);
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeJson(cacheFile, read);
    return Response.json({ read });
  } catch (e) {
    console.error("complaint read failed", e);
    return Response.json({ error: "api_failed" }, { status: 502 });
  }
}
