"use client";

import { useMemo, useState } from "react";
import type { Fabric } from "@/lib/pattern/types";
import { SIZE_KEY_NAME, SIZE_KEYS, type Fit, type SizeKey } from "@/lib/rules/fit-tolerance";
import { useLang } from "@/components/lang";
import { L } from "@/lib/i18n/lang";
import { Badge, buttonGhost, Segmented } from "@/components/ui";
import { decideSize, type Mine } from "@/lib/size/decide";
import { toSizeTable, type ReadTable } from "@/lib/size/table";

const ERRORS = {
  live_disabled: L("지금은 새 실측표를 읽을 수 없습니다. 예시 표로 해 보십시오.", "New size tables can't be read right now. Try the example table.", "Ahora no podemos leer tablas nuevas. Prueba con la tabla de ejemplo."),
  visitor_limit: L("오늘 읽을 수 있는 표를 모두 읽었습니다. 내일 다시 해 주십시오.", "You've used today's table readings. Try again tomorrow.", "Ya usaste las lecturas de tablas de hoy. Vuelve a intentarlo mañana."),
  daily_limit: L("오늘은 더 이상 표를 읽을 수 없습니다. 내일 다시 해 주십시오.", "Today's table readings are used up. Try again tomorrow.", "Se agotaron las lecturas de tablas de hoy. Vuelve a intentarlo mañana."),
  failed: L("표를 읽지 못했습니다. 다시 해 주십시오.", "Couldn't read the table. Try again.", "No pudimos leer la tabla. Inténtalo de nuevo."),
} as const;

const T = {
  upload: L("실측표 스크린샷 올리기", "Upload a size table screenshot", "Sube una captura de la tabla de medidas"),
  uploadAnother: L("다른 실측표 올리기", "Upload another size table", "Sube otra tabla de medidas"),
  reading: L("표를 읽는 중…", "Reading the table…", "Leyendo la tabla…"),
  showOriginal: L("원본 표 보기", "Show the original table", "Ver la tabla original"),
  originalAlt: L("쇼핑몰 실측표", "The shop's size table", "Tabla de medidas de la tienda"),
  copied: L("표를 옮겨 적었습니다. 원본과 다른 칸이 있으면 고쳐 주십시오.", "The table as read. Fix any cell that differs from the original.", "Esta es la tabla tal como la leímos. Corrige cualquier celda que no coincida con el original."),
  size: L("사이즈", "Size", "Talla"),
  skip: L("비교 안 함", "Don't compare", "No comparar"),
  unit: L("단위", "Unit", "Unidad"),
  basis: L("폭 기준", "Widths are", "Los anchos son"),
  flat: L("단면", "Flat", "En plano"),
  around: L("둘레", "Around the body", "Contorno"),
  unstated: L("표에 없음", "Not stated", "No lo dice"),
  wantedFit: L("원하는 핏", "Wanted fit", "Ajuste deseado"),
  tighter: L("조금 붙게", "A little closer", "Un poco más ceñido"),
  same: L("내 옷과 같게", "Same as my garment", "Igual que mi prenda"),
  looser: L("조금 여유 있게", "A little looser", "Un poco más holgado"),
  askBasis: L("표의 폭이 단면인지 둘레인지 골라 주십시오.", "Choose whether the table's widths are flat or around the body.", "Elige si los anchos de la tabla son en plano o en contorno."),
  nothing: L("표와 내 옷에 같은 측정 항목이 없습니다.", "The table and your garment have no measurement in common.", "La tabla y tu prenda no tienen ninguna medida en común."),
  recommended: L("추천 사이즈", "Recommended size", "Talla recomendada"),
  fits: L("맞음", "Fits", "Queda bien"),
  noFit: L("안 맞음", "Doesn't fit", "No queda bien"),
};

