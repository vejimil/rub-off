// A garment card's picture: the whole garment as a drawing, an arrow, and the pattern pieces it
// comes apart into, both from the same example measurements.

import { PiecesOutline } from "@/components/pattern-preview";
import { flatFor } from "@/lib/fit/flat";
import { svgPath, type Pt } from "@/lib/geom/point";
import { bounds } from "@/lib/geom/polygon";
import { quad } from "@/lib/pattern/curves";
import { draft } from "@/lib/pattern/draft";
import { EXAMPLES } from "@/lib/pattern/examples";
import { drawingSheet } from "@/lib/pattern/layout";
import { seamLine, type GarmentKind } from "@/lib/pattern/types";

interface Drawing {
  shapes: Pt[][]; // filled, closed
  lines: Pt[][]; // seams and details
}

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// The things that aren't worn have no technical flat; they are simple enough to draw from their
// measurements here.
function goods(garment: GarmentKind): Drawing | null {
  const m = EXAMPLES[garment].m as Record<string, number>;
  switch (garment) {
    case "eco-bag": {
      const w = m.width, h = m.height, hl = m.handleLength * 0.32;
      const handle = (a: number, b: number) => quad([a, 0], [(a + b) / 2, -2 * hl], [b, 0], 20);
      return { shapes: [rect(0, 0, w, h)], lines: [handle(0.22 * w, 0.78 * w), handle(0.3 * w, 0.7 * w)] };
    }
    case "apron": {
      const p = draft({ garment, measures: EXAMPLES.apron.m, fabric: "woven" });
      const half = seamLine(p.pieces.find((x) => x.id === "body")!);
      const whole: Pt[] = [...half, ...[...half].reverse().map(([x, y]): Pt => [-x, y])];
      const b = bounds(half), bib = m.bibWidth / 2, waist = b.maxX;
      const waistY = half.find(([x]) => Math.abs(x - waist) < 1e-6)?.[1] ?? 0.3 * b.maxY;
      return {
        shapes: [whole],
        lines: [quad([-bib, 0], [0, -0.45 * bib * 2], [bib, 0], 20), [[waist, waistY], [waist + 14, waistY + 10]], [[-waist, waistY], [-waist - 14, waistY + 10]]],
      };
    }
    case "cushion":
      return { shapes: [rect(0, 0, m.width, m.height)], lines: [[[0.06 * m.width, 0.06 * m.height], [0.94 * m.width, 0.06 * m.height]]] };
    case "pouch": {
      const w = m.width, h = m.height;
      return { shapes: [rect(0, 0, w, h)], lines: [[[0.05 * w, 1.2], [0.95 * w, 1.2]], rect(0.95 * w - 1, 0.4, 0.95 * w + 2.2, 2)] };
    }
    default:
      return null;
  }
}

function garmentDrawing(garment: GarmentKind): Drawing | null {
  const ex = EXAMPLES[garment];
  const views = flatFor(garment, ex.m as Record<string, number>, ex.fabric, []);
  if (!views) return goods(garment);
  const front = views[0];
  return { shapes: [front.outline], lines: [...front.seams, ...front.stitches] };
}

export function GarmentToPattern({ garment }: { garment: GarmentKind }) {
  const d = garmentDrawing(garment);
  const ex = EXAMPLES[garment];
  const sheet = drawingSheet(draft({ garment, measures: ex.m, fabric: ex.fabric }), 0.9);
  if (!d) return <PiecesOutline sheet={sheet} />;
  const b = bounds([...d.shapes.flat(), ...d.lines.flat()]);
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY), pad = 0.04 * size, sw = size / 130;
  return (
    <div className="flex h-full items-center gap-3">
      <svg viewBox={[b.minX - pad, b.minY - pad, b.maxX - b.minX + 2 * pad, b.maxY - b.minY + 2 * pad].map((x) => x.toFixed(2)).join(" ")} className="h-full min-w-0 flex-1" aria-hidden>
        {d.shapes.map((s, i) => (
          <path key={i} d={svgPath(s, true)} fill="var(--field)" stroke="var(--ink)" strokeWidth={(1.4 * sw).toFixed(2)} strokeLinejoin="round" />
        ))}
        {d.lines.map((l, i) => (
          <path key={`l${i}`} d={svgPath(l)} fill="none" stroke="var(--ink)" strokeWidth={(0.8 * sw).toFixed(2)} strokeLinecap="round" />
        ))}
      </svg>
      <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0 text-ink transition-transform duration-300 group-hover:translate-x-1" aria-hidden>
        <path d="M3 14 H24 M17 7 L24 14 L17 21" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <div className="h-full min-w-0 flex-1">
        <PiecesOutline sheet={sheet} />
      </div>
    </div>
  );
}
