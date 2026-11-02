// The site's languages. Every text a person reads is a `Local`: one string per language, chosen
// where it is shown. Domain modules (rules, measurements, the PDF) return Locals, so they never
// need to know the page's language.

export const LANGS = ["ko", "en", "es"] as const;
export type Lang = (typeof LANGS)[number];
export type Local = Record<Lang, string>;

export const DEFAULT_LANG: Lang = "ko";
export const LANG_NAME: Record<Lang, string> = { ko: "한국어", en: "English", es: "Español" };

export const isLang = (s: string | undefined): s is Lang => (LANGS as readonly string[]).includes(s ?? "");
export const L = (ko: string, en: string, es: string): Local => ({ ko, en, es });