// Mode 2: your garment against a shop's size table. Spark copies the table; you check it here;
// the decision is code.
export function SizePanel({ mine, fabric, sample }: { mine: Partial<Record<SizeKey, Mine>>; fabric: Fabric; sample?: { read: ReadTable; src: string } }) {
  const lang = useLang();
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
      if (!res.ok) setError((ERRORS[body.error as keyof typeof ERRORS] ?? ERRORS.failed)[lang]);
      else setRead(body.table);
    } catch {
      setError(ERRORS.failed[lang]);
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
          {read ? T.uploadAnother[lang] : T.upload[lang]}
          <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {busy && <span className="text-sm text-muted">{T.reading[lang]}</span>}
        {error && <span className="text-sm text-mark">{error}</span>}
      </div>

      {src && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">{T.showOriginal[lang]}</summary>
          {/* eslint-disable-next-line @next/next/no-img-element -- the user's own screenshot or the sample */}
          <img src={src} alt={T.originalAlt[lang]} className="mt-2 max-w-full rounded border border-line" />
        </details>
      )}

      {read && parsed && (
        <>
          <p className="text-sm text-muted">{T.copied[lang]}</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="whitespace-nowrap border-b border-line p-2 text-left">{T.size[lang]}</th>
                  {read.columns.map((col, c) => (
                    <th key={c} className="whitespace-nowrap border-b border-line p-2 text-left font-normal">
                      <div className="font-semibold">{col.header}</div>
                      <select value={col.meaning} onChange={(e) => setMeaning(c, e.target.value)} className="mt-1 rounded-md border border-line bg-field px-1 py-0.5 text-xs">
                        {[...SIZE_KEYS, "other"].map((k) => (
                          <option key={k} value={k}>
                            {k === "other" ? T.skip[lang] : SIZE_KEY_NAME[k as SizeKey][lang]}
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
              {T.unit[lang]}{" "}
              <select value={read.unit} onChange={(e) => setRead({ ...read, unit: e.target.value as ReadTable["unit"] })} className="rounded-md border border-line bg-field">
                <option value="cm">cm</option>
                <option value="inch">inch</option>
              </select>
            </label>
            <label className={read.basis === "unknown" ? "rounded bg-warn-soft px-1" : ""}>
              {T.basis[lang]}{" "}
              <select value={read.basis} onChange={(e) => setRead({ ...read, basis: e.target.value as ReadTable["basis"] })} className="rounded-md border border-line bg-field">
                <option value="flat">{T.flat[lang]}</option>
                <option value="circumference">{T.around[lang]}</option>
                <option value="unknown">{T.unstated[lang]}</option>
              </select>
            </label>

          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">{T.wantedFit[lang]}</span>
            <Segmented
              size="sm"
              value={fit}
              onChange={setFit}
              options={[
                { value: "tighter", label: T.tighter[lang] },
                { value: "same", label: T.same[lang] },
                { value: "looser", label: T.looser[lang] },
              ]}
            />
          </div>

          {decision && !decision.ok && <p className="rounded-md bg-warn-soft p-3 text-sm">{decision.reason === "ask-basis" ? T.askBasis[lang] : T.nothing[lang]}</p>}
          {decision?.ok && (
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="flex items-center gap-4 bg-ink p-5 text-sand">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-sand text-3xl font-semibold text-ink">{decision.best.label}</div>
                <div>
                  <p className="text-sm">{T.recommended[lang]}</p>
                  <p className="mt-1 text-sm">{decision.sentences[0]?.[lang].replace(/^[^:]+:\s*/, "")}</p>
                </div>
              </div>
              {decision.sentences.length > 1 && (
                <ul className="space-y-1 bg-warn-soft px-5 py-3 text-sm">
                  {decision.sentences.slice(1).map((t) => (
                    <li key={t.en}>{t[lang]}</li>
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
                          <Verdict fits={c.verdict === "fits"} label={(c.verdict === "fits" ? T.fits : T.noFit)[lang]} /> {SIZE_KEY_NAME[c.key][lang]} {c.diff > 0 ? "+" : c.diff < 0 ? "−" : ""}
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
function Verdict({ fits, label }: { fits: boolean; label: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" role="img" aria-label={label}>
      <path d={fits ? "M1.5 5.5 L4 8 L8.5 2" : "M2 2 L8 8 M8 2 L2 8"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
