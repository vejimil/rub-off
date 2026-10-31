import type { Metadata } from "next";
import { Workbench } from "@/components/workbench";
import { liveAllowed } from "@/lib/limits";

export const metadata: Metadata = { title: "사진으로 패턴 만들기 · Rub-Off" };

export default function MakePage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">사진으로 패턴 만들기</h1>
      <Workbench live={liveAllowed()} />
    </main>
  );
}
