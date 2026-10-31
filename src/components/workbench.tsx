"use client";

import { useMemo, useState } from "react";
import { CuttingPanel } from "@/components/cutting-panel";
import { PatternPreview } from "@/components/pattern-preview";
import { PhotoOverlay } from "@/components/photo-overlay";
import { SizePanel } from "@/components/size-panel";
import { resizeToJpeg } from "@/lib/client/resize";
import { combineMeasurements } from "@/lib/measure/combine";
import type { FailedRun, OkRun, PhotoView } from "@/lib/client/types";
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
  hoodie: ["length", "chest", "shoulder", "hem", "sleeve", "sleeveOpening", "bicep", "armholeDepth", "neckWidth", "shoulderDrop", "frontNeckDrop", "backNeckDrop", "hoodHeight", "hoodDepth", "ribHeight"],
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
  initial?: { photo: PhotoView; run: OkRun; garment: GarmentKind; fabric: Fabric };
  sampleTable?: { read: ReadTable; src: string };
  initialEdits?: Record<string, string>; // e.g. tape-measured values for a sample
}

interface Shot {
  photo: PhotoView;
  file?: Blob;
  run?: OkRun;
  failure?: string;
  missingA4?: boolean;
}

const SIDE_KO = { front: "앞면", back: "뒷면", unclear: "앞뒤 불분명" } as const;
const WRINKLE_KO = { flat: "평평함", "some wrinkles": "주름 조금", "heavily wrinkled or bunched": "많이 구겨짐" } as const;
const SLEEVE_KO = { "spread flat": "펴짐", "folded over the body": "몸판 위로 접힘", "folded under or hidden": "아래로 접혀 안 보임", "bent or twisted": "굽음", "not a sleeve": "소매 아님" } as const;

