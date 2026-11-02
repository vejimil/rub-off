"use client";

import { useState } from "react";
import { GarmentFlat } from "@/components/garment-flat";
import { Badge, buttonGhost, buttonPrimary, Segmented } from "@/components/ui";
import { compare, complaintsFor, DIFFICULTY_KO, fromBody, fromComplaint, guarded, type Alteration, type Complaint } from "@/lib/fit/alter";
import { flatFor } from "@/lib/fit/flat";
import { BODY_HOW, BODY_KEYS, BODY_KO, targetsFromBody, type BodyFit, type BodyKey } from "@/lib/fit/body";
import { MAX_TEXT, parse, type ReadComplaints } from "@/lib/fit/read-complaint";
import { MEASURE_KO } from "@/lib/pattern/measures";
import type { Fabric, GarmentKind } from "@/lib/pattern/types";

const ERRORS: Record<string, string> = {
  live_disabled: "지금은 글 읽기를 쉬고 있습니다. 위 목록에서 골라 주십시오.",
  visitor_limit: "오늘 읽을 수 있는 글을 모두 썼습니다. 위 목록에서 골라 주십시오.",
  daily_limit: "오늘 읽을 수 있는 양을 모두 썼습니다. 위 목록에서 골라 주십시오.",
};

// Typical adult values, for trying the panel without a tape measure. Shown as "예시".
const EXAMPLE_BODY: Partial<Record<BodyKey, number>> = { chestGirth: 92, shoulderWidth: 44, armLength: 58, bicepGirth: 29, waistGirth: 76, hipGirth: 96, thighGirth: 56, crotchDepth: 26, waistToAnkle: 98 };

const VERDICT_KO = { fits: "맞음", big: "큼", small: "작음" } as const;
const LONG = ["length", "sleeve", "outseam", "frontRise"];

export interface AlterPanelProps {
  garment: GarmentKind;
  fabric: Fabric;
  measures: Record<string, number>; // the garment as measured (and corrected)
  sampleText?: { text: string; read: ReadComplaints };
}

