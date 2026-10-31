import { svgPath } from "@/lib/geom/point";
import { MEASURE_KO } from "@/lib/pattern/measures";
import type { OkRun, PhotoView } from "@/lib/client/types";

// The photo with what the pipeline found: the A4 sheet, the garment outline, the SAM part masks
// and each measured line with its cm.
export function PhotoOverlay({ photo, run }: { photo: PhotoView; run?: OkRun }) {
  const fs = Math.round(Math.max(photo.width, photo.height) / 55);
  return (
    <figure className="relative overflow-hidden rounded-lg border border-line bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL or a sample, shown at its own size */}
      <img src={photo.src} alt="펴놓은 옷과 A4 용지" className="block h-auto w-full" />
      {run && (
        <svg viewBox={`0 0 ${photo.width} ${photo.height}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <path d={svgPath(run.scale.cornersPx, true)} fill="rgba(42,91,215,0.12)" stroke="var(--chalk)" strokeWidth={fs / 5} />
          {run.overlay.partsPx.map((p, i) => (
            <path key={i} d={svgPath(p, true)} fill="rgba(165,101,12,0.18)" stroke="var(--warn)" strokeWidth={fs / 7} />
          ))}
          <path d={svgPath(run.overlay.outlinePx, true)} fill="none" stroke="#fff" strokeWidth={fs / 3} opacity={0.8} />
          <path d={svgPath(run.overlay.outlinePx, true)} fill="none" stroke="var(--ink)" strokeWidth={fs / 7} />
          {run.overlay.segmentsPx.map((s) => (
            <g key={s.key}>
              <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke="var(--mark)" strokeWidth={fs / 4} strokeLinecap="round" />
              <text
                x={Math.min(photo.width - 4 * fs, Math.max(4 * fs, (s.a[0] + s.b[0]) / 2))}
                y={Math.min(photo.height - fs, Math.max(1.5 * fs, (s.a[1] + s.b[1]) / 2 - fs / 2))}
                fontSize={fs}
                textAnchor="middle"
                fill="#fff"
                stroke="var(--ink)"
                strokeWidth={fs / 6}
                paintOrder="stroke"
                fontWeight={600}
              >
                {MEASURE_KO[s.key] ?? s.key} {s.cm.toFixed(1)}
              </text>
            </g>
          ))}
        </svg>
      )}
    </figure>
  );
}
