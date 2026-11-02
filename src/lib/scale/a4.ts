// Centimetre scale from an A4 sheet lying on the floor beside the garment. Every cm in the app
// starts here, so anything doubtful is refused with a reason instead of measured:
//   - the sheet touches the photo edge (a cut-off sheet still looks like a smaller rectangle,
//     which makes every cm too big)
//   - something covers part of it, or a corner is missing (the mask doesn't fill its quad)
//   - it doesn't look like A4 (1.414 : 1), within tolerance for a slightly tilted phone
// Corners come from straight lines fitted to the middle of each side, not the extreme hull points,
// which sit inside the true corners when they are rounded or soft. Ported from Seated Tailor's
// reference fit (measure.ts), with the hand and card cases removed.

import { area, gridBox, largestComponent, traceOuter, type Box, type Grid } from "../geom/grid.ts";
import { applyH, homography, planeDistance, type Mat3 } from "../geom/homography.ts";
import { dist, type Pt } from "../geom/point.ts";
import { convexHull, polygonArea, quadCorners } from "../geom/polygon.ts";
import { L as Loc, type Local } from "../i18n/lang.ts";

export const A4_CM = [21, 29.7] as const;
const A4_ASPECT = 29.7 / 21;

// With corners refined, a clean sheet fills its quad to within a few %.
const MIN_FILL = 0.94;
// A phone tilted 15° off level changes the seen aspect by about 3%.
const ASPECT_TOLERANCE = 0.06;
const EDGE_PX = 3;
// Without a homography the scale ignores the sheet's tilt.
const NO_PERSPECTIVE_REL = 0.06;
// A homography from one sheet is extrapolated only this far (in sheet diagonals from its centre);
// beyond that the plain scale is used, with this much extra error per diagonal of distance.
// [A] Seated Tailor's guard, kept as is. The floor is one plane, so the first real photo checked
// against a tape measure should tell whether the homography can reach further.
export const HOMOGRAPHY_REACH = 1.5;
const FAR_REL_PER_DIAG = 0.02;

export type ScaleFailureReason = "no-paper" | "paper-edge" | "paper-corners" | "paper-covered" | "paper-aspect";

export interface ScaleFailure {
  ok: false;
  reason: ScaleFailureReason;
  detail: Local;
}

export interface A4Scale {
  ok: true;
  cornersPx: [Pt, Pt, Pt, Pt]; // top-left, top-right, bottom-right, bottom-left on screen
  h?: Mat3; // photo px → cm on the floor plane, sheet's top-left corner at the origin
  pxPerCm: number; // plain scale from the perimeter
  relError: number; // relative scale uncertainty, 0.02 = ±2%
  aspect: number; // long over short, as seen
  fill: number; // mask area / quad area
  box: Box;
  center: Pt;
  diag: number; // px
}

export type ScaleResult = A4Scale | ScaleFailure;

