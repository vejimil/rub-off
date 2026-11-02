"use client";

import { svgPath, type Pt } from "@/lib/geom/point";
import { MEASURE_KO } from "@/lib/pattern/measures";
import type { OkRun, PhotoView } from "@/lib/client/types";

// The photo with what the pipeline found: the A4 sheet, the garment outline, the SAM part masks
// and each measured line with its cm. With onTap, a click reports where on the photo it landed
// (as fractions of its width and height), and taps are drawn as rings.
export function PhotoOverlay({ photo, run, onTap, taps = [], className = "rounded-xl" }: { photo: PhotoView; run?: OkRun; onTap?: (p: Pt) => void; taps?: Pt[]; className?: string }) {
  const fs = Math.round(Math.max(photo.width, photo.height) / 55);
  return (
    <figure
      className={`relative overflow-hidden bg-well ${className} ${onTap ? "cursor-crosshair ring-2 ring-ink" : ""}`}
      onClick={(e) => {
        if (!onTap) return;
        const r = e.currentTarget.getBoundingClientRect();
        onTap([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL or a sample, shown at its own size */}
      <img src={photo.src} alt="펴놓은 옷과 A4 용지" width={photo.width} height={photo.height} className="block h-auto w-full" />
      {run && (
        <svg viewBox={`0 0 ${photo.width} ${photo.height}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <path d={svgPath(run.scale.cornersPx, true)} fill="rgba(255,255,255,0.35)" stroke="var(--ink)" strokeWidth={fs / 5} />
          {run.overlay.partsPx.map((p, i) => (
            <path key={i} d={svgPath(p, true)} fill="rgba(6,43,138,0.10)" stroke="var(--muted)" strokeWidth={fs / 7} />
          ))}
          <path d={svgPath(run.overlay.outlinePx, true)} fill="none" stroke="var(--sand)" strokeWidth={fs / 3} opacity={0.8} />
          <path d={svgPath(run.overlay.outlinePx, true)} fill="none" stroke="var(--ink)" strokeWidth={fs / 7} strokeDasharray={`${fs / 2} ${fs / 3}`} />
          {run.overlay.segmentsPx.map((s) => (
            <g key={`${s.key}-${s.a[0]}`}>
              <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke="var(--sand)" strokeWidth={fs / 2.2} strokeLinecap="round" opacity={0.85} />
              <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke="var(--ink)" strokeWidth={fs / 5} strokeLinecap="round" />
              <circle cx={s.a[0]} cy={s.a[1]} r={fs / 3} fill="var(--ink)" stroke="var(--sand)" strokeWidth={fs / 10} />
              <circle cx={s.b[0]} cy={s.b[1]} r={fs / 3} fill="var(--ink)" stroke="var(--sand)" strokeWidth={fs / 10} />
            </g>
          ))}
          {/* Labels last, so no line crosses a label. */}
          {dedupe(run.overlay.segmentsPx).map((s) => {
            const label = `${MEASURE_KO[s.key] ?? s.key} ${s.cm.toFixed(1)}`;
            const w = label.length * fs * 0.62 + fs;
            const h = fs * 1.5;
            const x = Math.min(photo.width - w / 2 - fs / 2, Math.max(w / 2 + fs / 2, (s.a[0] + s.b[0]) / 2));
            const y = Math.min(photo.height - h, Math.max(h, (s.a[1] + s.b[1]) / 2));
            return (
              <g key={`label-${s.key}`}>
                <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} fill="var(--ink)" />
                <text x={x} y={y + fs * 0.36} fontSize={fs} textAnchor="middle" fill="var(--sand)" fontWeight={600} className="num">
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {taps.length > 0 && (
        <svg viewBox={`0 0 ${photo.width} ${photo.height}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {taps.map(([u, v], i) => (
            <g key={i}>
              <circle cx={u * photo.width} cy={v * photo.height} r={fs * 0.9} fill="none" stroke="var(--chalk)" strokeWidth={fs / 5} />
              <circle cx={u * photo.width} cy={v * photo.height} r={fs / 5} fill="var(--chalk)" />
            </g>
          ))}
        </svg>
      )}
    </figure>
  );
}

// One label per measurement, even when it is drawn on both sides.
function dedupe<T extends { key: string }>(xs: readonly T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)));
}