// Mode 4: fit this garment to its wearer. Tape-measured body sizes become target garment sizes;
// what the wearer says is wrong (picked, or written and sorted by Muse Spark) goes through the
// alteration rules; the result is a work order with a technical flat of the garment, marked.
export function AlterPanel({ garment, fabric, measures, sampleText }: AlterPanelProps) {
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
  const views = flatFor(garment, measures, fabric, alterations);

  async function analyse() {
    const t = text.trim();
    if (!t) return;
    if (sampleText && t === sampleText.text) return setRead(sampleText);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/complaints", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t, garment }) });
      const b = await res.json();
      if (!res.ok) setError(ERRORS[b.error] ?? "글을 읽지 못했습니다. 잠시 후 다시 해 주십시오.");
      else setRead({ text: t, read: b.read });
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (garment === "eco-bag") return <p className="text-[15px] text-muted">가방은 입는 옷이 아니어서 고칠 치수가 없습니다.</p>;

  const seated = options.filter((o) => o.seated);
  const general = options.filter((o) => !o.seated);
  const found = fromText.map((c) => ({ c, label: options.find((o) => o.id === c.id)?.ko ?? "목록에 없는 불편함" }));
  const toggle = (id: string) => {
    const next = { ...picked };
    if (id in next) delete next[id];
    else next[id] = "";
    setPicked(next);
  };
  const chip = (o: (typeof options)[number]) => {
    const on = o.id in picked;
    return (
      <button
        key={o.id}
        type="button"
        aria-pressed={on}
        onClick={() => toggle(o.id)}
        className={`press inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-left text-[15px] leading-snug ${on ? "bg-ink text-sand" : "bg-well text-ink hover:bg-chalk-soft"}`}
      >
        {on && (
          <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden>
            <path d="M1.5 5.5 L4 8 L8.5 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
        {o.ko}
      </button>
    );
  };

  return (
    <div className="space-y-12">
      {/* The body, against this garment. */}
      <section aria-labelledby="body-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id="body-title" className="text-lg font-semibold">
              입을 사람의 몸 치수
            </h3>
            <p className="mt-1 text-[15px] text-muted">줄자로 잰 값을 넣으면 이 옷과 비교해 줄이거나 늘릴 곳을 찾습니다.</p>
          </div>
          <button type="button" className={buttonGhost} onClick={() => setBody(Object.fromEntries(BODY_KEYS[garment].map((k) => [k, String(EXAMPLE_BODY[k])])))}>
            예시 값 넣기
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {BODY_KEYS[garment].map((k) => (
            <label key={k} className="rounded-xl bg-field px-4 py-3">
              <span className="flex items-center gap-2">
                <span className="flex-1 font-medium">{BODY_KO[k]}</span>
                <input
                  inputMode="decimal"
                  value={body[k] ?? ""}
                  onChange={(e) => setBody({ ...body, [k]: e.target.value })}
                  aria-describedby={`how-${k}`}
                  className="num w-20 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-right text-lg"
                />
                <span className="text-muted">cm</span>
              </span>
              <span id={`how-${k}`} className="mt-1.5 block text-[13px] leading-snug text-muted">
                {BODY_HOW[k]}
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[15px] text-muted">원하는 핏</span>
          <Segmented
            size="sm"
            label="원하는 핏"
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
          <table className="w-full text-[15px]">
            <caption className="sr-only">이 옷과 몸에 맞는 값 비교</caption>
            <thead>
              <tr className="text-left text-[13px] text-muted">
                <th className="pb-2 font-normal">단면</th>
                <th className="pb-2 text-right font-normal">이 옷</th>
                <th className="pb-2 text-right font-normal">몸에 맞는 값</th>
                <th className="pb-2 pl-4 font-normal">
                  <span className="sr-only">판정</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c) => (
                <tr key={c.key} /* taste-skill-ignore: rule between table rows */ className="border-t border-line align-top">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{MEASURE_KO[c.key]}</span>
                    <span className="mt-0.5 block text-[13px] text-muted">{c.target.howKo}</span>
                  </td>
                  <td className="num py-2.5 text-right">{c.mine.toFixed(1)}</td>
                  <td className="num py-2.5 text-right">
                    {c.target.cm.toFixed(1)}
                    {c.target.min ? " 이상" : ""}
                  </td>
                  <td className="py-2.5 pl-4 text-right">
                    <Badge tone={c.verdict === "fits" ? "ok" : "mark"}>
                      {c.verdict === "fits" ? VERDICT_KO.fits : `${LONG.includes(c.key) ? (c.verdict === "big" ? "김" : "짧음") : VERDICT_KO[c.verdict]} ${Math.abs(c.diff)}`}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* What the wearer says. */}
      <section aria-labelledby="say-title" className="space-y-5">
        <div>
          <h3 id="say-title" className="text-lg font-semibold">
            입었을 때 불편한 점
          </h3>
          <p className="mt-1 text-[15px] text-muted">해당하는 것을 고르거나, 아래에 말하듯 적어 주십시오.</p>
        </div>
        {seated.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] text-muted">앉아서 입을 때</p>
            <div className="flex flex-wrap gap-2">{seated.map(chip)}</div>
          </div>
        )}
        {general.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] text-muted">길이와 품</p>
            <div className="flex flex-wrap gap-2">{general.map(chip)}</div>
          </div>
        )}
        {options.some((o) => o.id in picked && o.askKo) && (
          <div className="space-y-2 rounded-xl bg-field p-4">
            <p className="text-[13px] text-muted">재 본 길이가 있으면 넣어 주십시오. 모르면 비워 두면 수선집에서 잽니다.</p>
            {options
              .filter((o) => o.id in picked && o.askKo)
              .map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-[15px]">
                  <span className="flex-1">{o.askKo}</span>
                  <input inputMode="decimal" value={picked[o.id]} onChange={(e) => setPicked({ ...picked, [o.id]: e.target.value })} className="num w-20 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-right" />
                  <span className="text-muted">cm</span>
                </label>
              ))}
          </div>
        )}
        <div>
          <label htmlFor="say-text" className="mb-2 block text-[13px] text-muted">
            직접 적기
          </label>
          <textarea
            id="say-text"
            value={text}
            maxLength={MAX_TEXT}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="예: 휠체어에 앉으면 바지 뒤가 내려가고, 밑단이 3 cm쯤 짧아져요."
            className="w-full rounded-xl border border-line bg-field p-4 text-[15px] leading-relaxed"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className={buttonPrimary} disabled={busy || !text.trim()} onClick={analyse}>
              {busy ? "읽는 중…" : "이 글에서 고칠 곳 찾기"}
            </button>
            {error && <span className="text-[15px] text-mark">{error}</span>}
          </div>
          {found.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[13px] text-muted">글에서 찾은 것</p>
              <ul className="flex flex-wrap gap-2">
                {found.map(({ c, label }, i) => (
                  <li key={i} className="rounded-full bg-chalk-soft px-3.5 py-2 text-[15px]">
                    {label}
                    {c.amountCm !== undefined && <span className="num ml-1.5 font-medium">{c.amountCm} cm</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* The work order. */}
      <section aria-labelledby="order-title" className="overflow-hidden rounded-xl bg-field">
        <div className="flex flex-wrap items-baseline justify-between gap-2 bg-ink px-5 py-4 text-sand">
          <h3 id="order-title" className="font-display text-2xl">
            수선 의뢰서
          </h3>
          <span className="text-[15px]">{alterations.length > 0 ? `고칠 곳 ${alterations.length}군데` : "아직 비어 있습니다"}</span>
        </div>
        {alterations.length === 0 ? (
          <p className="px-5 py-8 text-[15px] text-muted">몸 치수를 넣거나 불편한 점을 고르면, 수선집에 그대로 보여 줄 수 있는 의뢰서가 여기에 만들어집니다.</p>
        ) : (
          <ol className="space-y-1 p-1">
            {views && (
              <li className="rounded-lg bg-paper p-4" aria-label="도식화">
                <GarmentFlat views={views} />
              </li>
            )}
            {alterations.map((a, i) => (
              <li key={a.id} className="rounded-lg bg-paper px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="num inline-flex h-6 w-6 shrink-0 translate-y-[-1px] items-center justify-center self-center rounded-full bg-mark text-[13px] font-semibold text-white" aria-label={`${i + 1}번`}>
                      {i + 1}
                    </span>
                    <span className="text-lg font-semibold">{a.actionKo}</span>
                    <span className="text-[15px] text-muted">{a.partKo}</span>
                  </p>
                  <p className="num shrink-0 text-right font-display text-3xl leading-none" aria-label={a.amountCm !== undefined ? `${a.amountCm} cm` : "수선집에서 재서 정함"}>
                    {a.amountCm !== undefined ? (
                      <>
                        {a.amountCm}
                        <span className="ml-1 font-sans text-base">cm</span>
                      </>
                    ) : (
                      <span className="font-sans text-[15px] text-muted">재서 정함</span>
                    )}
                  </p>
                </div>
                <p className="mt-1.5 text-[15px] leading-relaxed">{a.instructionKo}</p>
                <p className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={a.difficulty === "hard" ? "mark" : a.difficulty === "medium" ? "warn" : "ok"}>{DIFFICULTY_KO[a.difficulty]}</Badge>
                  {a.reversible && <Badge tone="chalk">되돌릴 수 있음</Badge>}
                  <span className="text-[13px] text-muted">{a.fromKo}</span>
                </p>
              </li>
            ))}
          </ol>
        )}
        {alterations.length > 0 && <p className="px-5 pb-4 pt-2 text-[13px] text-muted">고치기 전에 옷을 입고 한 번 더 확인하십시오.</p>}
      </section>
    </div>
  );
}
