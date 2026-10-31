import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import path from "node:path";

// Every paid API result is written here before use, so a rerun on the same photo costs nothing.
// On Vercel only /tmp is writable, and it lasts as long as the instance.
export const CACHE_BASE = process.env.VERCEL ? path.join("/tmp", "rub-off") : path.resolve(process.cwd(), ".cache");
export const CACHE_ROOT = path.join(CACHE_BASE, "runs");

export function runDir(sha256: string): string {
  return path.join(CACHE_ROOT, sha256);
}

export async function ensureRunDir(sha256: string): Promise<string> {
  const dir = runDir(sha256);
  await mkdir(path.join(dir, "sam"), { recursive: true });
  return dir;
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(value, null, 2));
}

export async function readGz(file: string): Promise<string | null> {
  try {
    return gunzipSync(await readFile(file)).toString("utf8");
  } catch {
    return null;
  }
}

export async function writeGz(file: string, text: string): Promise<void> {
  await writeFile(file, gzipSync(text));
}
