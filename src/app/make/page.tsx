import type { Metadata } from "next";
import { Workbench } from "@/components/workbench";
import { liveAllowed } from "@/lib/limits";

export const metadata: Metadata = { title: "사진으로 패턴 만들기 · Rub-Off" };

export default function MakePage() {
  return (
    <main className="mx-2 mb-2 flex-1 rounded-2xl border border-line bg-paper px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <h1 className="text-2xl font-semibold">사진으로 패턴 만들기</h1>
      <p className="mb-6 mt-1 text-[15px] text-muted">옷 사진 한 장(앞·뒤면 두 장이면 더 좋습니다)과 A4 용지 한 장이면 됩니다. 사진으로 잴 수 없는 곳은 줄자로 재 달라고 알려 드립니다.</p>
      <Workbench live={liveAllowed()} />
    </main>
  );
}
