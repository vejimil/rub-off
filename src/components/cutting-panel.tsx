"use client";

import { useMemo, useState } from "react";
import { resizeToJpeg } from "@/lib/client/resize";
import { applyH, type Mat3 } from "@/lib/geom/homography";
import type { Pt } from "@/lib/geom/point";
import { svgPath } from "@/lib/geom/point";
import { bounds } from "@/lib/geom/polygon";
import { buttonGhost } from "@/components/ui";
import { nest, piecesToCut } from "@/lib/nest/nest";
import type { Pattern } from "@/lib/pattern/types";

interface FabricPhoto {
  src: string;
  width: number;
  height: number;
  scrapsCm: Pt[][];
  cmToPx: Mat3;
}

const ERRORS: Record<string, string> = {
  live_disabled: "공개 데모에서는 원단 사진 분석을 끄고, 원단 크기 입력으로만 배치합니다.",
  visitor_limit: "오늘 분석할 수 있는 사진 수를 모두 썼습니다.",
  daily_limit: "오늘 전체 사용량을 모두 썼습니다.",
};

// Mode 3: does the pattern fit on the fabric you have? Scraps from a photo (SAM 3.1 + A4) or typed
// sizes; the layout is deterministic and runs here in the browser.
export function CuttingPanel({ pattern, live }: { pattern: Pattern; live: boolean }) {
  const [sizes, setSizes] = useState("110x100");
  const [photo, setPhoto] = useState<FabricPhoto | null>(null);
  const [crossGrain, setCrossGrain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Typed scraps, "110x100, 60x45", laid side by side 10 cm apart.
  const typed = useMemo(() => {
    const dims = sizes
      .split(/[,\s]+/)
      .map((s) => s.match(/^(\d+(?:\.\d+)?)[x×*](\d+(?:\.\d+)?)$/i))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [Number(m[1]), Number(m[2])] as const);
    const starts = dims.map((_, i) => dims.slice(0, i).reduce((s, [w]) => s + w + 10, 0));
    return dims.map(([w, h], i): Pt[] => [[starts[i], 0], [starts[i] + w, 0], [starts[i] + w, h], [starts[i], h]]);
  }, [sizes]);

  const fabric = photo?.scrapsCm ?? typed;
  const result = useMemo(() => (fabric.length ? nest(piecesToCut(pattern), fabric, { allowCrossGrain: crossGrain }) : null), [pattern, fabric, crossGrain]);

  async function upload(f: File) {
    setBusy(true);
    setError(null);
    try {
      const r = await resizeToJpeg(f);
      const form = new FormData();
      form.set("photo", r.blob, "fabric.jpg");
      const res = await fetch("/api/fabric", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) setError(ERRORS[body.error] ?? "원단 사진을 분석하지 못했습니다.");
      else if (!body.run.ok) setError(body.run.detail);
      else setPhoto({ src: r.url, width: r.width, height: r.height, scrapsCm: body.run.scrapsCm, cmToPx: body.run.cmToPx });
    } finally {
      setBusy(false);
    }
  }

  const fb = bounds(fabric.flat());
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label>
          원단 크기(cm, 가로x세로, 여러 장은 쉼표){" "}
          <input value={sizes} onChange={(e) => { setSizes(e.target.value); setPhoto(null); }} className="w-44 rounded-lg border border-line bg-field px-2 py-1" />
        </label>
        {live && (
          <label className={`${buttonGhost} cursor-pointer`}>
            {busy ? "SAM 3.1이 원단을 찾는 중…" : "원단 사진으로"}
            <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        )}
        <label>
          <input type="checkbox" checked={crossGrain} onChange={(e) => setCrossGrain(e.target.checked)} /> 식서 90° 돌림 허용
        </label>
      </div>
      <p className="text-sm text-muted">원단의 식서(세로 방향)는 사진·입력의 세로입니다. 조각은 식서를 따라 0°·180°로만 돌리고, 원단 가장자리와 조각 사이에 1 cm 이상 띄웁니다.</p>
      {error && <p className="rounded-xl bg-mark-soft p-3 text-sm">{error}</p>}

      {result && (
        <>
          {result.unplaced.length === 0 ? (
            <p className="rounded-xl bg-ok-soft p-3 text-sm">
              조각 {result.placed.length}장이 모두 들어갑니다. 원단 사용률 {Math.round((100 * result.usedAreaCm2) / result.fabricAreaCm2)}%.
            </p>
          ) : (
            <ul className="space-y-1 rounded-xl bg-mark-soft p-3 text-sm">
              {result.unplaced.map((u) => (
                <li key={u.piece.id}>
                  {u.piece.nameKo}이(가) 들어가지 않습니다: 조각 {u.size[0].toFixed(0)} × {u.size[1].toFixed(0)} cm, 남은 가장 큰 빈 곳 {u.largestFree[0]} × {u.largestFree[1]} cm.
                  {!crossGrain && u.size[1] <= u.largestFree[0] && u.size[0] <= u.largestFree[1] && " 식서를 90° 돌리면 들어갈 수 있습니다(원단에 따라 늘어남·광택이 달라집니다)."}
                </li>
              ))}
            </ul>
          )}
          {photo ? (
            <figure className="relative overflow-hidden rounded-xl bg-well">
              {/* eslint-disable-next-line @next/next/no-img-element -- the user's own fabric photo */}
              <img src={photo.src} alt="원단" className="block h-auto w-full" />
              <svg viewBox={`0 0 ${photo.width} ${photo.height}`} className="absolute inset-0 h-full w-full" aria-hidden>
                {result.placed.map((p) => (
                  <path key={p.piece.id} d={svgPath(p.outline.map((q) => applyH(photo.cmToPx, q)), true)} fill="rgba(6,43,138,0.25)" stroke="var(--ink)" strokeWidth={photo.width / 300} />
                ))}
              </svg>
            </figure>
          ) : (
            <svg viewBox={`${fb.minX - 2} ${fb.minY - 2} ${fb.maxX - fb.minX + 4} ${fb.maxY - fb.minY + 4}`} className="h-auto w-full rounded-xl bg-well" role="img" aria-label="원단 위 재단 배치">
              {fabric.map((f, i) => (
                <path key={i} d={svgPath(f, true)} fill="var(--sand)" stroke="var(--muted)" strokeWidth={0.3} />
              ))}
              {result.placed.map((p) => {
                const b = bounds(p.outline);
                return (
                  <g key={p.piece.id}>
                    <path d={svgPath(p.outline, true)} fill="rgba(6,43,138,0.12)" stroke="var(--ink)" strokeWidth={0.3} />
                    <text x={(b.minX + b.maxX) / 2} y={(b.minY + b.maxY) / 2} fontSize={2.5} textAnchor="middle" fill="var(--ink)">
                      {p.piece.nameKo}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </>
      )}
    </section>
  );
}
