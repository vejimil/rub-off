"use client";

import { useId } from "react";
import { svgPath, type Pt } from "@/lib/geom/point";
import type { FlatView } from "@/lib/fit/flat";

const VIEW_KO = { front: "앞", back: "뒤" } as const;

// A technical flat, front and back, with the work order's alterations marked and numbered.
// Three line weights (silhouette, seams, dashed stitching) as in docs/FLAT-CONVENTIONS.md; added
// fabric hatched, removed fabric cross-hatched, so the marks read in grayscale print too.
export function GarmentFlat({ views, className = "" }: { views: FlatView[]; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      {views.map((v) => (
        <OneView key={v.view} v={v} />
      ))}
    </div>
  );
}

function OneView({ v }: { v: FlatView }) {
  const uid = useId().replace(/:/g, "");
  const pts: Pt[] = [...v.outline, ...v.add.flat(), ...v.marks.flat(), ...v.tags.flatMap((t) => (t.at ? [t.at] : []))];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const w0 = Math.max(...xs) - Math.min(...xs), h0 = Math.max(...ys) - Math.min(...ys);
  const u = Math.max(w0, h0) / 100; // one hundredth of the drawing
  const font = 4.6 * u, r = 3.6 * u;
  const textRoom = v.tags.length ? 9 * font * 0.62 : 0;
  const leftText = v.tags.some((t) => t.at && t.at[0] < 0) ? textRoom : 0, rightText = v.tags.some((t) => t.at && t.at[0] >= 0) ? textRoom : 0;
  const pad = 2 * r;
  const vb = [Math.min(...xs) - pad - leftText, Math.min(...ys) - pad, w0 + 2 * pad + leftText + rightText, h0 + 2 * pad];
  const OUTLINE = 0.5 * u, SEAM = 0.28 * u, STITCH = 0.18 * u;
  const add = `${uid}-add`, rem = `${uid}-rem`;
  return (
    <figure>
      <svg viewBox={vb.map((x) => x.toFixed(2)).join(" ")} className="h-auto w-full" role="img" aria-label={`${VIEW_KO[v.view]}면 도식화${v.tags.length ? `, 고칠 곳 ${v.tags.length}군데 표시` : ""}`}>
        <defs>
          <pattern id={add} width={1.6 * u} height={1.6 * u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={1.6 * u} height={1.6 * u} fill="var(--mark-soft)" />
            <line x1="0" y1="0" x2="0" y2={1.6 * u} stroke="var(--mark)" strokeWidth={0.4 * u} />
          </pattern>
          <pattern id={rem} width={1.6 * u} height={1.6 * u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={1.6 * u} stroke="var(--mark)" strokeWidth={0.3 * u} />
            <line x1="0" y1="0" x2={1.6 * u} y2="0" stroke="var(--mark)" strokeWidth={0.3 * u} />
          </pattern>
        </defs>
        <path d={svgPath(v.outline, true)} fill="var(--field)" stroke="var(--ink)" strokeWidth={OUTLINE} strokeLinejoin="round" />
        {v.seams.map((s, i) => (
          <path key={`s${i}`} d={svgPath(s)} fill="none" stroke="var(--ink)" strokeWidth={SEAM} strokeLinejoin="round" />
        ))}
        {v.stitches.map((s, i) => (
          <path key={`t${i}`} d={svgPath(s)} fill="none" stroke="var(--ink)" strokeWidth={STITCH} strokeDasharray={`${0.9 * u} ${0.6 * u}`} />
        ))}
        {v.dots.map((p, i) => (
          <circle key={`d${i}`} cx={p[0]} cy={p[1]} r={0.6 * u} fill="none" stroke="var(--ink)" strokeWidth={SEAM} />
        ))}
        {v.remove.map((p, i) => (
          <path key={`r${i}`} d={svgPath(p, true)} fill={`url(#${rem})`} stroke="var(--mark)" strokeWidth={STITCH} />
        ))}
        {v.add.map((p, i) => (
          <path key={`a${i}`} d={svgPath(p, true)} fill={`url(#${add})`} stroke="var(--mark)" strokeWidth={STITCH} />
        ))}
        {v.marks.map((p, i) => (
          <path key={`m${i}`} d={svgPath(p)} fill="none" stroke="var(--mark)" strokeWidth={SEAM * 1.6} strokeDasharray={`${1.4 * u} ${0.7 * u}`} strokeLinecap="round" />
        ))}
        {v.markDots.map((p, i) => (
          <circle key={`md${i}`} cx={p[0]} cy={p[1]} r={0.75 * u} fill="var(--mark)" />
        ))}
        {v.tags.map((t) =>
          t.at ? (
            <g key={t.n}>
              {t.anchors.map(([ax, ay], i) => (
                <g key={i}>
                  <line x1={t.at![0]} y1={t.at![1]} x2={ax} y2={ay} stroke="var(--mark)" strokeWidth={STITCH} />
                  <circle cx={ax} cy={ay} r={0.6 * u} fill="var(--mark)" />
                </g>
              ))}
              <circle cx={t.at[0]} cy={t.at[1]} r={r} fill="var(--mark)" />
              <text x={t.at[0]} y={t.at[1] + 0.36 * font} textAnchor="middle" fontSize={font} fontWeight={600} fill="#fff">
                {t.n}
              </text>
              <text x={t.at[0] + (t.at[0] < 0 ? -1 : 1) * (r + u)} y={t.at[1] + 0.36 * font} textAnchor={t.at[0] < 0 ? "end" : "start"} fontSize={font} fontWeight={600} fill="var(--mark)">
                {t.text}
              </text>
            </g>
          ) : null,
        )}
      </svg>
      <figcaption className="mt-1 text-center text-[13px] text-muted">{VIEW_KO[v.view]}</figcaption>
    </figure>
  );
}
