import "server-only";
import OpenAI from "openai";

// Meta Model API is OpenAI SDK compatible: same client, different base URL and key.
export const META_BASE_URL = "https://api.meta.ai/v1";

export const MODELS = {
  text: "muse-spark-1.3", // Standard mode: requests are not used to train Meta models
  image: "muse-image-1.0",
  segment: "sam-3.1",
} as const;

let client: OpenAI | null = null;

export function meta(): OpenAI {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not set. Copy .env.example to .env.local.");
  // No automatic retries: a retried request is billed again, and billing has no cap.
  client ??= new OpenAI({ apiKey, baseURL: META_BASE_URL, maxRetries: 0, timeout: 300_000 });
  return client;
}
