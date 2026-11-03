import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SampleGallery } from "@/components/sample-gallery";
import { LangProvider } from "@/components/lang";
import { isLang, L, type Lang } from "@/lib/i18n/lang";

const T = {
  title: L("예시", "Examples", "Ejemplos"),
  intro: L(
    "직접 찍은 티셔츠와 반바지를 사진으로 잰 결과입니다. 티셔츠와 휠체어를 타는 사람의 바지는 수선 의뢰서와 수선 가이드도 있습니다. 값을 고치면 결과가 바로 바뀝니다.",
    "A T-shirt and shorts measured from real photos. The T-shirt, and a wheelchair user's trousers, also have an alteration order and a do-it-yourself guide. Change a value and the result updates.",
    "Una camiseta y un pantalón corto medidos en fotos reales. La camiseta, y el pantalón de una persona en silla de ruedas, tienen además una orden de arreglos y una guía para hacerlo tú. Cambia un valor y el resultado se actualiza.",
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
