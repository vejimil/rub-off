"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CuttingPanel } from "@/components/cutting-panel";
import { PatternPreview } from "@/components/pattern-preview";
import { PhotoOverlay } from "@/components/photo-overlay";
import { SizePanel } from "@/components/size-panel";
import { Badge, buttonGhost, buttonPrimary, Card, Segmented, Tabs } from "@/components/ui";
import { resizeToJpeg } from "@/lib/client/resize";
import { combineMeasurements } from "@/lib/measure/combine";
import type { FailedRun, OkRun, PhotoView } from "@/lib/client/types";
import type { Pt } from "@/lib/geom/point";
import { draft, REQUIRED } from "@/lib/pattern/draft";
import { layOut } from "@/lib/pattern/layout";
import { DEFAULTS, MEASURE_KO, type MeasuresOf } from "@/lib/pattern/measures";
import { patternPdf } from "@/lib/pattern/pdf";
import type { Fabric, GarmentKind } from "@/lib/pattern/types";
import { SIZE_KEYS, type SizeKey } from "@/lib/rules/fit-tolerance";
import { grade, gradedLabel } from "@/lib/rules/grading";
import type { Mine } from "@/lib/size/decide";
import type { ReadTable } from "@/lib/size/table";

export const GARMENT_KO: Record<GarmentKind, string> = {
  shirt: "셔츠",
  "t-shirt": "티셔츠",
  hoodie: "후드 집업",
  pants: "고무줄 바지",
  skirt: "고무줄 스커트",
  "eco-bag": "에코백",
};

const KEYS: Record<GarmentKind, string[]> = {
  shirt: ["length", "chest", "shoulder", "hem", "sleeve", "sleeveOpening", "bicep", "armholeDepth", "neckWidth", "shoulderDrop", "frontNeckDrop", "backNeckDrop"],
  "t-shirt": ["length", "chest", "shoulder", "hem", "sleeve", "sleeveOpening", "bicep", "armholeDepth", "neckWidth", "shoulderDrop", "frontNeckDrop", "backNeckDrop"],
  hoodie: [
    "length",
    "chest",
    "shoulder",
    "hem",
    "sleeve",
    "sleeveOpening",
    "bicep",
    "armholeDepth",
    "neckWidth",
    "shoulderDrop",
    "frontNeckDrop",
    "backNeckDrop",
    "hoodHeight",
    "hoodDepth",
    "ribHeight",
  ],
  pants: ["waist", "hip", "frontRise", "outseam", "thigh", "legOpening", "backRiseExtra"],
  skirt: ["length", "hem"],
  "eco-bag": ["width", "height", "handleLength", "handleWidth", "gusset"],
};

const RUN_ERRORS: Record<string, string> = {
  live_disabled: "공개 데모에서는 사진 분석을 끄고 샘플만 보여 드립니다.",
  visitor_limit: "오늘 분석할 수 있는 사진 수를 모두 썼습니다.",
  daily_limit: "오늘 전체 사용량을 모두 썼습니다. 샘플을 보아 주십시오.",
  too_large: "사진이 너무 큽니다.",
  api_failed: "분석 서버가 응답하지 않았습니다. 잠시 후 다시 시도해 주십시오.",
};

const STAGE_KO: Record<FailedRun["stage"], string> = {
  cost: "비용 확인",
  segment: "옷·A4 찾기",
  scale: "A4로 cm 맞추기",
  measure: "치수 재기",
  draft: "패턴 만들기",
};

type Source = "photo" | "edited" | "default" | "missing";

export interface WorkbenchProps {
  live: boolean;
  initial?: { photo?: PhotoView; run?: OkRun; garment: GarmentKind; fabric: Fabric };
  garmentPicker?: boolean; // off when a sample page picks the garment
  placeholder?: ReactNode; // shown in place of the photo when there is none and no upload
  editedLabel?: string; // badge for initialEdits values, e.g. "줄자" or "예시 값"
  sampleTable?: { read: ReadTable; src: string };
  initialEdits?: Record<string, string>; // e.g. tape-measured values for a sample
  initialTab?: "measure" | "pattern" | "cut" | "size";
}

interface Shot {
  photo: PhotoView;
  file?: Blob;
  run?: OkRun;
  failure?: string;
  missingA4?: boolean;
  taps?: Pt[]; // shoulder points tapped on this photo, as fractions of its size
  tapping?: boolean;
}

const TOPS: readonly GarmentKind[] = ["shirt", "t-shirt", "hoodie"];

