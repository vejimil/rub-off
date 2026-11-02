"use client";

import { useMemo, useState } from "react";
import { Badge, buttonGhost, buttonPrimary, Segmented } from "@/components/ui";
import { svgPath } from "@/lib/geom/point";
import { bounds } from "@/lib/geom/polygon";
import { compare, complaintsFor, DIFFICULTY_KO, fromBody, fromComplaint, guarded, patternDelta, type Alteration, type Complaint } from "@/lib/fit/alter";
import { BODY_HOW, BODY_KEYS, BODY_KO, targetsFromBody, type BodyFit, type BodyKey } from "@/lib/fit/body";
import { MAX_TEXT, parse, type ReadComplaints } from "@/lib/fit/read-complaint";
import { draft } from "@/lib/pattern/draft";
import { MEASURE_KO, type MeasuresOf } from "@/lib/pattern/measures";
import { seamLine, type Fabric, type GarmentKind } from "@/lib/pattern/types";

const ERRORS: Record<string, string> = {
  live_disabled: "공개 데모에서는 예시 글만 분석해 둔 결과를 보여 드립니다.",
  visitor_limit: "오늘 분석할 수 있는 횟수를 모두 썼습니다.",
  daily_limit: "오늘 전체 사용량을 모두 썼습니다.",
};

// Typical adult values, for trying the panel without a tape measure. Shown as "예시".
const EXAMPLE_BODY: Partial<Record<BodyKey, number>> = { chestGirth: 92, shoulderWidth: 44, armLength: 58, bicepGirth: 29, waistGirth: 76, hipGirth: 96, thighGirth: 56, crotchDepth: 26, waistToAnkle: 98 };

const VERDICT_KO = { fits: "맞음", big: "큼", small: "작음" } as const;
const LONG = ["length", "sleeve", "outseam", "frontRise"];

export interface AlterPanelProps {
  garment: GarmentKind;
  fabric: Fabric;
  measures: Record<string, number>; // the garment as measured (and corrected)
  live: boolean;
  applied: Record<string, number> | null;
  onApply: (delta: Record<string, number> | null) => void;
  sampleText?: { text: string; read: ReadComplaints };
}

