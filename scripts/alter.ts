// Sort a wearer's words into the complaint list with Muse Spark, then print the alterations.
//   npm run alter -- "휠체어에 앉으면 바지 뒤가 내려가요" --garment=pants
//   add --yes to call Spark when the text isn't cached (well under $0.01); --save=file.json keeps the result;
//   --lang=en|es prints the alterations in English or Spanish
// Spark's raw answer is cached by the text and garment, the same key the web route uses.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../src/lib/cache.ts";
import { fromComplaint, guarded } from "../src/lib/fit/alter.ts";
import { parse, prompt, SCHEMA, type ReadComplaints } from "../src/lib/fit/read-complaint.ts";
import { sparkJson, text as textPart } from "../src/lib/meta/spark.ts";
import { isLang } from "../src/lib/i18n/lang.ts";
import type { GarmentKind } from "../src/lib/pattern/types.ts";

const args = process.argv.slice(2);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const words = args.find((a) => !a.startsWith("--"));
const garment = (opt("garment") ?? "pants") as GarmentKind;
const asked = opt("lang");
const lang = isLang(asked) ? asked : "ko";
if (!words) {
  console.log('Usage: npm run alter -- "what is wrong" --garment=pants [--yes] [--save=file.json]');
  process.exit(1);
}
const sha = createHash("sha256").update(`${garment}\n${words.trim()}`).digest("hex");
const cacheFile = path.resolve(".cache", "complaints", `${sha.slice(0, 16)}.json`);

let read = await readJson<ReadComplaints>(cacheFile);
if (!read) {
  if (!args.includes("--yes")) {
    console.log("Muse Spark would read this text once (well under $0.01). Rerun with --yes to spend it.");
    process.exit(0);
  }
  read = await sparkJson<ReadComplaints>([textPart(prompt(garment, words.trim()))], SCHEMA, 1500);
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeJson(cacheFile, read);
}
console.log(JSON.stringify(read, null, 2));
for (const c of parse(read, words.trim(), garment)) {
  const a = guarded(fromComplaint(garment, c));
  console.log(`- ${a.action[lang]} (${a.part[lang]}): ${a.instruction[lang]}  [${a.from[lang]}]`);
}
const save = opt("save");
if (save) await writeFile(save, JSON.stringify({ garment, text: words.trim(), read }, null, 2) + "\n");
