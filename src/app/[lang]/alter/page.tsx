import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workbench } from "@/components/workbench";
import { LangProvider } from "@/components/lang";
import { isLang, L } from "@/lib/i18n/lang";
import { liveAllowed } from "@/lib/limits";

const T = {
  title: L("수선하기", "Alterations", "Arreglos"),
  intro: L(
    "옷을 A4 용지와 함께 찍고 입었을 때 불편한 점을 적으면, 어디를 몇 cm 고칠지 표시한 수선 의뢰서가 나옵니다. 사진이 없으면 길이는 수선집에서 잽니다.",
    "Photograph the garment with an A4 sheet and write what bothers you when you wear it; you get an alteration order marking where to alter and by how much. Without a photo, the tailor measures the lengths.",
    "Fotografía la prenda con una hoja A4 y escribe lo que te molesta al llevarla; obtienes una orden de arreglos con dónde arreglar y cuánto. Sin foto, el taller toma las medidas.",
  ),
};

export async function generateMetadata({ params }: PageProps<"/[lang]/alter">): Promise<Metadata> {
  const { lang } = await params;
  return { title: `${T.title[isLang(lang) ? lang : "ko"]} · Rub-Off` };
}

// The alteration screen: the same photo measuring as the pattern screen, then the wearer's words
// and the work order made from them.
export default async function AlterPage({ params }: PageProps<"/[lang]/alter">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    <main className="mx-2 mb-2 flex-1 rounded-2xl border border-line bg-paper px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <h1 className="text-2xl font-semibold">{T.title[lang]}</h1>
      <p className="mb-6 mt-1 max-w-3xl text-[15px] text-muted">{T.intro[lang]}</p>
      <LangProvider lang={lang}>
        <Workbench live={liveAllowed()} mode="alter" lang={lang} />
      </LangProvider>
    </main>
  );
}