const SIDE_KO = { front: "앞면", back: "뒷면", unclear: "앞뒤 불분명" } as const;
const WRINKLE_KO = { flat: "평평함", "some wrinkles": "주름 조금", "heavily wrinkled or bunched": "많이 구겨짐" } as const;
const SLEEVE_KO = { "spread flat": "펴짐", "folded over the body": "몸판 위로 접힘", "folded under or hidden": "아래로 접혀 안 보임", "bent or twisted": "굽음", "not a sleeve": "소매 아님" } as const;

export function Workbench({ live, initial, sampleTable, initialEdits, initialTab, garmentPicker = true, placeholder, editedLabel = "직접" }: WorkbenchProps) {
  const [garment, setGarment] = useState<GarmentKind>(initial?.garment ?? "t-shirt");
  const [fabric, setFabric] = useState<Fabric>(initial?.fabric ?? "woven");
  const [shots, setShots] = useState<Shot[]>(initial?.photo ? [{ photo: initial.photo, run: initial.run }] : []);
  const [busy, setBusy] = useState<number | null>(null);
  const [ref, setRef] = useState<{ key: string; cm: string }>({ key: "chest", cm: "" });
  const [edits, setEdits] = useState<Record<string, string>>(initialEdits ?? {});
  const [baseSize, setBaseSize] = useState("M");
  const [steps, setSteps] = useState(0);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState<"measure" | "pattern" | "cut" | "size">(initialTab ?? "measure");

  const update = (i: number, s: Partial<Shot>) => setShots((all) => all.map((x, j) => (j === i ? { ...x, ...s } : x)));

  async function choose(f: File) {
    const r = await resizeToJpeg(f);
    setShots((all) => [...all, { photo: { src: r.url, width: r.width, height: r.height }, file: r.blob }]);
    setActive(shots.length);
  }

  async function analyse(i: number) {
    const shot = shots[i];
    if (!shot?.file) return;
    setBusy(i);
    update(i, { failure: undefined });
    const form = new FormData();
    form.set("photo", shot.file, "photo.jpg");
    form.set("garment", garment);
    form.set("fabric", fabric);
    if (ref.cm) {
      form.set("refKey", ref.key);
      form.set("refCm", ref.cm);
    }
    if (shot.taps?.length && TOPS.includes(garment)) form.set("shoulders", JSON.stringify(shot.taps));
    try {
      const res = await fetch("/api/photo", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) update(i, { failure: RUN_ERRORS[body.error] ?? "사진을 분석하지 못했습니다." });
      else if (!body.run.ok) {
        const f = body.run as FailedRun;
        update(i, { failure: `${STAGE_KO[f.stage]} 단계에서 멈췄습니다: ${f.detail}`, missingA4: f.missingA4, run: undefined });
      } else update(i, { run: body.run, failure: undefined, missingA4: false, tapping: false });
    } catch {
      update(i, { failure: "서버에 연결하지 못했습니다." });
    } finally {
      setBusy(null);
    }
  }

  // Several photos of the same garment: each value from the photo that measured it most surely.
  const okRuns = shots.flatMap((s) => (s.run && s.run.garment === garment ? [s.run] : []));
  const combined = useMemo(() => combineMeasurements(okRuns.map((r) => r.measured.values)), [okRuns]);

  // Each value: what the user typed, else the photos', else a typical default, else missing.
  const rows = KEYS[garment].map((key) => {
    const measured = combined.values[key] as { cm: number; plusMinusCm: number; bound?: string } | undefined;
    const refused = measured ? undefined : okRuns.flatMap((r) => r.measured.refused).find((r) => r.key === key);
    const conflict = combined.conflicts.find((c) => c.key === key);
    const fallback = (DEFAULTS[garment] as Record<string, number>)[key];
    const typed = edits[key];
    const value = typed !== undefined && typed !== "" ? Number(typed) : measured ? Math.round(measured.cm * 10) / 10 : fallback;
    const source: Source = typed !== undefined && typed !== "" ? "edited" : measured ? "photo" : fallback !== undefined ? "default" : "missing";
    return { key, measured, refused, conflict, value, source, required: REQUIRED[garment].includes(key) };
  });
  const measures = Object.fromEntries(rows.filter((r) => r.value !== undefined && Number.isFinite(r.value)).map((r) => [r.key, r.value]));
  const missing = rows.filter((r) => r.required && r.source === "missing");

  // measures is rebuilt every render; its JSON is what changes.
  const measuresKey = JSON.stringify(measures);
  const pattern = useMemo(() => {
    const m = JSON.parse(measuresKey) as Partial<MeasuresOf[GarmentKind]>;
    try {
      return draft({ garment, measures: grade(garment, m, steps), fabric, sizeLabel: steps ? gradedLabel(baseSize, steps) : "Original" });
    } catch {
      return null; // a required measurement is missing; the page says which
    }
  }, [garment, fabric, steps, baseSize, measuresKey]);
  const sheet = useMemo(() => (pattern ? layOut(pattern) : null), [pattern]);

  async function downloadPdf() {
    if (!pattern) return;
    const { bytes } = await patternPdf(pattern, { createdFor: "Rub-Off" });
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rub-off-${garment}-${pattern.sizeLabel}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const mine: Partial<Record<SizeKey, Mine>> = Object.fromEntries(
    rows
      // Only real values: not defaults, and not a photo value that is only a bound (a hidden crotch).
      .filter((r) => (SIZE_KEYS as readonly string[]).includes(r.key) && (r.source === "edited" || (r.source === "photo" && !r.measured?.bound)))
      .map((r) => [r.key, { cm: r.value! }]),
  );

  const shot = shots[Math.min(active, shots.length - 1)];
  const activeIndex = Math.min(active, shots.length - 1);
  const isTop = TOPS.includes(garment);
  const tabs = [
    { value: "measure" as const, label: <>치수{missing.length > 0 && <span className="ml-1.5 rounded-full bg-mark px-1.5 text-xs text-white">재기 {missing.length}</span>}</> },
    { value: "pattern" as const, label: "패턴" },
    { value: "cut" as const, label: "원단 배치" },
    { value: "size" as const, label: "사이즈" },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start">
      {/* Left: the photo canvas */}
      <div className="space-y-4 lg:sticky lg:top-16">
        <Card className="space-y-4">
          {garmentPicker && (
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(GARMENT_KO) as GarmentKind[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGarment(g)}
                  className={`press rounded-full px-3 py-1.5 text-sm ${g === garment ? "bg-ink text-sand" : "bg-well text-muted hover:text-ink"}`}
                >
                  {GARMENT_KO[g]}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <Segmented
              size="sm"
              value={fabric}
              onChange={setFabric}
              options={[
                { value: "woven", label: "우븐 (직물)" },
                { value: "knit", label: "니트 (편물)" },
              ]}
            />
            {shot?.run?.garment === garment && (
              <Badge tone={shot.run.scale.source === "tape" ? "warn" : "chalk"}>
                {shot.run.scale.source !== "tape" ? `A4 기준 · ±${(shot.run.scale.relError * 100).toFixed(1)}%` : `줄자 기준 · ±${(shot.run.scale.relError * 100).toFixed(1)}%`}
              </Badge>
            )}
          </div>

          {shot ? (
            <div className="mx-auto w-full" style={{ maxWidth: `calc((100svh - 260px) * ${(shot.photo.width / shot.photo.height).toFixed(3)})` }}>
              <PhotoOverlay
                photo={shot.photo}
                run={shot.run?.garment === garment ? shot.run : undefined}
                taps={shot.taps}
                onTap={shot.tapping ? (p) => update(activeIndex, { taps: [...(shot.taps ?? []), p].slice(-2) }) : undefined}
              />
            </div>
          ) : live ? (
            <label className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-muted bg-well text-center transition-colors hover:border-ink">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-2xl text-sand">+</span>
              <span className="font-medium">옷 사진 올리기</span>
              <span className="max-w-64 text-sm text-muted">바닥에 펴고, A4 용지와 함께, 옷 전체가 들어오게 위에서</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
            </label>
          ) : (
            (placeholder ?? <p className="rounded-xl bg-well p-6 text-sm text-muted">공개 데모에서는 샘플만 보여 드립니다.</p>)
          )}

          {(shots.length > 1 || (live && shots.length > 0)) && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {shots.map((sh, i) => (
                <button
                  key={sh.photo.src}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`relative h-16 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${i === activeIndex ? "border-ink" : "border-transparent opacity-70 hover:opacity-100"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- local thumbnails */}
                  <img src={sh.photo.src} alt="" className="h-full w-full object-cover" />
                  <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${sh.run ? "bg-ok" : sh.failure ? "bg-mark" : "bg-line"}`} />
                </button>
              ))}
              {live && (
                <label
                  className="flex h-16 w-14 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted hover:border-ink"
                  title="뒷면 등 사진 추가"
                >
                  <span className="text-lg leading-none">+</span>뒷면
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
                </label>
              )}
            </div>
          )}

          {shot?.file && busy !== activeIndex && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => analyse(activeIndex)} disabled={busy !== null} className={buttonPrimary}>
                {shot.run ? "다시 재기" : "치수 재기"}
              </button>
              {shot.run && isTop && !shot.tapping && (
                <button onClick={() => update(activeIndex, { tapping: true, taps: [] })} className={buttonGhost}>
                  어깨점 직접 찍기
                </button>
              )}
              <button
                onClick={() => {
                  setShots((all) => all.filter((_, j) => j !== activeIndex));
                  setActive(0);
                }}
                className="ml-auto text-sm text-muted underline"
              >
                사진 빼기
              </button>
            </div>
          )}
          {busy === activeIndex && <Analyzing />}

          {shot?.tapping && (
            <div className="space-y-2 rounded-xl bg-chalk-soft p-3 text-sm">
              <p>
                사진에서 양쪽 <b>어깨점</b>(소매 솔기가 어깨선과 만나는 점)을 하나씩 누르십시오. 단색 옷은 솔기가 잘 안 보여 SAM이 0.5–3 cm 벗어날 수 있습니다.
              </p>
              <div className="flex gap-2">
                <button onClick={() => analyse(activeIndex)} disabled={(shot.taps?.length ?? 0) === 0 || busy !== null} className={buttonPrimary}>
                  이 점으로 다시 재기 · {shot.taps?.length ?? 0}/2
                </button>
                <button onClick={() => update(activeIndex, { taps: [], tapping: false })} className="text-muted underline">
                  취소
                </button>
              </div>
            </div>
          )}
          {shot?.failure && <p className="rounded-xl bg-mark-soft p-3 text-sm">{shot.failure}</p>}
          {shot?.missingA4 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-soft p-3 text-sm">
              A4 없이 재려면 줄자로 잰 치수 하나
              <select value={ref.key} onChange={(e) => setRef({ ...ref, key: e.target.value })} className="rounded-lg border border-line bg-field px-2 py-1">
                {KEYS[garment]
                  .filter((k) => REQUIRED[garment].includes(k))
                  .map((k) => (
                    <option key={k} value={k}>
                      {MEASURE_KO[k]}
                    </option>
                  ))}
              </select>
              <input inputMode="decimal" value={ref.cm} onChange={(e) => setRef({ ...ref, cm: e.target.value })} className="w-16 rounded-lg border border-line bg-field px-2 py-1" /> cm
              <button onClick={() => analyse(activeIndex)} disabled={!ref.cm || busy !== null} className={buttonPrimary}>
                이 값으로 재기
              </button>
            </div>
          )}

          {shot?.run?.garment === garment && (
            <div className="space-y-2">
              {shot.run.layout && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted">Muse Spark 확인</span>
                  <Badge>{SIDE_KO[shot.run.layout.side]}</Badge>
                  <Badge tone={shot.run.layout.wrinkles === "flat" ? "ok" : "warn"}>{WRINKLE_KO[shot.run.layout.wrinkles]}</Badge>
                  {shot.run.layout.sleeves.map((sl) => (
                    <Badge key={sl.number} tone={sl.state === "spread flat" ? "ok" : "mark"}>
                      소매 {sl.number} · {SLEEVE_KO[sl.state]}
                    </Badge>
                  ))}
                </div>
              )}
              {shot.run.measured.notes.length > 0 && (
                <details className="text-sm text-muted">
                  <summary className="cursor-pointer select-none">측정 메모 {shot.run.measured.notes.length}개</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {shot.run.measured.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </Card>
        {shots.length === 0 && !placeholder && (
          <Card className="text-sm text-muted">
            <p className="mb-2 font-medium text-ink">잘 나오는 사진</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>단색 바닥, 목이 화면 위쪽, 소매와 다리는 몸판에서 떨어뜨려 펴기</li>
              <li>A4 네 모서리가 모두 보이게. 옷 위에 올려도 됩니다</li>
              <li>옷 둘레에 손가락 한두 마디 여유, 폰은 바닥과 평행하게</li>
              <li>앞면과 뒷면을 한 장씩 찍으면 서로 보완합니다</li>
            </ul>
          </Card>
        )}
      </div>

      {/* Right: the steps */}
      <Card className="space-y-5">
        <Tabs value={tab} onChange={setTab} options={tabs} />

        {tab === "measure" && (
          <div>
            <p className="mb-4 text-sm text-muted">사진의 기하에서 잰 단면 값(cm). 줄자로 잰 값이 있으면 고쳐 쓰십시오.</p>
            <div className="divide-y divide-line">
              {rows.map((r) => (
                <div key={r.key} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{MEASURE_KO[r.key] ?? r.key}</span>
                      {r.source === "photo" && <Badge tone="chalk">사진</Badge>}
                      {r.source === "edited" && <Badge tone="ink">{initialEdits?.[r.key] === edits[r.key] ? editedLabel : "직접"}</Badge>}
                      {r.source === "default" && <Badge tone="warn">보통 값</Badge>}
                      {r.source === "missing" && <Badge tone="mark">재단 전 측정</Badge>}
                      {r.conflict && <Badge tone="warn">사진마다 다름</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {r.source === "photo" && r.measured && `${r.measured.bound === "max" ? "최댓값 · " : r.measured.bound === "min" ? "최솟값 · " : ""}± ${r.measured.plusMinusCm.toFixed(1)} cm`}
                      {r.conflict && ` · ${r.conflict.values.map((x) => x.toFixed(1)).join(" / ")}`}
                      {r.source === "edited" && r.measured && `사진 ${r.measured.cm.toFixed(1)}`}
                      {r.source === "default" && "사진으로 못 잼"}
                      {r.source === "missing" && (r.refused ? `사진 값 ${r.refused.cm.toFixed(1)}은 가능 범위 밖` : "사진으로 잴 수 없음")}
                    </p>
                  </div>
                  <label className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${r.source === "missing" ? "border-mark bg-mark-soft" : "border-line bg-field"}`}>
                    <input
                      inputMode="decimal"
                      value={edits[r.key] ?? (r.value !== undefined ? String(r.value) : "")}
                      placeholder="—"
                      onChange={(e) => setEdits({ ...edits, [r.key]: e.target.value })}
                      className="num w-14 bg-transparent text-right text-base font-semibold outline-none"
                    />
                    <span className="text-xs text-muted">cm</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "pattern" && (
          <div className="space-y-4">
            <p className="mb-4 text-sm text-muted">시접·식서·너치·골선이 들어간 1:1 패턴. A4로 나눠 인쇄합니다.</p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-muted">원래 사이즈</span>
                <input value={baseSize} onChange={(e) => setBaseSize(e.target.value)} className="w-14 rounded-lg border border-line bg-field px-2 py-1 text-center" />
              </label>
              <Segmented size="sm" value={steps} onChange={setSteps} options={[-2, -1, 0, 1, 2].map((v) => ({ value: v, label: v === 0 ? "원본" : gradedLabel(baseSize, v) }))} />
            </div>
            {missing.length > 0 && <p className="rounded-xl bg-mark-soft p-3 text-sm">패턴을 만들려면 먼저 재 주십시오: {missing.map((m) => MEASURE_KO[m.key]).join(", ")}</p>}
            {sheet && pattern && (
              <>
                <PatternPreview sheet={sheet} />
                <button onClick={downloadPdf} className={`${buttonPrimary} w-full`}>
                  A4 패턴 PDF 받기
                </button>
                <details className="text-sm text-muted">
                  <summary className="cursor-pointer select-none">인쇄와 봉제 메모</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>인쇄할 때 &ldquo;실제 크기(100%)&rdquo;를 고르고, 첫 장의 10 cm 사각형을 자로 확인하십시오.</li>
                    {pattern.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </div>
        )}

        {tab === "cut" && (
          <div>
            <p className="mb-4 text-sm text-muted">가진 원단(자투리 포함)에 이 패턴이 들어가는지, 어디에 놓고 자를지.</p>
            {pattern ? <CuttingPanel pattern={pattern} live={live} /> : <p className="text-sm text-muted">패턴이 만들어지면 배치할 수 있습니다.</p>}
          </div>
        )}

        {tab === "size" && (
          <div>
            <p className="mb-4 text-sm text-muted">잘 맞는 이 옷을 기준으로, 실측표에서 같은 핏인 사이즈를 고릅니다.</p>
            {Object.keys(mine).length === 0 ? <p className="text-sm text-muted">먼저 사진으로 재거나 치수를 입력해 주십시오.</p> : <SizePanel mine={mine} fabric={fabric} sample={sampleTable} />}
          </div>
        )}
      </Card>
    </div>
  );
}

// While SAM 3.1 and Muse Spark work: what is being done, in order. One request does all of it,
// so no step is shown as finished before the answer comes back.
function Analyzing() {
  const steps = ["SAM 3.1 · 옷, 소매, 모자, A4 분리", "A4 네 모서리로 cm 평면 맞추기", "Muse Spark · 소매 접힘과 주름 확인", "측정점과 ± 계산"];
  return (
    <div className="rounded-xl bg-well p-4">
      <p className="mb-2 text-sm font-medium">사진을 읽는 중 · 보통 10–30초</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
