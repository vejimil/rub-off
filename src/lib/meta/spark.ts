import type { ResponseInputContent } from "openai/resources/responses/responses";
import { meta, MODELS } from "./client.ts";

// Muse Spark with structured output on the Responses API. Streamed, because non-streaming calls
// can return 504; store: false, so nothing is kept server-side.
export async function sparkJson<T>(
  content: ResponseInputContent[],
  schema: { name: string; schema: Record<string, unknown> },
  maxOutputTokens = 4000,
): Promise<T> {
  const stream = await meta().responses.create({
    model: MODELS.text,
    input: [{ type: "message", role: "user", content }],
    text: { format: { type: "json_schema", name: schema.name, schema: schema.schema, strict: true } },
    reasoning: { effort: "low" },
    max_output_tokens: maxOutputTokens,
    store: false,
    stream: true,
  });
  let text = "";
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") text += event.delta;
    else if (event.type === "response.failed" || event.type === "error") {
      throw new Error(`Muse Spark failed: ${JSON.stringify(event).slice(0, 300)}`);
    } else if (event.type === "response.incomplete") {
      throw new Error(`Muse Spark stopped early: ${event.response.incomplete_details?.reason ?? "unknown"}`);
    }
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Muse Spark returned text that isn't JSON: ${text.slice(0, 200)}`);
  }
}

// Spark's 0–1000 points and boxes are relative to exactly the image sent here.
export const image = (bytes: Buffer, mime: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg") =>
  ({ type: "input_image", image_url: `data:${mime};base64,${bytes.toString("base64")}` }) as ResponseInputContent;
export const text = (t: string) => ({ type: "input_text", text: t }) as ResponseInputContent;
