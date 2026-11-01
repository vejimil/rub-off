import type { Metadata } from "next";
import { Workbench } from "@/components/workbench";
import type { SampleRun } from "@/lib/client/types";
import { liveAllowed } from "@/lib/limits";
import shorts from "@/lib/sample/shorts-run.json";
import tableRead from "@/lib/sample/size-table-bottoms-read.json";
import type { ReadTable } from "@/lib/size/table";

export const metadata: Metadata = { title: "샘플 · Rub-Off" };

// A real run replayed: the owner's shorts photographed next to an A4 sheet, segmented by SAM 3.1
// once and saved. No API call happens on this page.
export default function SamplePage() {
  const sample = shorts as unknown as SampleRun;
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">샘플: 반바지 한 벌</h1>
      <p className="mb-6 mt-1 text-sm text-muted">실제 사진을 SAM 3.1로 한 번 분석해 저장해 둔 결과입니다. 이 페이지는 API를 부르지 않습니다.</p>
      <Workbench
        live={liveAllowed()}
        initial={{ photo: sample.photo, run: sample.run, garment: "pants", fabric: "woven" }}
        sampleTable={{ read: tableRead as ReadTable, src: "/samples/size-table-bottoms.png" }}
      />
    </main>
  );
}