// Mode 4: fit this garment to its wearer. Tape-measured body sizes become target garment sizes;
// what the wearer says is wrong (picked, or written and sorted by Muse Spark) goes through the
// alteration rules; the result is a work order, and optionally a pattern with the changes in it.
export function AlterPanel({ garment, fabric, measures, live, applied, onApply, sampleText }: AlterPanelProps) {
  const [body, setBody] = useState<Partial<Record<BodyKey, string>>>({});
  const [fit, setFit] = useState<BodyFit>("regular");
  const [picked, setPicked] = useState<Record<string, string>>({}); // complaint id → typed cm ("" if none)
  const [text, setText] = useState(sampleText?.text ?? "");
  const [read, setRead] = useState<{ text: string; read: ReadComplaints } | null>(sampleText ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyNums = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v as number) && (v as number) > 0)) as Partial<Record<BodyKey, number>>;
  const targets = targetsFromBody(garment, bodyNums, fit, fabric, measures);
  const comparisons = compare(targets, measures, fabric);
  const options = complaintsFor(garment);

  const fromText: Complaint[] = read ? parse(read.read, read.text, garment) : [];
  const alterations: Alteration[] = [
    ...fromBody(garment, comparisons),
    ...Object.entries(picked).map(([id, cm]) => fromComplaint(garment, { id, amountCm: cm ? Number(cm) : undefined })),
    ...fromText.filter((c) => !(c.id in picked)).map((c) => fromComplaint(garment, c)),
  ].map((a) => guarded(a));
  const delta = patternDelta(alterations);
  const hasDelta = Object.keys(delta).length > 0;

  async function analyse() {
    const t = text.trim();
    if (!t) return;
    if (sampleText && t === sampleText.text) return setRead(sampleText);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/complaints", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t, garment }) });
      const b = await res.json();
      if (!res.ok) setError(ERRORS[b.error] ?? "글을 분석하지 못했습니다. 다시 시도해 주십시오.");
      else setRead({ text: t, read: b.read });
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (garment === "eco-bag") return <p className="text-sm text-muted">가방은 입는 옷이 아니라 맞춤·수선이 없습니다.</p>;

  return (
    <section className="space-y-8">
      {/* 1. Body */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">내 몸 치수 (줄자로)</h3>
          <button type="button" className="text-sm text-muted underline" onClick={() => setBody(Object.fromEntries(BODY_KEYS[garment].map((k) => [k, String(EXAMPLE_BODY[k])])))}>
            예시 값 넣기
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {BODY_KEYS[garment].map((k) => (
            <label key={k} className="rounded-lg bg-field px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="w-24 shrink-0 font-medium">{BODY_KO[k]}</span>
                <input inputMode="decimal" value={body[k] ?? ""} onChange={(e) => setBody({ ...body, [k]: e.target.value })} className="w-16 rounded-md border border-line bg-paper px-2 py-1 text-right tabular-nums" />
                <span className="text-muted">cm</span>
              </span>
              <span className="mt-1 block text-xs leading-snug text-muted">{BODY_HOW[k]}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">원하는 핏</span>
          <Segmented
            size="sm"
            value={fit}
            onChange={setFit}
            options={[
              { value: "slim", label: "붙게" },
              { value: "regular", label: "보통" },
              { value: "loose", label: "여유 있게" },
            ]}
          />
        </div>
        {comparisons.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm tabular-nums">
              <thead>
                <tr className="text-left text-muted">
                  <th className="border-b border-line py-1.5 font-normal">항목</th>
                  <th className="border-b border-line py-1.5 text-right font-normal">이 옷</th>
                  <th className="border-b border-line py-1.5 text-right font-normal">몸에 맞는 값</th>
                  <th className="border-b border-line py-1.5 pl-3 font-normal">판정</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((c) => (
                  <tr key={c.key}>
                    <td className="border-b border-line py-1.5">
                      {MEASURE_KO[c.key]}
                      <div className="text-xs text-muted">{c.target.howKo}</div>
                    </td>
                    <td className="border-b border-line py-1.5 text-right">{c.mine.toFixed(1)}</td>
                    <td className="border-b border-line py-1.5 text-right">
                      {c.target.cm.toFixed(1)}
                      {c.target.min ? " 이상" : ""}
                    </td>
                    <td className="border-b border-line py-1.5 pl-3">
                      <Badge tone={c.verdict === "fits" ? "ok" : "mark"}>
                        {c.verdict === "fits" ? VERDICT_KO.fits : LONG.includes(c.key) ? (c.verdict === "big" ? "김" : "짧음") : VERDICT_KO[c.verdict]}
                        {c.verdict !== "fits" && ` ${Math.abs(c.diff)}`}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. What is wrong */}
      <div className="space-y-3">
        <h3 className="font-semibold">입었을 때 불편한 점</h3>
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const on = o.id in picked;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = { ...picked };
                  if (on) delete next[o.id];
                  else next[o.id] = "";
                  setPicked(next);
                }}
                className={`press rounded-full px-3 py-1.5 text-left text-sm ${on ? "bg-ink text-sand" : "bg-well text-muted hover:text-ink"}`}
              >
                {o.ko}
              </button>
            );
          })}
        </div>
        {options
          .filter((o) => o.id in picked && o.askKo)
          .map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <span className="text-muted">{o.askKo}</span>
              <input inputMode="decimal" value={picked[o.id]} onChange={(e) => setPicked({ ...picked, [o.id]: e.target.value })} className="w-16 rounded-md border border-line bg-field px-2 py-1 text-right tabular-nums" />
              <span className="text-muted">cm (모르면 비워 두십시오)</span>
            </label>
          ))}
        <div className="space-y-2">
          <textarea
            value={text}
            maxLength={MAX_TEXT}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="또는 직접 적어 주십시오. 예: 휠체어에 앉으면 바지 뒤가 내려가고, 밑단이 3 cm쯤 짧아져요."
            className="w-full rounded-lg border border-line bg-field p-3 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={buttonGhost} disabled={busy || !text.trim() || (!live && text.trim() !== sampleText?.text)} onClick={analyse}>
              Muse Spark로 분석
            </button>
            {busy && <span className="text-sm text-muted">읽는 중…</span>}
            {error && <span className="text-sm text-mark">{error}</span>}
            {!live && <span className="text-xs text-muted">공개 데모는 예시 글만 분석해 둔 결과를 씁니다.</span>}
          </div>
          {read && fromText.length > 0 && (
            <p className="text-xs text-muted">Muse Spark는 글을 위 선택지 중 하나로 나누기만 합니다. 길이는 글에 적힌 숫자만 쓰고, 수선 방법과 양은 규칙표가 정합니다.</p>
          )}
        </div>
      </div>

      {/* 3. Work order */}
      <div className="space-y-3">
        <h3 className="font-semibold">수선 지시서</h3>
        {alterations.length === 0 ? (
          <p className="text-sm text-muted">몸 치수를 넣거나 불편한 점을 고르면 여기에 수선 방법이 나옵니다.</p>
        ) : (
          <ol className="space-y-2">
            {alterations.map((a, i) => (
              <li key={a.id} className="rounded-xl border border-line bg-field p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-muted">{i + 1}</span>
                  <span className="font-semibold">{a.actionKo}</span>
                  <span className="text-muted">{a.partKo}</span>
                  <Badge tone={a.difficulty === "hard" ? "mark" : a.difficulty === "medium" ? "warn" : "ok"}>{DIFFICULTY_KO[a.difficulty]}</Badge>
                  {a.reversible && <Badge tone="chalk">되돌릴 수 있음</Badge>}
                </div>
                <p className="mt-1.5">{a.instructionKo}</p>
                <p className="mt-1 text-xs text-muted">{a.fromKo}</p>
              </li>
            ))}
          </ol>
        )}
        {alterations.length > 0 && <p className="text-xs text-muted">재단 전, 수선 전에 옷을 입고 한 번 더 확인하십시오. 숫자는 몸 치수, 옷 치수, 입력한 길이와 규칙표에서만 나옵니다.</p>}
        {hasDelta && (
          <div className="space-y-3 rounded-xl bg-chalk-soft p-3">
            <p className="text-sm">
              새로 만든다면 패턴에서 바뀌는 치수:{" "}
              {Object.entries(delta)
                .map(([k, v]) => `${MEASURE_KO[k] ?? k} ${v > 0 ? "+" : "−"}${Math.abs(v)}`)
                .join(", ")}{" "}
              cm
            </p>
            <BeforeAfter garment={garment} fabric={fabric} measures={measures} delta={delta} />
            {applied ? (
              <button type="button" className={buttonGhost} onClick={() => onApply(null)}>
                패턴에서 수선 빼기
              </button>
            ) : (
              <button type="button" className={buttonPrimary} onClick={() => onApply(delta)}>
                이 수선을 패턴에 반영
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// Each piece's seam line before (dashed) and after (solid), drawn on the same origin.
function BeforeAfter({ garment, fabric, measures, delta }: { garment: GarmentKind; fabric: Fabric; measures: Record<string, number>; delta: Record<string, number> }) {
  const pair = useMemo(() => {
    const after = Object.fromEntries(Object.entries(measures).map(([k, v]) => [k, v + (delta[k] ?? 0)]));
    for (const [k, v] of Object.entries(delta)) if (!(k in after)) after[k] = v;
    try {
      const a = draft({ garment, measures: measures as Partial<MeasuresOf[GarmentKind]>, fabric });
      const b = draft({ garment, measures: after as Partial<MeasuresOf[GarmentKind]>, fabric });
      return a.pieces.flatMap((p) => {
        const q = b.pieces.find((x) => x.id === p.id);
        return q ? [{ id: p.id, name: p.nameKo, before: seamLine(p), after: seamLine(q) }] : [];
      });
    } catch {
      return [];
    }
  }, [garment, fabric, measures, delta]);
  const changed = pair.filter((p) => JSON.stringify(p.before) !== JSON.stringify(p.after));
  if (!changed.length) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {changed.map((p) => {
        const b = bounds([...p.before, ...p.after]);
        const pad = 2;
        return (
          <figure key={p.id} className="w-36">
            <svg viewBox={`${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + 2 * pad} ${b.maxY - b.minY + 2 * pad}`} className="h-auto w-full rounded-lg bg-field" role="img" aria-label={`${p.name} 수선 전후`}>
              <path d={svgPath(p.before, true)} fill="none" stroke="var(--muted)" strokeWidth={0.35} strokeDasharray="1 0.8" />
              <path d={svgPath(p.after, true)} fill="rgba(6,43,138,0.06)" stroke="var(--ink)" strokeWidth={0.45} />
            </svg>
            <figcaption className="mt-1 text-xs text-muted">{p.name}: 점선 지금, 실선 수선 후</figcaption>
          </figure>
        );
      })}
    </div>
  );
}
