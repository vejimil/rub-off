// The font a pattern PDF needs for its language. Korean takes Noto Sans KR (SIL OFL 1.1), subset
// to the 2,350 Hangul syllables of KS X 1001 plus Latin (public/fonts/, licence beside it).
// English and Spanish need none: the PDF's standard font covers them.

import type { Lang } from "../i18n/lang.ts";

export const PDF_FONT_FILE: Partial<Record<Lang, string>> = { ko: "NotoSansKR-Regular-KS.ttf" };

const cache = new Map<string, Promise<Uint8Array>>();

// In the browser: fetched once from /fonts and kept for the session.
export function loadPdfFont(lang: Lang): Promise<Uint8Array | undefined> {
  const file = PDF_FONT_FILE[lang];
  if (!file) return Promise.resolve(undefined);
  let p = cache.get(file);
  if (!p) {
    p = fetch(`/fonts/${file}`).then(async (res) => {
      if (!res.ok) throw new Error(`Font ${file}: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    });
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return p;
}
