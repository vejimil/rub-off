import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  parseImageStream,
  recordsOfKind,
  type ImageSegmentationResult,
  type SegmentationMaskRecord,
} from "@meta-sam/parser";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { meta, MODELS } from "./client.ts";

// SAM 3.1 on a single still. Billed per image ($2.50 per 1k), so every raw response is cached
// and a rerun on the same image and concept costs nothing.
export const SAM_IMAGE_USD = 2.5 / 1000;

export interface ImageInput {
  bytes: Buffer;
  mime: "image/jpeg" | "image/png" | "image/webp";
}

const rawPath = (cacheDir: string, concept: string) => path.join(cacheDir, `${concept.replace(/[^a-z0-9]+/gi, "-")}.raw.txt`);

export async function cachedImageConcept(cacheDir: string, concept: string): Promise<ImageSegmentationResult | null> {
  let raw: string;
  try {
    raw = await readFile(rawPath(cacheDir, concept), "utf8");
  } catch {
    return null;
  }
  return replay(raw);
}

// One short noun phrase per request. Zero matches is a valid, empty result.
export async function segmentImageConcept(image: ImageInput, concept: string, cacheDir: string): Promise<ImageSegmentationResult> {
  const cached = await cachedImageConcept(cacheDir, concept);
  if (cached) return cached;

  const events = await meta().responses.create({
    model: MODELS.segment,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: concept },
          { type: "input_image", image_url: `data:${image.mime};base64,${image.bytes.toString("base64")}` } as ResponseInputContent,
        ],
      },
    ],
    stream: true,
    metadata: { mask_encoding: "one_bit", include_confidence: "true" },
  });
  const result = await parseImageStream(events).finalResult;
  // A truncated stream is returned but not cached, so the next run retries it.
  if (result.outcome.status === "completed") {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(rawPath(cacheDir, concept), result.rawOutput);
  }
  return result;
}

// Re-parse cached raw output without another API call.
function replay(raw: string): Promise<ImageSegmentationResult> {
  const lane = { item_id: "cached", output_index: 0, content_index: 0 };
  async function* events() {
    yield { type: "response.output_text.delta" as const, delta: raw, ...lane };
    yield { type: "response.output_text.done" as const, text: raw, ...lane };
    yield { type: "response.completed" as const };
  }
  return parseImageStream(events()).finalResult;
}

export function imageMasks(result: ImageSegmentationResult): SegmentationMaskRecord[] {
  return [...recordsOfKind(result.records, "mask")];
}