export function Workbench({ live, initial, sampleTable, initialEdits }: WorkbenchProps) {
  const [garment, setGarment] = useState<GarmentKind>(initial?.garment ?? "t-shirt");
  const [fabric, setFabric] = useState<Fabric>(initial?.fabric ?? "woven");
  const [shots, setShots] = useState<Shot[]>(initial ? [{ photo: initial.photo, run: initial.run }] : []);
  const [busy, setBusy] = useState<number | null>(null);
  const [ref, setRef] = useState<{ key: string; cm: string }>({ key: "chest", cm: "" });
  const [edits, setEdits] = useState<Record<string, string>>(initialEdits ?? {});
  const [baseSize, setBaseSize] = useState("M");
  const [steps, setSteps] = useState(0);

  const update = (i: number, s: Partial<Shot>) => setShots((all) => all.map((x, j) => (j === i ? { ...x, ...s } : x)));

  async function choose(f: File) {
    const r = await resizeToJpeg(f);
    setShots((all) => [...all, { photo: { src: r.url, width: r.width, height: r.height }, file: r.blob }]);
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
    try {
      const res = await fetch("/api/photo", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) update(i, { failure: RUN_ERRORS[body.error] ?? "사진을 분석하지 못했습니다." });
      else if (!body.run.ok) {
        const f = body.run as FailedRun;
        update(i, { failure: `${STAGE_KO[f.stage]} 단계에서 멈췄습니다: ${f.detail}`, missingA4: f.missingA4, run: undefined });
      } else update(i, { run: body.run, failure: undefined, missingA4: false });
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

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. 사진</h2>
        <p className="text-sm text-muted">
          단색 바닥에 옷을 펴고, 목이 사진 위쪽으로 오게, 소매와 다리는 몸판에서 떨어뜨려 펴십시오. A4 용지를 옆에 두고, 옷 전체와 A4 네 모서리가 모두 보이게 위에서 수직으로 찍으십시오. 앞면과 뒷면을 한 장씩 찍으면 서로 보완합니다.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <select value={garment} onChange={(e) => setGarment(e.target.value as GarmentKind)} className="rounded-md border border-line bg-card px-2 py-2">
            {(Object.keys(GARMENT_KO) as GarmentKind[]).map((g) => (
              <option key={g} value={g}>
                {GARMENT_KO[g]}
              </option>
            ))}
          </select>
          <select value={fabric} onChange={(e) => setFabric(e.target.value as Fabric)} className="rounded-md border border-line bg-card px-2 py-2">
            <option value="woven">우븐 (직물)</option>
            <option value="knit">니트 (편물)</option>
          </select>
          {live ? (
            <label className="cursor-pointer rounded-md border border-line bg-card px-3 py-2 hover:border-ink">
              {shots.length ? "사진 추가 (뒷면 등)" : "사진 고르기"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
            </label>
          ) : (
            <span className="text-muted">공개 데모에서는 샘플 사진만 분석해 둔 결과로 보여 드립니다.</span>
          )}
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {shots.map((shot, i) => (
            <div key={shot.photo.src} className="space-y-2">
              <PhotoOverlay photo={shot.photo} run={shot.run?.garment === garment ? shot.run : undefined} />
              {shot.file && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <button onClick={() => analyse(i)} disabled={busy !== null} className="rounded-md bg-ink px-3 py-1.5 text-paper disabled:opacity-40">
                    {busy === i ? "SAM 3.1과 Muse Spark가 보는 중…" : shot.run ? "다시 재기" : "치수 재기"}
                  </button>
                  <button onClick={() => setShots((all) => all.filter((_, j) => j !== i))} className="text-muted underline">
                    빼기
                  </button>
                </div>
              )}
              {shot.failure && <p className="rounded-md bg-mark-soft p-2 text-sm">{shot.failure}</p>}
              {shot.missingA4 && (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-warn-soft p-2 text-sm">
                  A4 없이 재려면 줄자로 잰 치수 하나:
                  <select value={ref.key} onChange={(e) => setRef({ ...ref, key: e.target.value })} className="rounded border border-line bg-card">
                    {KEYS[garment].filter((k) => REQUIRED[garment].includes(k)).map((k) => (
                      <option key={k} value={k}>
                        {MEASURE_KO[k]}
                      </option>
                    ))}
                  </select>
                  <input inputMode="decimal" value={ref.cm} onChange={(e) => setRef({ ...ref, cm: e.target.value })} className="w-16 rounded border border-line bg-card px-1" /> cm
                  <button onClick={() => analyse(i)} disabled={!ref.cm || busy !== null} className="rounded bg-ink px-2 py-1 text-paper disabled:opacity-40">
                    이 값으로 재기
                  </button>
                </div>
              )}
              {shot.run?.garment === garment && (
                <ul className="space-y-1 text-xs text-muted">
                  <li>
                    {shot.run.scale.source === "a4"
                      ? `A4 기준 ${shot.run.scale.pxPerCm.toFixed(1)} px/cm, 비율 ${shot.run.scale.aspect.toFixed(3)} (A4 1.414), 스케일 오차 ±${(shot.run.scale.relError * 100).toFixed(1)}%`
                      : `줄자 값 기준, 스케일 오차 ±${(shot.run.scale.relError * 100).toFixed(1)}%`}
                  </li>
                  {shot.run.layout && (
                    <li>
                      Muse Spark 확인: {SIDE_KO[shot.run.layout.side]}, {WRINKLE_KO[shot.run.layout.wrinkles]}
                      {shot.run.layout.sleeves.length > 0 && `, 소매 ${shot.run.layout.sleeves.map((s) => `${s.number}: ${SLEEVE_KO[s.state]}`).join(" / ")}`}
                    </li>
                  )}
                  {shot.run.measured.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">2. 치수</h2>
        <p className="text-sm text-muted">사진의 기하에서 잰 값입니다(cm, 단면). 줄자로 잰 값이 있으면 고쳐 쓰십시오. 빨간 칸은 사진으로 잴 수 없어 재단 전에 직접 재야 하는 값입니다.</p>
        <table className="w-full max-w-2xl border-collapse text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.source === "missing" ? "bg-mark-soft" : r.source === "default" ? "bg-warn-soft" : ""}>
                <td className="border-b border-line p-2">{MEASURE_KO[r.key] ?? r.key}</td>
                <td className="border-b border-line p-2">
                  <input
                    inputMode="decimal"
                    value={edits[r.key] ?? (r.value !== undefined ? String(r.value) : "")}
                    placeholder="재단 전 측정"
                    onChange={(e) => setEdits({ ...edits, [r.key]: e.target.value })}
                    className="w-20 rounded border border-line bg-card px-2 py-1"
                  />{" "}
                  cm
                </td>
                <td className="border-b border-line p-2 text-muted">
                  {r.source === "photo" && r.measured && `사진 ${r.measured.bound === "max" ? "≤ " : r.measured.bound === "min" ? "≥ " : ""}${r.measured.cm.toFixed(1)} ± ${r.measured.plusMinusCm.toFixed(1)}`}
                  {r.conflict && ` (사진마다 다름: ${r.conflict.values.map((x) => x.toFixed(1)).join(" / ")})`}
                  {r.source === "edited" && (r.measured ? `직접 입력 (사진 ${r.measured.cm.toFixed(1)})` : "직접 입력")}
                  {r.source === "default" && "보통 값 (사진으로 못 잼)"}
                  {r.source === "missing" && (r.refused ? `사진 값 ${r.refused.cm.toFixed(1)}이 가능 범위 밖이라 버렸습니다` : "재단 전 측정 필요")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">3. 패턴</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label>
            원래 사이즈 <input value={baseSize} onChange={(e) => setBaseSize(e.target.value)} className="w-16 rounded border border-line bg-card px-2 py-1" />
          </label>
          <label>
            그레이딩{" "}
            <select value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="rounded border border-line bg-card px-2 py-1">
              {[-2, -1, 0, 1, 2].map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? "원본 그대로" : `${s > 0 ? "+" : ""}${s} (${gradedLabel(baseSize, s)})`}
                </option>
              ))}
            </select>
          </label>
          <button onClick={downloadPdf} disabled={!pattern} className="rounded-md bg-ink px-4 py-2 text-paper disabled:opacity-40">
            A4 패턴 PDF 받기
          </button>
        </div>
        {missing.length > 0 && <p className="rounded-md bg-mark-soft p-3 text-sm">패턴을 만들려면 먼저 재 주십시오: {missing.map((m) => MEASURE_KO[m.key]).join(", ")}</p>}
        {sheet && pattern && (
          <>
            <PatternPreview sheet={sheet} />
            <ul className="space-y-1 text-sm text-muted">
              <li>인쇄할 때 &ldquo;실제 크기(100%)&rdquo;를 고르고, 첫 장의 10 cm 사각형을 자로 확인하십시오.</li>
              {pattern.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">4. 내 원단에 배치</h2>
        <p className="text-sm text-muted">가진 원단(자투리 포함)에 이 패턴이 들어가는지, 어디에 놓고 자를지 보여 드립니다.</p>
        {pattern ? <CuttingPanel pattern={pattern} live={live} /> : <p className="text-sm text-muted">패턴이 만들어지면 배치할 수 있습니다.</p>}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">5. 쇼핑몰 사이즈 고르기</h2>
        <p className="text-sm text-muted">잘 맞는 이 옷을 기준으로, 쇼핑몰 실측표에서 어느 사이즈가 같은 핏인지 비교합니다.</p>
        {Object.keys(mine).length === 0 ? (
          <p className="text-sm text-muted">먼저 사진으로 재거나 치수를 입력해 주십시오.</p>
        ) : (
          <SizePanel mine={mine} fabric={fabric} sample={sampleTable} />
        )}
      </section>
    </div>
  );
}
