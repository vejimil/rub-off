"use client";

import { useMemo, useState } from "react";
import type { Fabric } from "@/lib/pattern/types";
import { SIZE_KEY_KO, SIZE_KEYS, type Fit, type SizeKey } from "@/lib/rules/fit-tolerance";
import { decideSize, type Mine } from "@/lib/size/decide";
import { toSizeTable, type ReadTable } from "@/lib/size/table";

const ERRORS: Record<string, string> = {
  live_disabled: "공개 데모에서는 샘플 표만 읽을 수 있습니다.",
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
        <label className="cursor-pointer rounded-md border border-line bg-card px-3 py-2 text-sm hover:border-ink">
          실측표 스크린샷 올리기
          <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {busy && <span className="text-sm text-muted">Muse Spark가 표를 읽는 중…</span>}
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
          <p className="text-sm text-muted">Muse Spark가 옮겨 적은 표입니다. 원본과 다른 칸은 고쳐 주십시오. 숫자는 표에 적힌 그대로이며 계산은 코드가 합니다.</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b border-line p-2 text-left">사이즈</th>
                  {read.columns.map((col, c) => (
                    <th key={c} className="border-b border-line p-2 text-left font-normal">
                      <div className="font-semibold">{col.header}</div>
                      <select value={col.meaning} onChange={(e) => setMeaning(c, e.target.value)} className="mt-1 rounded border border-line bg-card text-xs">
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
                          className={`w-16 rounded border px-1 py-0.5 ${parsed.unreadable.some((u) => u.row === row.label && u.header === read.columns[c].header) ? "border-mark bg-mark-soft" : "border-line bg-card"}`}
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
              <select value={read.unit} onChange={(e) => setRead({ ...read, unit: e.target.value as ReadTable["unit"] })} className="rounded border border-line bg-card">
                <option value="cm">cm</option>
                <option value="inch">inch</option>
              </select>
            </label>
            <label className={read.basis === "unknown" ? "rounded bg-warn-soft px-1" : ""}>
              폭 기준{" "}
              <select value={read.basis} onChange={(e) => setRead({ ...read, basis: e.target.value as ReadTable["basis"] })} className="rounded border border-line bg-card">
                <option value="flat">단면</option>
                <option value="circumference">둘레</option>
                <option value="unknown">표에 없음</option>
              </select>
            </label>
            <label>
              원하는 핏{" "}
              <select value={fit} onChange={(e) => setFit(e.target.value as Fit)} className="rounded border border-line bg-card">
                <option value="same">내 옷과 같게</option>
                <option value="looser">조금 여유 있게</option>
                <option value="tighter">조금 붙게</option>
              </select>
            </label>
          </div>

          {decision && !decision.ok && <p className="rounded-md bg-warn-soft p-3 text-sm">{decision.reason === "ask-basis" ? "표의 폭이 단면인지 둘레인지 골라 주십시오." : "표와 내 옷에 같은 측정 항목이 없습니다."}</p>}
          {decision?.ok && (
            <div className="space-y-3 rounded-lg border border-line bg-card p-4">
              <p className="text-2xl font-semibold">
                추천 사이즈 <span className="text-chalk">{decision.best.label}</span>
              </p>
              <ul className="space-y-1 text-sm">
                {decision.sentences.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <table className="w-full text-sm">
                <tbody>
                  {decision.all.map((r) => (
                    <tr key={r.label} className={r.label === decision.best.label ? "font-semibold" : "text-muted"}>
                      <td className="py-1 pr-3">{r.label}</td>
                      {r.checks.map((c) => (
                        <td key={c.key} className="py-1 pr-3">
                          <span className={c.verdict === "fits" ? "text-ok" : "text-mark"}>{c.verdict === "fits" ? "✓" : "✗"}</span> {SIZE_KEY_KO[c.key]} {c.diff > 0 ? "+" : c.diff < 0 ? "−" : ""}
                          {Math.abs(c.diff)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
