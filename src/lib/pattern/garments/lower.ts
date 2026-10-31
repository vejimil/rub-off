// Elastic-waist pants, a gathered elastic skirt and a tote bag, drafted from flat measurements.
// Origin at the centre front (or centre back) waist, x toward the side seam, y down, cm.

import type { Pt } from "../../geom/point.ts";
import { dist } from "../../geom/point.ts";
import { casingAllowance } from "../../rules/seam-rules.ts";
import { line, quad } from "../curves.ts";
import type { BagMeasures, PantsMeasures, SkirtMeasures } from "../measures.ts";
import type { Piece } from "../types.ts";

export const ELASTIC_CM = 3; // [A] default elastic width; the user can change it

// Crotch extensions as shares of the flat hip (half the hip circumference). Pull-on pants:
// front about a sixteenth of the hip circumference, back about a tenth. [A] Owner to confirm.
const FRONT_EXT = 2 / 16;
const BACK_EXT = 2 / 10;

export function draftPants(m: PantsMeasures, unmeasured: string[], elastic = ELASTIC_CM): { pieces: Piece[]; notes: string[] } {
  const notes: string[] = [];
  const quarter = m.hip / 2; // a quarter of the hip circumference
  const frontHip = quarter - 1, backHip = quarter + 1;
  const frontHem = m.legOpening - 1, backHem = m.legOpening + 1; // the leg opening is half its circumference
  const casing = casingAllowance(elastic);

  const half = (id: "front" | "back"): { piece: Piece; inseam: number } => {
    const front = id === "front";
    const hipW = front ? frontHip : backHip;
    const ext = m.hip * (front ? FRONT_EXT : BACK_EXT);
    const top = front ? 0 : -m.backRiseExtra; // the centre back rises above the centre front
    const crotchY = m.frontRise;
    // Crease line halfway across the leg at crotch level; the hem is centred on it.
    const crease = (hipW - ext) / 2;
    const hemW = front ? frontHem : backHem;
    const hemOut: Pt = [crease + hemW / 2, m.outseam], hemIn: Pt = [crease - hemW / 2, m.outseam];
    const crotch: Pt = [-ext, crotchY];
    // Pull-on: the waist is as wide as the hip so it passes over it; the elastic gathers it in.
    const waistC: Pt = [0, top], waistS: Pt = [hipW, 0];
    const curveTop: Pt = [0, top + 0.6 * (crotchY - top)];
    const crotchCurve = quad(crotch, [0, crotchY], curveTop);
    return {
      inseam: dist(crotch, hemIn),
      piece: {
        id,
        name: front ? "Front leg" : "Back leg",
        nameKo: front ? "앞판" : "뒤판",
        cut: { count: 2, onFold: false, mirror: true },
        edges: [
          { kind: "casing", pts: line(waistC, waistS), allowanceCm: casing },
          { kind: "side", pts: [waistS, [hipW, crotchY], hemOut] },
          { kind: "hem", pts: line(hemOut, hemIn) },
          { kind: "inseam", pts: line(hemIn, crotch) },
          { kind: "crotch", pts: [...crotchCurve, waistC] },
        ],
        grain: [[crease, 0.15 * m.outseam], [crease, 0.85 * m.outseam]], // most of the leg's length, on the crease
        notches: [{ at: [hipW, crotchY], count: front ? 1 : 2 }],
        marks: [{ kind: "lengthen", a: [crease - hemW / 2, (crotchY + m.outseam) / 2], b: [crease + hemW / 2, (crotchY + m.outseam) / 2] }],
        unmeasured,
      },
    };
  };
  const front = half("front"), back = half("back");
  const diff = back.inseam - front.inseam;
  if (Math.abs(diff) > 0.5) notes.push(`Back inseam is ${diff.toFixed(1)} cm longer than the front; ease it in above the knee or shorten the back crotch point.`);
  notes.push(`Waist casing for ${elastic} cm elastic (${casing.toFixed(1)} cm allowance): turn under 1 cm, then fold ${(casing - 1).toFixed(1)} cm. Cut the elastic to your waist minus about 10%.`);
  if (m.thigh > 0) {
    // Around the leg at crotch level: both pieces from the crotch point to the side seam.
    const legW = frontHip + backHip + m.hip * (FRONT_EXT + BACK_EXT);
    if (legW < 2 * m.thigh) notes.push(`Thigh on the pattern may be narrower than the original (${m.thigh.toFixed(1)} cm flat). Check before cutting.`);
  }
  return { pieces: [front.piece, back.piece], notes };
}

