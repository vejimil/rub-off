import { svgPath } from "@/lib/geom/point";
import { A4_TILING, pagesFor, type Sheet } from "@/lib/pattern/layout";
import { bounds } from "@/lib/geom/polygon";

// The laid-out pattern at a glance: cutting lines, seam lines, grainlines and the A4 pages it
// prints on. Units are cm.
export function PatternPreview({ sheet }: { sheet: Sheet }) {
  const [cols, rows] = pagesFor(sheet.width, sheet.height);
  const W = (cols - 1) * A4_TILING.step[0] + A4_TILING.content[0], H = (rows - 1) * A4_TILING.step[1] + A4_TILING.content[1];
  return (
    <svg viewBox={`-1 -1 ${W + 2} ${H + 2}`} className="h-auto w-full rounded-2xl border border-line bg-paper" role="img" aria-label="패턴 배치와 인쇄 페이지">
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
            <path d={svgPath(pp.cut, true)} fill="rgba(42,91,215,0.06)" stroke="var(--ink)" strokeWidth={0.25} />
            {pp.piece.edges.map((e, i) => (
              <path key={i} d={svgPath(e.pts)} fill="none" stroke={e.kind === "fold" ? "var(--chalk)" : "var(--muted)"} strokeWidth={0.12} strokeDasharray={e.kind === "fold" ? "1.2 0.4 0.2 0.4" : "0.5 0.3"} />
            ))}
            <line x1={g0[0]} y1={g0[1]} x2={g1[0]} y2={g1[1]} stroke="var(--ink)" strokeWidth={0.12} />
            <text x={(b.minX + b.maxX) / 2} y={(b.minY + b.maxY) / 2} fontSize={2.2} textAnchor="middle" fill="var(--ink)" fontWeight={600}>
              {pp.piece.nameKo}
            </text>
            <text x={(b.minX + b.maxX) / 2} y={(b.minY + b.maxY) / 2 + 2.6} fontSize={1.4} textAnchor="middle" fill="var(--muted)">
              {pp.piece.cut.onFold ? `골선 ${pp.piece.cut.count}장` : `${pp.piece.cut.count}장${pp.piece.cut.mirror ? " (대칭)" : ""}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
