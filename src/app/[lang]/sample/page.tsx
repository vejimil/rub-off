import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SampleGallery } from "@/components/sample-gallery";
import { LangProvider } from "@/components/lang";
import { isLang, L, type Lang } from "@/lib/i18n/lang";

const T = {
  title: L("예시", "Examples", "Ejemplos"),
  intro: L(
    "티셔츠와 반바지는 직접 찍은 사진에서 잰 결과이고, 나머지는 보통 치수로 그린 패턴입니다. 값을 고치면 패턴이 바로 바뀝니다.",
    "The T-shirt and the shorts were measured from real photos; the others are patterns drafted from typical measurements. Change a value and the pattern redraws.",
    "La camiseta y el pantalón corto se midieron en fotos reales; los demás son patrones trazados con medidas típicas. Cambia un valor y el patrón se vuelve a dibujar.",
  ),
};

export async function generateMetadata({ params }: PageProps<"/[lang]/sample">): Promise<Metadata> {
  const { lang } = await params;
  return { title: `${T.title[isLang(lang) ? lang : "ko"]} · Rub-Off` };
}

// Real runs replayed: the owner's T-shirt and shorts photographed next to an A4 sheet, segmented
// by SAM 3.1 once and saved, plus the other garment types from typical measurements. No API call
// happens on this page. `?s=pants` opens one example directly; the page itself stays prerendered
// and only the gallery waits for the URL.
export default async function SamplePage({ params, searchParams }: PageProps<"/[lang]/sample">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    <main className="mx-2 mb-2 flex-1 rounded-2xl border border-line bg-paper px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <h1 className="text-2xl font-semibold">{T.title[lang]}</h1>
      <p className="mb-6 mt-1 text-[15px] text-muted">{T.intro[lang]}</p>
      {/* The part that waits for the URL renders after the layout, so it gets its own language
          provider rather than relying on the layout's. */}
      <LangProvider lang={lang}>
        <Suspense fallback={<SampleGallery lang={lang} />}>
          <Chosen searchParams={searchParams} lang={lang} />
        </Suspense>
      </LangProvider>
    </main>
  );
}

async function Chosen({ searchParams, lang }: { searchParams: PageProps<"/[lang]/sample">["searchParams"]; lang: Lang }) {
  const { s } = await searchParams;
  return (
    <LangProvider lang={lang}>
      <SampleGallery initial={typeof s === "string" ? s : undefined} lang={lang} />
    </LangProvider>
  );
}
