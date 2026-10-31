// Checks that MODEL_API_KEY works: `npm run ping`
import OpenAI from "openai";

const apiKey = process.env.MODEL_API_KEY;
if (!apiKey) {
  console.error("MODEL_API_KEY is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const client = new OpenAI({ apiKey, baseURL: "https://api.meta.ai/v1" });
const res = await client.responses.create({
  model: "muse-spark-1.3",
  input: "Reply with exactly: OK",
});
console.log("model:", res.model);
console.log("output:", res.output_text);
