"use client";

import { useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import { useLang } from "@/components/lang";
import { buttonGhost } from "@/components/ui";
import { add, svgPath, sub, type Pt } from "@/lib/geom/point";
import { bounds } from "@/lib/geom/polygon";
import { L } from "@/lib/i18n/lang";
import { clampSize, defaultPocket, inside, kangarooHost, placed, pocketAnchor, pocketHosts, pocketKinds, pocketShape, POCKET_NAME, shareOf, type Pocket, type PocketKind } from "@/lib/pattern/pockets";
import { seamLine, type Pattern } from "@/lib/pattern/types";

const T = {
  title: L("주머니 달기", "Add pockets", "Añadir bolsillos"),
  hint: L(
    "주머니를 끌어 조각 위에 놓거나, 누르면 흔히 다는 자리에 놓입니다. 놓은 주머니를 누르면 모서리를 끌어 크기를 바꿀 수 있습니다. 다는 자리는 패턴에 점선으로 표시하고, 주머니 조각을 따로 붙입니다.",
    "Drag a pocket onto a piece, or just tap it to put it where one usually goes. Tap a placed pocket and drag a corner to resize it. Its place is dotted on the pattern and the pocket is added as a piece of its own.",
    "Arrastra un bolsillo sobre una pieza, o tócalo para ponerlo donde suele ir. Toca un bolsillo colocado y arrastra una esquina para cambiar su tamaño. Su posición queda punteada en el patrón y el bolsillo se añade como pieza propia.",
  ),
  none: L("이 옷에는 주머니를 달 조각이 없습니다.", "This item has no piece to put a pocket on.", "Esta pieza no tiene dónde poner un bolsillo."),
  width: L("가로", "Width", "Ancho"),
  height: L("세로", "Height", "Alto"),
  remove: L("빼기", "Remove", "Quitar"),
  outside: L("조각 밖으로 나가서 패턴에서 빠졌습니다. 옮기거나 줄여 주십시오.", "It's outside its piece, so it's left out of the pattern. Move it or make it smaller.", "Queda fuera de su pieza, así que no entra en el patrón. Muévelo o hazlo más pequeño."),
  drawing: L("주머니를 놓을 조각", "Pieces to put pockets on", "Piezas donde poner bolsillos"),
};

const GAP = 6; // cm between pieces in the drawing
const TOP = 4; // cm above the pieces for their names

// Moving a pocket (where the pointer holds it), or resizing it from a corner (the opposite corner,
// or for a kangaroo its top centre, stays put; in the host's cm).
type Drag = { id: string; grab: Pt } | { id: string; corner: Pt; fixed: Pt } | null;
type Incoming = { kind: PocketKind; x: number; y: number; moved: boolean; id: string; at?: Pt } | null;

// Patch pockets dragged onto the garment's panels. The panels are drawn upright side by side, at
// the same scale; a pocket only lands where all of it lies inside a panel's seam line.
export function PocketEditor({ base, pockets, setPockets }: { base: Pattern; pockets: Pocket[]; setPockets: Dispatch<SetStateAction<Pocket[]>> }) {
  const lang = useLang();
  const svg = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [incoming, setIncoming] = useState<Incoming>(null);

  const hosts = pocketHosts(base);
  const kinds = pocketKinds(base);
  if (!hosts.length) return <p className="text-sm text-muted">{T.none[lang]}</p>;

  const laid: { h: Pattern["pieces"][number]; line: Pt[]; b: ReturnType<typeof bounds>; off: Pt }[] = [];
  for (const h of hosts) {
    const line = seamLine(h), b = bounds(line);
    const prev = laid.at(-1);
    const x = prev ? prev.off[0] + prev.b.maxX + GAP : 0;
    laid.push({ h, line, b, off: [x - b.minX, TOP - b.minY] });
  }
  const last = laid[laid.length - 1];
  const W = last.off[0] + last.b.maxX, H = TOP + Math.max(...laid.map((l) => l.b.maxY - l.b.minY));
  const kangaroo = kangarooHost(base);

  const toSheet = (e: { clientX: number; clientY: number }): Pt | null => {
    const el = svg.current, m = el?.getScreenCTM();
    if (!el || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const hostAt = (at: Pt) => laid.find((l) => inside(sub(at, l.off), l.line));
  const nextId = () => `p${pockets.reduce((n, p) => Math.max(n, Number(p.id.slice(1)) || 0), 0) + 1}`;

  // The pocket with its top centre at `topCentre` (sheet cm), on the panel under the pointer, if it fits there.
  const moved = (p: Pocket, pointer: Pt, topCentre: Pt): Pocket | null => {
    const l = hostAt(pointer);
    if (!l || (p.kind === "kangaroo" && l.h.id !== kangaroo?.id)) return null;
    const next = { ...p, host: l.h.id, ...shareOf(l.h, sub(topCentre, l.off)) };
    return placed(l.h, next).fits ? next : null;
  };
  const put = (p: Pocket) => setPockets((all) => (all.some((x) => x.id === p.id) ? all.map((x) => (x.id === p.id ? p : x)) : [...all, p]));

  // Moving a pocket already placed.
  const startMove = (e: ReactPointerEvent, p: Pocket, topCentre: Pt) => {
    const at = toSheet(e);
    if (!at) return;
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    setSelected(p.id);
    setDrag({ id: p.id, grab: sub(at, topCentre) });
  };
  // Resizing from a corner, like a photo: `corner` is [−1 left / 1 right, 0 top / 1 bottom].
  const startResize = (e: ReactPointerEvent, p: Pocket, corner: Pt) => {
    const host = hosts.find((h) => h.id === p.host);
    if (!host) return;
    e.stopPropagation();
    (e.currentTarget as SVGElement).ownerSVGElement?.setPointerCapture(e.pointerId);
    const [ax, ay] = pocketAnchor(host, p);
    const fixed: Pt = p.kind === "kangaroo" ? [0, ay] : [ax - (corner[0] * p.width) / 2, corner[1] ? ay : ay + p.height];
    setDrag({ id: p.id, corner, fixed });
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const at = toSheet(e), p = pockets.find((x) => x.id === drag.id);
    if (!at || !p) return;
    if ("grab" in drag) {
      const next = moved(p, at, sub(at, drag.grab));
      if (next) put(next);
      return;
    }
    const l = laid.find((x) => x.h.id === p.host);
    if (!l) return;
    const [x, y] = sub(at, l.off), [fx, fy] = drag.fixed;
    let next: Pocket;
    if (p.kind === "kangaroo") {
      next = { ...p, width: clampSize(2 * Math.abs(x)), height: clampSize(y - fy) };
      next = { ...next, ...shareOf(l.h, [0, fy]) };
    } else {
      const w = clampSize(Math.abs(x - fx)), h = clampSize(Math.abs(y - fy));
      const x0 = x >= fx ? fx : fx - w, y0 = y >= fy ? fy : fy - h;
      next = { ...p, width: w, height: h, ...shareOf(l.h, [x0 + w / 2, y0]) };
    }
    if (placed(l.h, next).fits) put(next);
  };

  // A pocket dragged in from the buttons: it lands once it is over a panel and fits there.
  const paletteDown = (e: ReactPointerEvent<HTMLButtonElement>, kind: PocketKind) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIncoming({ kind, x: e.clientX, y: e.clientY, moved: false, id: nextId() });
  };
  const paletteMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!incoming) return;
    const far = incoming.moved || Math.hypot(e.clientX - incoming.x, e.clientY - incoming.y) > 6;
    const at = toSheet(e);
    if (!far || !at) return;
    const proto = pockets.find((x) => x.id === incoming.id) ?? defaultPocket(base, incoming.kind, incoming.id);
    const next = proto && moved(proto, at, [at[0], at[1] - proto.height / 2]);
    if (next) {
      put(next);
      setSelected(next.id);
    }
    setIncoming({ ...incoming, moved: true, at });
  };
  const paletteUp = () => {
    if (incoming && !incoming.moved) {
      const p = defaultPocket(base, incoming.kind, incoming.id);
      if (p) {
        put(p);
        setSelected(p.id);
      }
    }
    setIncoming(null);
  };

  const sel = pockets.find((p) => p.id === selected);
  const selHost = sel && hosts.find((h) => h.id === sel.host);
  const resize = (key: "width" | "height", v: string) => {
    const n = Number(v);
    if (sel && Number.isFinite(n) && n > 0) put({ ...sel, [key]: clampSize(n) });
  };
  // A pocket on its way in, not over a panel yet: drawn under the pointer.
  const ghost = incoming?.moved && incoming.at && !pockets.some((p) => p.id === incoming.id) ? incoming : null;
  const ghostSize = ghost ? defaultPocket(base, ghost.kind, "g") : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onPointerDown={(e) => paletteDown(e, k)}
            onPointerMove={paletteMove}
            onPointerUp={paletteUp}
            onPointerCancel={() => setIncoming(null)}
            style={{ touchAction: "none" }}
            className={`${buttonGhost} cursor-grab select-none active:cursor-grabbing`}
          >
            <svg width="16" height="16" viewBox="-9 -1 18 18" aria-hidden>
              <path d={svgPath(k === "kangaroo" ? [...pocketShape(k, 16, 14), ...pocketShape(k, 16, 14).map(([x, y]): Pt => [-x, y]).reverse()] : pocketShape(k, 14, 15), true)} fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {POCKET_NAME[k][lang]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{T.hint[lang]}</p>

      <svg
        ref={svg}
        viewBox={`-2 -1 ${W + 4} ${H + 3}`}
        className="h-auto max-h-[420px] w-full select-none rounded-xl bg-field"
        style={{ touchAction: drag ? "none" : "pan-y" }}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onPointerDown={() => setSelected(null)}
        role="img"
        aria-label={T.drawing[lang]}
      >
        {laid.map((l) => (
          <g key={l.h.id} transform={`translate(${l.off[0].toFixed(2)} ${l.off[1].toFixed(2)})`}>
            <path d={svgPath(l.line, true)} fill="rgba(6,43,138,0.05)" stroke="var(--ink)" strokeWidth={0.3} />
            {l.h.edges
              .filter((e) => e.kind === "fold")
              .map((e, i) => (
                <path key={i} d={svgPath(e.pts)} fill="none" stroke="var(--chalk)" strokeWidth={0.3} strokeDasharray="1.2 0.4 0.2 0.4" />
              ))}
            <text x={((l.b.minX + l.b.maxX) / 2).toFixed(2)} y={(l.b.minY - 1.2).toFixed(2)} fontSize={2.2} textAnchor="middle" fill="var(--muted)">
              {l.h.names[lang]}
            </text>
          </g>
        ))}
        {pockets.map((p, i) => {
          const l = laid.find((x) => x.h.id === p.host);
          if (!l) return null;
          const { outline, fits } = placed(l.h, p);
          const pts = outline.map((q) => add(q, l.off));
          const topCentre: Pt = p.kind === "kangaroo" ? pts[0] : [(pts[0][0] + pts[1][0]) / 2, pts[0][1]];
          const on = p.id === selected;
          const c = bounds(pts);
          return (
            <g key={p.id} onPointerDown={(e) => startMove(e, p, topCentre)} style={{ cursor: drag?.id === p.id ? "grabbing" : "grab", touchAction: "none" }}>
              <path
                d={svgPath(pts, p.kind !== "kangaroo")}
                fill={fits ? (on ? "rgba(6,43,138,0.22)" : "rgba(6,43,138,0.12)") : "rgba(200,40,40,0.15)"}
                stroke={fits ? "var(--ink)" : "var(--mark)"}
                strokeWidth={on ? 0.45 : 0.3}
                strokeDasharray="0.9 0.5"
              />
              <text x={((c.minX + c.maxX) / 2).toFixed(2)} y={((c.minY + c.maxY) / 2 + 0.8).toFixed(2)} fontSize={2.4} textAnchor="middle" fill={fits ? "var(--ink)" : "var(--mark)"} fontWeight={600} pointerEvents="none">
                {i + 1}
              </text>
              {on &&
                (p.kind === "kangaroo" ? ([[1, 1]] as Pt[]) : ([[-1, 0], [1, 0], [1, 1], [-1, 1]] as Pt[])).map((k) => {
                  const at: Pt = p.kind === "kangaroo" ? [c.maxX, c.maxY] : [k[0] < 0 ? c.minX : c.maxX, k[1] ? c.maxY : c.minY];
                  return (
                    <g key={k.join()} onPointerDown={(e) => startResize(e, p, k)} style={{ cursor: k[0] * (k[1] ? 1 : -1) > 0 ? "nwse-resize" : "nesw-resize" }}>
                      <rect x={(at[0] - 2).toFixed(2)} y={(at[1] - 2).toFixed(2)} width={4} height={4} fill="transparent" />
                      <rect x={(at[0] - 0.9).toFixed(2)} y={(at[1] - 0.9).toFixed(2)} width={1.8} height={1.8} fill="var(--field)" stroke="var(--ink)" strokeWidth={0.3} />
                    </g>
                  );
                })}
            </g>
          );
        })}
        {ghost && ghostSize && ghost.at && (
          <path d={svgPath(pocketShape(ghost.kind, ghostSize.width, ghostSize.height).map(([x, y]): Pt => [x + ghost.at![0], y + ghost.at![1] - ghostSize.height / 2]), ghost.kind !== "kangaroo")} fill="rgba(6,43,138,0.08)" stroke="var(--muted)" strokeWidth={0.3} strokeDasharray="0.9 0.5" pointerEvents="none" />
        )}
      </svg>

      {sel && selHost && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-well p-3 text-sm">
          <span className="font-medium">
            {pockets.indexOf(sel) + 1}. {POCKET_NAME[sel.kind][lang]} · {selHost.names[lang]}
          </span>
          {(["width", "height"] as const).map((k) => (
            <label key={k} className="flex items-center gap-1">
              <span className="text-muted">{T[k][lang]}</span>
              <input
                key={`${sel.id}-${k}-${sel[k]}`}
                inputMode="decimal"
                defaultValue={sel[k]}
                onBlur={(e) => resize(k, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && resize(k, (e.target as HTMLInputElement).value)}
                className="num w-14 rounded-lg border border-line bg-field px-2 py-1 text-right"
              />
              <span className="text-xs text-muted">cm</span>
            </label>
          ))}
          <button
            type="button"
            className="ml-auto text-muted underline"
            onClick={() => {
              setPockets((all) => all.filter((x) => x.id !== sel.id));
              setSelected(null);
            }}
          >
            {T.remove[lang]}
          </button>
          {!placed(selHost, sel).fits && <p className="w-full text-mark">{T.outside[lang]}</p>}
        </div>
      )}
    </div>
  );
}
