import type { Metadata } from "next";
import { Suspense } from "react";
import { SampleGallery } from "@/components/sample-gallery";

export const metadata: Metadata = { title: "예시 · Rub-Off" };

// Real runs replayed: the owner's T-shirt and shorts photographed next to an A4 sheet, segmented
// by SAM 3.1 once and saved, plus the other garment types from typical measurements. No API call
// happens on this page. `?s=pants` opens one example directly; the page itself stays prerendered
// and only the gallery waits for the URL.
export default function SamplePage({ searchParams }: PageProps<"/[lang]/sample">) {
  return (
    <main className="mx-2 mb-2 flex-1 rounded-2xl border border-line bg-paper px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <h1 className="text-2xl font-semibold">예시</h1>
      <p className="mb-6 mt-1 text-[15px] text-muted">티셔츠와 반바지는 직접 찍은 사진에서 잰 결과이고, 나머지는 보통 치수로 그린 패턴입니다. 값을 고치면 패턴이 바로 바뀝니다.</p>
      <Suspense fallback={<SampleGallery />}>
        <Chosen searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Chosen({ searchParams }: { searchParams: PageProps<"/[lang]/sample">["searchParams"] }) {
  const { s } = await searchParams;
  return <SampleGallery initial={typeof s === "string" ? s : undefined} />;
}
