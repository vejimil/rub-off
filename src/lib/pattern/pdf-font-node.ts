// The same fonts as pdf-font.ts, read from public/fonts on disk, for scripts and tests.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Lang } from "../i18n/lang.ts";
import { PDF_FONT_FILE } from "./pdf-font.ts";

export async function readPdfFont(lang: Lang): Promise<Uint8Array | undefined> {
  const file = PDF_FONT_FILE[lang];
  return file ? new Uint8Array(await readFile(path.resolve(process.cwd(), "public", "fonts", file))) : undefined;
}
