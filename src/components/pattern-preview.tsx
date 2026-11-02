"use client";

import { useLang } from "@/components/lang";
import { svgPath } from "@/lib/geom/point";
import { A4_TILING, pagesFor, type Sheet } from "@/lib/pattern/layout";
import { bounds } from "@/lib/geom/polygon";
import { L } from "@/lib/i18n/lang";
import { cutText, EDGE_NAME, edgeDims, matchText, seamMatches } from "@/lib/pattern/dims";

// Coordinates written to two decimals: the server and the browser can differ in the last digits
// of the same computation, and React would report the mismatch on hydration.
const f2 = (n: number) => n.toFixed(2);

// Text keeps a ring of paper around it, so a grainline or seam running under it doesn't cross it out.
const HALO = { stroke: "var(--field)", strokeWidth: 0.35, paintOrder: "stroke", strokeLinejoin: "round" } as const;

// The laid-out pattern at a glance: cutting lines, seam lines, grainlines and the A4 pages it
// prints on, with each seam line's length when `dims` is on. Units are cm.
export function PatternPreview({ sheet, dims = false, className = "h-auto w-full rounded-xl bg-field" }: { sheet: Sheet; dims?: boolean; className?: string }) {
  const lang = useLang();
  const [cols, rows] = pagesFor(sheet.width, sheet.height);
  const W = (cols - 1) * A4_TILING.step[0] + A4_TILING.content[0], H = (rows - 1) * A4_TILING.step[1] + A4_TILING.content[1];
  return (
    <svg viewBox={`-1 -1 ${W + 2} ${H + 2}`} className={className} role="img" aria-label={L("패턴 배치와 인쇄 페이지", "Pattern layout and printed pages", "Disposición del patrón y páginas impresas")[lang]}>
      {Array.from({ length: rows * cols }, (_, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        return (
          <g key={i}>
            <rect x={c * A4_TILING.step[0]} y={r * A4_TILING.step[1]} width={A4_TILING.content[0]} height={A4_TILING.content[1]} fill="none" stroke="var(--line)" strokeWidth={0.15} strokeDasharray="0.6 0.6" />
            <text x={c * A4_TILING.step[0] + 0.8} y={r * A4_TILING.step[1] + 2} fontSize={1.4} fill="var(--muted)">
              {"ABCDEFGHIJ"[r]}
              {c + 1}
            </text>
          </g>
        );
      })}
      {sheet.pieces.map((pp) => {
        const b = bounds(pp.cut);
        const [g0, g1] = pp.piece.grain;
        return (
          <g key={pp.piece.id}>
            <path d={svgPath(pp.cut, true)} fill="rgba(6,43,138,0.05)" stroke="var(--ink)" strokeWidth={0.25} />
            {pp.piece.edges.map((e, i) => (
              <path key={i} d={svgPath(e.pts)} fill="none" stroke={e.kind === "fold" ? "var(--chalk)" : "var(--muted)"} strokeWidth={0.12} strokeDasharray={e.kind === "fold" ? "1.2 0.4 0.2 0.4" : "0.5 0.3"} />
            ))}
            <line x1={f2(g0[0])} y1={f2(g0[1])} x2={f2(g1[0])} y2={f2(g1[1])} stroke="var(--ink)" strokeWidth={0.12} />
            {dims &&
              edgeDims(pp.piece).map((d, i) => {
                const [x, y] = [d.at[0] + 0.9 * d.inward[0], d.at[1] + 0.9 * d.inward[1]];
                let ang = (Math.atan2(d.dir[1], d.dir[0]) * 180) / Math.PI;
                if (ang > 90) ang -= 180;
                if (ang < -90) ang += 180;
                return (
                  <text key={`d${i}`} x={f2(x)} y={f2(y)} transform={`rotate(${ang.toFixed(1)} ${f2(x)} ${f2(y)})`} fontSize={1.05} textAnchor="middle" dominantBaseline="middle" fill="var(--ink)" {...HALO}>
                    {`${EDGE_NAME[d.kind][lang]} ${d.cm.toFixed(1)}`.trim()}
                  </text>
                );
              })}
            <text x={f2((b.minX + b.maxX) / 2)} y={f2((b.minY + b.maxY) / 2 - 0.4)} fontSize={2.2} textAnchor="middle" fill="var(--ink)" fontWeight={600} {...HALO}>
              {pp.piece.names[lang]}
            </text>
            <text x={f2((b.minX + b.maxX) / 2)} y={f2((b.minY + b.maxY) / 2 + 1.6)} fontSize={1.4} textAnchor="middle" fill="var(--muted)" {...HALO}>
              {cutText(pp.piece, lang)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// The seams that are sewn to each other, with their lengths and the difference between them.
const SEAMS = {
  title: L("서로 꿰매는 솔기", "Seams sewn together", "Costuras que se unen"),
  note: L(
    "패턴에 적힌 길이(cm)는 모두 완성선을 잰 값이고, 시접은 그 바깥에 따로 붙어 있습니다.",
    "Every length on the pattern (cm) is measured on the seam line; the seam allowance is added outside it.",
    "Cada largo del patrón (cm) se mide en la línea de costura; el margen de costura va por fuera.",
  ),
};

export function SeamChecks({ sheet }: { sheet: Sheet }) {
  const lang = useLang();
  const matches = seamMatches({ pieces: sheet.pieces.map((pp) => pp.piece) });
  return (
    <div className="rounded-xl bg-field p-3 text-sm">
      {matches.length > 0 && (
        <>
          <p className="mb-1 font-semibold">{SEAMS.title[lang]}</p>
          <ul className="mb-2 space-y-1 tabular-nums text-muted">
            {matches.map((m) => (
              <li key={m.name.en}>{matchText(m, lang)}</li>
            ))}
          </ul>
        </>
      )}
      <p className="text-xs text-muted">{SEAMS.note[lang]}</p>
    </div>
  );
}

// Just the cut outlines of a garment's pieces, as laid out for printing: a drawing of the garment.
export function PiecesOutline({ sheet, className = "h-full w-full" }: { sheet: Sheet; className?: string }) {
  return (
    <svg viewBox={`-2 -2 ${sheet.width + 4} ${sheet.height + 4}`} className={className} aria-hidden>
      {sheet.pieces.map((pp) => (
        <path key={pp.piece.id} d={svgPath(pp.cut, true)} fill="rgba(6,43,138,0.06)" stroke="var(--ink)" strokeWidth={Math.max(sheet.width, sheet.height) / 160} />
      ))}
    </svg>
  );
}
