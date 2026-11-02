import type { Metadata } from "next";
import { Black_Han_Sans, IBM_Plex_Sans_KR, Unbounded } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LangProvider } from "@/components/lang";
import { LangSwitch } from "@/components/lang-switch";
import { isLang, L, LANGS, type Lang } from "@/lib/i18n/lang";
import "../globals.css";

// Two faces: a heavy display face for the few big words, and a grotesk for everything else
// (tabular figures for the measurements). Korean takes a constructed Korean display face; English
// and Spanish take Unbounded, which has the accented letters Spanish needs.
const displayKo = Black_Han_Sans({ variable: "--font-display-face", weight: "400", subsets: ["latin"], preload: false });
const displayLatin = Unbounded({ variable: "--font-display-face", weight: "700", subsets: ["latin", "latin-ext"], preload: false });
const text = IBM_Plex_Sans_KR({ variable: "--font-text", weight: ["400", "500", "600"], subsets: ["latin"], preload: false });

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

const META = {
  description: L(
    "옷을 A4 용지와 함께 펴고 한 장 찍으면, 인쇄해 자르는 패턴과 맞는 사이즈, 원단 배치, 수선 의뢰서와 직접 고치는 수선 가이드가 나옵니다.",
    "Photograph a garment lying flat next to an A4 sheet and get a printable 1:1 sewing pattern, a size decision, a cutting layout, and an alteration order or a guide to alter it yourself.",
    "Fotografía una prenda extendida junto a una hoja A4 y obtén un patrón imprimible a escala 1:1, la talla que te queda, la colocación en tu tela y una orden de arreglos o una guía para arreglarla tú.",
  ),
};

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  return { title: "Rub-Off", description: isLang(lang) ? META.description[lang] : META.description.ko };
}

const NAV = {
  how: L("찍는 법", "How to shoot", "Cómo hacer la foto"),
  alter: L("수선하기", "Alterations", "Arreglos"),
  alterShort: L("수선", "Alter", "Arreglos"),
  makeShort: L("패턴", "Pattern", "Patrón"),
  sample: L("예시", "Examples", "Ejemplos"),
  make: L("패턴 만들기", "Make a pattern", "Crear patrón"),
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang: raw } = await params;
  if (!isLang(raw)) notFound();
  const lang: Lang = raw;
  const display = lang === "ko" ? displayKo : displayLatin;
  return (
    <html lang={lang} className={`${display.variable} ${text.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <LangProvider lang={lang}>
          <header className="sticky top-0 z-30 bg-sand">
            <div className="flex h-12 w-full items-center gap-6 px-5 sm:px-10 lg:px-16">
              <Link href={`/${lang}`} className="flex items-center gap-2 whitespace-nowrap font-display text-lg tracking-tight">
                <Mark />
                <span className="hidden min-[400px]:inline">Rub-Off</span>
              </Link>
              <nav className="ml-auto flex items-center gap-1 whitespace-nowrap text-[15px]">
                <Link href={`/${lang}#how`} className="link hidden px-3 py-1.5 lg:block">
                  {NAV.how[lang]}
                </Link>
                <Link href={`/${lang}/sample`} className="link hidden px-3 py-1.5 sm:block">
                  {NAV.sample[lang]}
                </Link>
                <LangSwitch lang={lang} />
                <Link href={`/${lang}/alter`} className="press ml-2 whitespace-nowrap rounded-full border border-ink px-3 py-1 font-medium hover:bg-sand-3 sm:px-4">
                  <span className="hidden sm:inline">{NAV.alter[lang]}</span>
                  <span className="sm:hidden">{NAV.alterShort[lang]}</span>
                </Link>
                <Link href={`/${lang}/make`} className="press ml-1 whitespace-nowrap rounded-full border border-ink bg-ink px-3 py-1 font-medium text-sand hover:bg-ink-strong sm:px-4">
                  <span className="hidden sm:inline">{NAV.make[lang]}</span>
                  <span className="sm:hidden">{NAV.makeShort[lang]}</span>
                </Link>
              </nav>
            </div>
          </header>
          <div className="flex flex-1 flex-col">{children}</div>
        </LangProvider>
      </body>
    </html>
  );
}

// A pattern corner: the cutting line, the seam line 1 cm inside it, and a notch.
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <path d="M3 19 V5 Q3 3 5 3 H19" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M7.5 19 V9 Q7.5 7.5 9 7.5 H19" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 2" />
      <path d="M1 12 H6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
