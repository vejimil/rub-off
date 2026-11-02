"use client";

import { useMemo, useState } from "react";
import type { Fabric } from "@/lib/pattern/types";
import { SIZE_KEY_KO, SIZE_KEYS, type Fit, type SizeKey } from "@/lib/rules/fit-tolerance";
import { Badge, buttonGhost, Segmented } from "@/components/ui";
import { decideSize, type Mine } from "@/lib/size/decide";
import { toSizeTable, type ReadTable } from "@/lib/size/table";

const ERRORS: Record<string, string> = {
  live_disabled: "지금은 새 실측표 읽기를 쉬고 있습니다. 예시 표로 해 보십시오.",
  visitor_limit: "오늘 읽을 수 있는 횟수를 모두 썼습니다.",
  daily_limit: "오늘 전체 사용량을 모두 썼습니다.",
};

// Mode 2: your garment against a shop's size table. Spark copies the table; you check it here;
// the decision is code.
export function SizePanel({ mine, fabric, sample }: { mine: Partial<Record<SizeKey, Mine>>; fabric: Fabric; sample?: { read: ReadTable; src: string } }) {
  const [read, setRead] = useState<ReadTable | null>(sample?.read ?? null);
  const [src, setSrc] = useState<string | null>(sample?.src ?? null);
  const [fit, setFit] = useState<Fit>("same");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setSrc(URL.createObjectURL(file));
    const form = new FormData();
    form.set("table", file);
    try {
      const res = await fetch("/api/size-table", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) setError(ERRORS[body.error] ?? "표를 읽지 못했습니다. 다시 시도해 주십시오.");
      else setRead(body.table);
    } finally {
      setBusy(false);
    }
  }

  const parsed = useMemo(() => (read ? toSizeTable(read) : null), [read]);
  const decision = useMemo(() => (parsed ? decideSize(mine, parsed.table, fabric, fit) : null), [parsed, mine, fabric, fit]);

  const setCell = (r: number, c: number, v: string) =>
    read && setRead({ ...read, rows: read.rows.map((row, i) => (i === r ? { ...row, cells: row.cells.map((x, j) => (j === c ? v : x)) } : row)) });
  const setMeaning = (c: number, v: string) =>
    read && setRead({ ...read, columns: read.columns.map((col, j) => (j === c ? { ...col, meaning: v as ReadTable["columns"][number]["meaning"] } : col)) });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${buttonGhost} cursor-pointer`}>
          {read ? "다른 실측표 올리기" : "실측표 스크린샷 올리기"}
          <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {busy && <span className="text-sm text-muted">표를 읽는 중…</span>}
        {error && <span className="text-sm text-mark">{error}</span>}
      </div>

      {src && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">원본 표 보기</summary>
          {/* eslint-disable-next-line @next/next/no-img-element -- the user's own screenshot or the sample */}
          <img src={src} alt="쇼핑몰 실측표" className="mt-2 max-w-full rounded border border-line" />
        </details>
      )}

      {read && parsed && (
        <>
          <p className="text-sm text-muted">표를 옮겨 적었습니다. 원본과 다른 칸이 있으면 고쳐 주십시오.</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="whitespace-nowrap border-b border-line p-2 text-left">사이즈</th>
                  {read.columns.map((col, c) => (
                    <th key={c} className="whitespace-nowrap border-b border-line p-2 text-left font-normal">
                      <div className="font-semibold">{col.header}</div>
                      <select value={col.meaning} onChange={(e) => setMeaning(c, e.target.value)} className="mt-1 rounded-md border border-line bg-field px-1 py-0.5 text-xs">
                        {[...SIZE_KEYS, "other"].map((k) => (
                          <option key={k} value={k}>
                            {k === "other" ? "비교 안 함" : SIZE_KEY_KO[k as SizeKey]}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {read.rows.map((row, r) => (
                  <tr key={r}>
                    <td className="border-b border-line p-2 font-semibold">{row.label}</td>
                    {row.cells.map((cell, c) => (
                      <td key={c} className="border-b border-line p-1">
                        <input
                          value={cell ?? ""}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          className={`w-12 rounded-lg border px-1.5 py-1 text-right tabular-nums ${parsed.unreadable.some((u) => u.row === row.label && u.header === read.columns[c].header) ? "border-mark bg-mark-soft" : "border-line bg-field"}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label>
              단위{" "}
              <select value={read.unit} onChange={(e) => setRead({ ...read, unit: e.target.value as ReadTable["unit"] })} className="rounded-md border border-line bg-field">
                <option value="cm">cm</option>
                <option value="inch">inch</option>
              </select>
            </label>
            <label className={read.basis === "unknown" ? "rounded bg-warn-soft px-1" : ""}>
              폭 기준{" "}
              <select value={read.basis} onChange={(e) => setRead({ ...read, basis: e.target.value as ReadTable["basis"] })} className="rounded-md border border-line bg-field">
                <option value="flat">단면</option>
                <option value="circumference">둘레</option>
                <option value="unknown">표에 없음</option>
              </select>
            </label>

          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">원하는 핏</span>
            <Segmented
              size="sm"
              value={fit}
              onChange={setFit}
              options={[
                { value: "tighter", label: "조금 붙게" },
                { value: "same", label: "내 옷과 같게" },
                { value: "looser", label: "조금 여유 있게" },
              ]}
            />
          </div>

          {decision && !decision.ok && <p className="rounded-md bg-warn-soft p-3 text-sm">{decision.reason === "ask-basis" ? "표의 폭이 단면인지 둘레인지 골라 주십시오." : "표와 내 옷에 같은 측정 항목이 없습니다."}</p>}
          {decision?.ok && (
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="flex items-center gap-4 bg-ink p-5 text-sand">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-sand text-3xl font-semibold text-ink">{decision.best.label}</div>
                <div>
                  <p className="text-sm">추천 사이즈</p>
                  <p className="mt-1 text-sm">{decision.sentences[0]?.replace(/^[^:]+:\s*/, "")}</p>
                </div>
              </div>
              {decision.sentences.length > 1 && (
                <ul className="space-y-1 bg-warn-soft px-5 py-3 text-sm">
                  {decision.sentences.slice(1).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
              <div className="divide-y divide-line">
                {decision.all.map((r) => (
                  <div key={r.label} className={`flex items-center gap-3 px-5 py-2.5 text-sm ${r.label === decision.best.label ? "bg-chalk-soft" : ""}`}>
                    <span className="w-10 font-semibold">{r.label}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {r.checks.map((c) => (
                        <Badge key={c.key} tone={c.verdict === "fits" ? "ok" : "mark"}>
                          <Verdict fits={c.verdict === "fits"} /> {SIZE_KEY_KO[c.key]} {c.diff > 0 ? "+" : c.diff < 0 ? "−" : ""}
                          {Math.abs(c.diff)}
                        </Badge>
                      ))}
                    </div>
                    <span className="num ml-auto text-xs text-muted">
                      {r.fits}/{r.checks.length}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// A check or a cross, drawn, with the words for screen readers.
function Verdict({ fits }: { fits: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" role="img" aria-label={fits ? "맞음" : "안 맞음"}>
      <path d={fits ? "M1.5 5.5 L4 8 L8.5 2" : "M2 2 L8 8 M8 2 L2 8"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
