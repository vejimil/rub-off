import type { Metadata } from "next";
import { SampleGallery } from "@/components/sample-gallery";

export const metadata: Metadata = { title: "샘플 · Rub-Off" };

// Real runs replayed: the owner's T-shirt and shorts photographed next to an A4 sheet, segmented
// by SAM 3.1 once and saved, plus the other garment types from typical measurements. No API call
// happens on this page.
export default function SamplePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">샘플</h1>
      <p className="mb-6 mt-1 text-sm text-muted">실제 사진은 SAM 3.1로 한 번 분석해 저장해 둔 결과입니다. 이 페이지는 API를 부르지 않습니다.</p>
      <SampleGallery />
    </main>
  );
}
