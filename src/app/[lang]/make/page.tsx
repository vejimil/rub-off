import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Workbench } from "@/components/workbench";
import { LangProvider } from "@/components/lang";
import { isLang, L, type Lang } from "@/lib/i18n/lang";
import { liveAllowed } from "@/lib/limits";
import { EXAMPLES } from "@/lib/pattern/examples";
import type { GarmentKind } from "@/lib/pattern/types";

const T = {
  title: L("사진으로 패턴 만들기", "Make a pattern from a photo", "Crea un patrón con una foto"),
  intro: L(
    "옷 사진 한 장과 A4 용지 한 장이면 됩니다. 앞뒤 두 장이면 더 정확합니다. 사진으로 잴 수 없는 곳은 줄자로 재 달라고 알려 드립니다.",
    "One photo of the garment and one A4 sheet; front and back is more accurate. Anything a photo can't measure, you'll be asked to measure with a tape.",
    "Una foto de la prenda y una hoja A4; con delantero y espalda es más exacto. Lo que la foto no pueda medir, te pediremos que lo midas con cinta.",
  ),
};

export async function generateMetadata({ params }: PageProps<"/[lang]/make">): Promise<Metadata> {
  const { lang } = await params;
  return { title: `${T.title[isLang(lang) ? lang : "ko"]} · Rub-Off` };
}

const TABS = ["measure", "pattern", "cut", "size"] as const;
type Tab = (typeof TABS)[number];

// `?garment=shirt` picks the garment (the landing's garment cards), `?tab=size` opens that tab; `?tab=fit` (older links) goes to the alteration
// screen. The page itself stays prerendered; only the workbench waits for the URL.
export default async function MakePage({ params, searchParams }: PageProps<"/[lang]/make">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const live = liveAllowed();
  return (
    <main className="mx-2 mb-2 flex-1 rounded-2xl border border-line bg-paper px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <h1 className="text-2xl font-semibold">{T.title[lang]}</h1>
      <p className="mb-6 mt-1 text-[15px] text-muted">{T.intro[lang]}</p>
      {/* The part that waits for the URL renders after the layout, so it gets its own language
          provider rather than relying on the layout's. */}
      <LangProvider lang={lang}>
        <Suspense fallback={<Workbench live={live} lang={lang} />}>
          <Chosen searchParams={searchParams} live={live} lang={lang} />
        </Suspense>
      </LangProvider>
    </main>
  );
}

async function Chosen({ searchParams, live, lang }: { searchParams: PageProps<"/[lang]/make">["searchParams"]; live: boolean; lang: Lang }) {
  const { tab, garment } = await searchParams;
  if (tab === "fit") redirect(`/${lang}/alter`);
  const initialTab = TABS.includes(tab as Tab) ? (tab as Tab) : undefined;
  return (
    <LangProvider lang={lang}>
      <Workbench live={live} initialTab={initialTab} lang={lang} initial={typeof garment === "string" && garment in EXAMPLES ? { garment: garment as GarmentKind, fabric: EXAMPLES[garment as GarmentKind].fabric } : undefined} />
    </LangProvider>
  );
}
