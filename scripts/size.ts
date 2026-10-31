// Read a size table screenshot with Muse Spark and decide a size against your garment.
//   npm run size -- public/samples/size-table.png --mine=length:71,shoulder:46.2,chest:52.5,sleeve:60.4
//   add --yes to call Spark when the table isn't cached (about $0.01); --fit=looser|tighter, --fabric=knit
// Spark's raw reading is cached by the image's SHA-256, so a rerun costs nothing.

import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../src/lib/cache.ts";
import type { Fabric } from "../src/lib/pattern/types.ts";
import type { Fit, SizeKey } from "../src/lib/rules/fit-tolerance.ts";
import { decideSize } from "../src/lib/size/decide.ts";
import { readSizeTable, type ReadTable } from "../src/lib/size/read-table.ts";
import { toSizeTable } from "../src/lib/size/table.ts";

const args = process.argv.slice(2);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const source = args.find((a) => !a.startsWith("--")) ?? "public/samples/size-table.png";
const bytes = await readFile(source);
const sha = createHash("sha256").update(bytes).digest("hex");
const cacheFile = path.resolve(".cache", "size-tables", `${sha.slice(0, 16)}.json`);

let read = await readJson<ReadTable>(cacheFile);
if (!read) {
  if (!args.includes("--yes")) {
    console.log("Muse Spark would read this table once (about $0.01). Rerun with --yes to spend it.");
    process.exit(0);
  }
  read = await readSizeTable(bytes, /\.png$/i.test(source) ? "image/png" : "image/jpeg");
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeJson(cacheFile, read);
}

console.log(`unit ${read.unit}, basis ${read.basis}`);
console.log(["size", ...read.columns.map((c) => `${c.header}=${c.meaning}`)].join(" | "));
for (const r of read.rows) console.log([r.label, ...r.cells.map((c) => c ?? "-")].join(" | "));

const { table, unreadable } = toSizeTable(read);
for (const u of unreadable) console.log(`unreadable: ${u.row} ${u.header} "${u.cell}"`);

const mineArg = opt("mine");
if (!mineArg) process.exit(0);
const mine = Object.fromEntries(mineArg.split(",").map((kv) => [kv.split(":")[0], { cm: Number(kv.split(":")[1]) }])) as Partial<Record<SizeKey, { cm: number }>>;
const d = decideSize(mine, table, (opt("fabric") as Fabric) ?? "woven", (opt("fit") as Fit) ?? "same");
if (!d.ok) {
  console.log(`no decision: ${d.reason} (${d.detail})`);
  process.exit(0);
}
console.log(`\nrecommended: ${d.best.label}`);
for (const s of d.sentences) console.log(`  ${s}`);
for (const r of d.all) console.log(`  ${r.label}: ${r.fits}/${r.checks.length} fit`);