export function a4Scale(paperMask: Grid): ScaleResult {
  const shape = largestComponent(paperMask);
  const contour = traceOuter(shape);
  const box = gridBox(shape);
  if (contour.length < 20 || !box) return { ok: false, reason: "no-paper", detail: Loc("사진에서 A4 용지를 찾지 못했습니다.", "No A4 sheet found in the photo.", "No encontramos la hoja A4 en la foto.") };
  if (box[0] <= EDGE_PX || box[1] <= EDGE_PX || box[2] >= paperMask.width - EDGE_PX || box[3] >= paperMask.height - EDGE_PX) {
    return { ok: false, reason: "paper-edge", detail: Loc("A4 용지가 사진 가장자리에 걸렸습니다. 네 모서리가 모두 보이게 다시 찍어 주십시오.", "The A4 sheet touches the edge of the photo. Take it again with all four corners in view.", "La hoja A4 toca el borde de la foto. Vuelve a hacerla con las cuatro esquinas a la vista.") };
  }
  const rough = quadCorners(convexHull(contour));
  if (!rough) return { ok: false, reason: "paper-corners", detail: Loc("A4 용지의 네 모서리를 찾지 못했습니다.", "Couldn't find the four corners of the A4 sheet.", "No encontramos las cuatro esquinas de la hoja A4.") };
  const corners = refineCorners(contour, rough) ?? rough;

  // Below 1: something covers part of it. Above 1: a corner is missing, so the corners found aren't its.
  const fill = area(shape) / polygonArea(corners);
  if (!(Math.abs(1 - fill) <= 1 - MIN_FILL)) {
    return { ok: false, reason: "paper-covered", detail: Loc(`A4 용지가 가려졌거나 접혀 있습니다(윤곽의 ${(fill * 100).toFixed(0)}%만 보임). 용지 위를 비워 주십시오.`, `The A4 sheet is covered or folded (only ${(fill * 100).toFixed(0)}% of it shows). Clear anything off it.`, `La hoja A4 está tapada o doblada (solo se ve el ${(fill * 100).toFixed(0)}%). Quita lo que tenga encima.`) };
  }
  const [tl, tr, br, bl] = corners;
  const across = dist(tl, tr) + dist(br, bl), down = dist(tr, br) + dist(bl, tl);
  const aspect = Math.max(across, down) / Math.min(across, down);
  if (Math.abs(aspect / A4_ASPECT - 1) > ASPECT_TOLERANCE) {
    return { ok: false, reason: "paper-aspect", detail: Loc(`용지 비율이 ${aspect.toFixed(2)} : 1로 A4(1.41 : 1)가 아닙니다. A4가 아니거나 사진이 기울었습니다.`, `The sheet is ${aspect.toFixed(2)} : 1, not A4 (1.41 : 1). It isn't A4, or the photo is tilted.`, `La hoja mide ${aspect.toFixed(2)} : 1, no es A4 (1.41 : 1). No es A4 o la foto está inclinada.`) };
  }

  // The longer pair of opposite sides is the long edge.
  const [S, L] = [A4_CM[0], A4_CM[1]];
  const [w, h] = across >= down ? [L, S] : [S, L];
  const H = homography(corners, [[0, 0], [w, 0], [w, h], [0, h]]);
  const fitRel = Math.max(0.01, Math.abs(1 - fill));
  return {
    ok: true,
    cornersPx: corners,
    h: H ?? undefined,
    pxPerCm: (across + down) / (2 * (L + S)),
    relError: H ? fitRel : Math.max(NO_PERSPECTIVE_REL, fitRel),
    aspect,
    fill,
    box,
    center: [corners.reduce((x, c) => x + c[0], 0) / 4, corners.reduce((y, c) => y + c[1], 0) / 4],
    diag: (dist(tl, br) + dist(tr, bl)) / 2,
  };
}

export interface Length {
  cm: number;
  rel: number; // relative uncertainty of the scale for this segment
  perspective: boolean; // measured through the homography
}

// Real length of a segment between two photo points on the floor plane.
export function lengthCm(s: A4Scale, a: Pt, b: Pt): Length {
  const reach = Math.max(dist(a, s.center), dist(b, s.center)) / s.diag;
  if (s.h && reach <= HOMOGRAPHY_REACH) return { cm: planeDistance(s.h, a, b), rel: s.relError, perspective: true };
  const far = Math.min(0.15, FAR_REL_PER_DIAG * Math.max(0, reach - 1));
  return { cm: dist(a, b) / s.pxPerCm, rel: Math.hypot(s.relError, far, s.h ? 0 : NO_PERSPECTIVE_REL), perspective: false };
}

// The garment outline onto the floor plane, in cm. A flat-lay keeps the garment and the sheet on
// one plane, so the homography holds across the garment; what grows with distance is the effect
// of small corner errors, added to the ± per sheet diagonal of reach. As a guard against a
// homography from bad corners, the garment's size through it and through the plain scale must
// agree within PLANE_AGREEMENT, or the photo is refused as too tilted to trust.
const PLANE_AGREEMENT = 0.1;

export interface Plane {
  toCm: (p: Pt) => Pt;
  toPx: (p: Pt) => Pt;
  rel: number; // relative uncertainty for lengths on this garment
  perspective: boolean;
}

