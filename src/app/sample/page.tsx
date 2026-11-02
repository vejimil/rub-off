import type { Metadata } from "next";
import { SampleGallery } from "@/components/sample-gallery";

export const metadata: Metadata = { title: "샘플 · Rub-Off" };

// Real runs replayed: the owner's T-shirt and shorts photographed next to an A4 sheet, segmented
// by SAM 3.1 once and saved, plus the other garment types from typical measurements. No API call
// happens on this page.
export default function SamplePage() {
  return (
    <main className="mx-2 mb-2 flex-1 rounded-2xl border border-line bg-paper px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <h1 className="text-2xl font-semibold">샘플</h1>
      <p className="mb-6 mt-1 text-[15px] text-muted">실제 사진 두 벌은 SAM 3.1로 한 번 분석해 저장해 둔 결과입니다. 이 페이지는 API를 부르지 않습니다.</p>
      <SampleGallery />
    </main>
  );
}