export function draftSkirt(m: SkirtMeasures, elastic = ELASTIC_CM): { pieces: Piece[]; notes: string[] } {
  const w = m.hem / 2; // half a panel, cut on the fold
  const casing = casingAllowance(elastic);
  const piece: Piece = {
    id: "panel",
    name: "Front & back",
    nameKo: "앞·뒤판",
    cut: { count: 2, onFold: true, mirror: false },
    edges: [
      { kind: "casing", pts: line([0, 0], [w, 0]), allowanceCm: casing },
      { kind: "side", pts: line([w, 0], [w, m.length]) },
      { kind: "hem", pts: line([w, m.length], [0, m.length]) },
      { kind: "fold", pts: line([0, m.length], [0, 0]) },
    ],
    grain: [[w / 2, 0.2 * m.length], [w / 2, 0.8 * m.length]],
    notches: [{ at: [w, 0.3 * m.length], count: 1 }],
    marks: [{ kind: "lengthen", a: [0.1 * w, 0.6 * m.length], b: [0.9 * w, 0.6 * m.length] }],
  };
  return {
    pieces: [piece],
    notes: [
      `Gathered skirt: the waist is as wide as the hem and the ${elastic} cm elastic gathers it; the panels must pass over your hips.`,
      `Waist casing (${casing.toFixed(1)} cm allowance): turn under 1 cm, then fold ${(casing - 1).toFixed(1)} cm.`,
    ],
  };
}

const HANDLE_INTO_TOP = 3; // each handle end tucked under the top hem

export function draftBag(m: BagMeasures): { pieces: Piece[]; notes: string[] } {
  const w = m.width + m.gusset, h = m.height + m.gusset / 2;
  const body: Piece = {
    id: "body",
    name: "Body",
    nameKo: "몸판",
    // One piece, folded at the bottom: front and back in one.
    cut: { count: 1, onFold: true, mirror: false },
    edges: [
      { kind: "bag-top", pts: line([0, 0], [w, 0]) },
      { kind: "side", pts: line([w, 0], [w, h]) },
      { kind: "fold", pts: line([w, h], [0, h]) },
      { kind: "side", pts: line([0, h], [0, 0]) },
    ],
    grain: [[w / 2, 0.2 * h], [w / 2, 0.8 * h]],
    notches: [
      { at: [w / 4, 0], count: 1 },
      { at: [(3 * w) / 4, 0], count: 1 },
    ],
  };
  const len = m.handleLength + 2 * HANDLE_INTO_TOP, wid = 4 * m.handleWidth; // pressed in quarters
  const handle: Piece = {
    id: "handle",
    name: "Handle",
    nameKo: "손잡이",
    cut: { count: 2, onFold: false, mirror: false },
    edges: [
      { kind: "seam", pts: line([0, 0], [wid, 0]), allowanceCm: 0 },
      { kind: "seam", pts: line([wid, 0], [wid, len]), allowanceCm: 0 },
      { kind: "seam", pts: line([wid, len], [0, len]), allowanceCm: 0 },
      { kind: "seam", pts: line([0, len], [0, 0]), allowanceCm: 0 },
    ],
    grain: [[wid / 2, 0.2 * len], [wid / 2, 0.8 * len]],
    notches: [],
  };
  const notes = [
    "Handles: allowances included. Press both long edges to the centre, fold again, topstitch.",
    `Handle ends go ${HANDLE_INTO_TOP} cm under the top hem, at the notches.`,
  ];
  if (m.gusset > 0) notes.push(`Box the bottom corners: after sewing the sides, stitch across each corner ${m.gusset.toFixed(1)} cm wide.`);
  return { pieces: [body, handle], notes };
}
