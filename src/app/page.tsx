import Link from "next/link";
import { PatternPreview } from "@/components/pattern-preview";
import { PhotoOverlay } from "@/components/photo-overlay";
import { Badge } from "@/components/ui";
import type { SampleRun } from "@/lib/client/types";
import { draft } from "@/lib/pattern/draft";
import { layOut } from "@/lib/pattern/layout";
import { MEASURE_KO } from "@/lib/pattern/measures";
import tee from "@/lib/sample/tee-run.json";

// The owner's T-shirt (docs/EXPERIMENTS.md, 11/1): the photo run, and the pattern drafted from it.
// The neck drops sit under the rib where a photo can't see; those two are the owner's tape values.
const TAPE_NECK = { frontNeckDrop: 12, backNeckDrop: 2.5 };
const PANEL_KEYS = ["chest", "length", "hem", "shoulder", "sleeve", "sleeveOpening"];

export default function Home() {
  const sample = tee as unknown as SampleRun;
  const measured = sample.run.measured.values as Record<string, { cm: number; plusMinusCm: number; bound?: string }>;
  const pattern = layOut(draft({ garment: "t-shirt", measures: { ...Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, Math.round(v.cm * 10) / 10])), ...TAPE_NECK }, fabric: "knit" }));
  const values = PANEL_KEYS.filter((k) => measured[k]).map((k) => [k, measured[k]] as const);
  return (
    <main className="mx-auto w-full max-w-6xl px-5">
      <section className="grid items-center gap-10 py-14 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="chalk">SAM 3.1</Badge>
            <Badge tone="chalk">Muse Spark</Badge>
            <Badge>의류학 · 패턴 · 봉제</Badge>
          </div>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.15] tracking-tight sm:text-5xl">
            아끼는 옷 한 벌,
            <br />
            사진 한 장으로 <span className="text-mark">패턴</span>까지.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted">
            봉제인이 손으로 1–2시간 걸려 하는 옷 본뜨기(rub-off)를 사진에서 합니다. 같은 사진으로 쇼핑몰 실측표에서 맞는 사이즈도 고릅니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/make" className="rounded-full bg-ink px-6 py-3 font-medium text-paper">
              내 옷 사진으로 시작
            </Link>
            <Link href="/sample" className="rounded-full border border-ink px-6 py-3 font-medium">
              샘플 보기
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted">티셔츠 한 벌을 줄자로 잰 10개 치수가 모두 사진이 붙인 ± 안에 들어왔습니다. 가슴단면 +1.6%, 밑단단면 −1.2%, 소매단면 +0.4%.</p>
        </div>
        <div className="relative mx-auto w-full max-w-md">
          <PhotoOverlay photo={sample.photo} run={sample.run} />
          <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border border-line bg-card p-3 shadow-lg sm:block">
            <p className="text-[11px] uppercase tracking-widest text-muted">A4 기준 스케일</p>
            <p className="text-lg font-semibold tabular-nums">±{(sample.run.scale.relError * 100).toFixed(1)}%</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 pb-16 md:grid-cols-3">
        <Panel n={1} title="사진" text="옷을 A4 옆에 펴고 위에서 찍습니다. SAM 3.1이 옷·소매·A4를 나누고, Muse Spark가 접힌 소매와 주름을 고릅니다.">
          {/* eslint-disable-next-line @next/next/no-img-element -- committed sample photo */}
          <img src={sample.photo.src} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
        </Panel>
        <Panel n={2} title="치수" text="A4 네 모서리로 원근을 보정해 cm로 잽니다. 값마다 ±를 붙이고, 잴 수 없으면 재지 않습니다.">
          <div className="aspect-[4/3] space-y-1.5 overflow-hidden rounded-xl bg-paper p-3">
            {values.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg bg-card px-3 py-1.5 text-sm">
                <span>{MEASURE_KO[k] ?? k}</span>
                <span className="font-semibold tabular-nums">
                  {v.bound === "max" ? "≤ " : v.bound === "min" ? "≥ " : ""}
                  {v.cm.toFixed(1)} <span className="font-normal text-muted">± {v.plusMinusCm.toFixed(1)}</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel n={3} title="패턴" text="시접·식서·너치·골선이 들어간 1:1 패턴을 A4로 나눠 인쇄합니다. 사이즈를 올리고 내리는 그레이딩, 원단 배치, 사이즈 결정까지.">
          <div className="aspect-[4/3] overflow-hidden rounded-xl">
            <PatternPreview sheet={pattern} />
          </div>
        </Panel>
      </section>
    </main>
  );
}

function Panel({ n, title, text, children }: { n: number; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      {children}
      <div className="mt-4 flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper">{n}</span>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted">{text}</p>
        </div>
      </div>
    </div>
  );
}