export function garmentPlane(s: A4Scale, pointsPx: readonly Pt[]): Plane | ScaleFailure {
  const plain = (p: Pt): Pt => [p[0] / s.pxPerCm, p[1] / s.pxPerCm];
  const plainPx = (p: Pt): Pt => [p[0] * s.pxPerCm, p[1] * s.pxPerCm];
  const reach = Math.max(...pointsPx.map((p) => dist(p, s.center))) / s.diag;
  const far = Math.min(0.15, FAR_REL_PER_DIAG * Math.max(0, reach - 1));
  if (!s.h) return { toCm: plain, toPx: plainPx, rel: Math.hypot(s.relError, far, NO_PERSPECTIVE_REL), perspective: false };
  const h = s.h;
  const inv = homography(s.cornersPx.map((c) => applyH(h, c)), s.cornersPx);
  const toCm = (p: Pt): Pt => applyH(h, p);
  const toPx = (p: Pt): Pt => (inv ? applyH(inv, p) : plainPx(p));
  // Compare the garment's extent both ways along its widest pair of points.
  const span = (f: (p: Pt) => Pt) => {
    const q = pointsPx.map(f);
    const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
    return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  };
  const a = span(toCm), b = span(plain);
  if (Math.abs(a / b - 1) > PLANE_AGREEMENT) {
    return { ok: false, reason: "paper-aspect", detail: Loc(`사진이 너무 기울어 잴 수 없습니다(원근 ${(100 * Math.abs(a / b - 1)).toFixed(0)}%). 바로 위에서 찍어 주십시오.`, `The photo is too tilted to measure (${(100 * Math.abs(a / b - 1)).toFixed(0)}% perspective). Shoot from directly above.`, `La foto está demasiado inclinada para medir (perspectiva del ${(100 * Math.abs(a / b - 1)).toFixed(0)}%). Hazla desde justo encima.`) };
  }
  return { toCm, toPx, rel: Math.hypot(s.relError, far), perspective: true };
}

export type Confidence = "high" | "med" | "low";
export const confidenceOf = (rel: number): Confidence => (rel <= 0.06 ? "high" : rel <= 0.12 ? "med" : "low");

// Fit a straight line to each side's middle stretch of outline and intersect neighbouring lines.
function refineCorners(contour: readonly Pt[], q: readonly [Pt, Pt, Pt, Pt]): [Pt, Pt, Pt, Pt] | undefined {
  const lines: { c: Pt; d: Pt }[] = [];
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const len = dist(a, b);
    if (len < 8) return undefined;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    // Outline points near this side, away from both corners.
    const pts = contour.filter(([x, y]) => {
      const t = (x - a[0]) * ux + (y - a[1]) * uy;
      const off = Math.abs(-(x - a[0]) * uy + (y - a[1]) * ux);
      return t > 0.15 * len && t < 0.85 * len && off < 0.05 * len + 2;
    });
    if (pts.length < 5) return undefined;
    // Total least squares: the line through the centroid along the main direction.
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) {
      sxx += (x - cx) ** 2;
      syy += (y - cy) ** 2;
      sxy += (x - cx) * (y - cy);
    }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    lines.push({ c: [cx, cy], d: [Math.cos(th), Math.sin(th)] });
  }
  const out: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    // Corner i joins side i-1 (ending at it) and side i (starting at it).
    const p = lines[(i + 3) % 4], r = lines[i];
    const det = p.d[0] * r.d[1] - p.d[1] * r.d[0];
    if (Math.abs(det) < 1e-6) return undefined;
    const t = ((r.c[0] - p.c[0]) * r.d[1] - (r.c[1] - p.c[1]) * r.d[0]) / det;
    out.push([p.c[0] + t * p.d[0], p.c[1] + t * p.d[1]]);
  }
  // A refined corner far from the rough one means a bad fit; keep the rough corners then.
  const far = out.some((c, i) => dist(c, q[i]) > 0.1 * dist(q[2], q[0]));
  return far ? undefined : (out as [Pt, Pt, Pt, Pt]);
}
