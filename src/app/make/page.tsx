import type { Metadata } from "next";
import { Workbench } from "@/components/workbench";
import { liveAllowed } from "@/lib/limits";

export const metadata: Metadata = { title: "사진으로 패턴 만들기 · Rub-Off" };

export default function MakePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">사진으로 패턴 만들기</h1>
      <p className="mb-6 mt-1 text-sm text-muted">옷 사진 한 장(앞·뒤면 두 장이면 더 좋습니다)과 A4 용지 한 장이면 됩니다.</p>
      <Workbench live={liveAllowed()} />
    </main>
  );
}
