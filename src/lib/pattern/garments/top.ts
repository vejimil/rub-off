// Shirt and T-shirt with set-in sleeves, drafted from flat measurements. Origin at the high point of
// the shoulder on the centre line, x toward the side seam, y down, cm. Front and back are half
// pieces: the T-shirt is cut on the fold at centre front and back; the shirt front is cut twice
// with a button stand and facing past the centre front.
// The sleeve cap is solved so its seam length equals the armhole's plus ease, which is what makes
// a set-in sleeve go in without puckers.

import { mirrorX, type Pt } from "../../geom/point.ts";
import { cubic, line, polylineLength, quad, solveIncreasing } from "../curves.ts";
import type { TopMeasures } from "../measures.ts";
import type { Edge, Fabric, Piece } from "../types.ts";
import { pointAlong } from "../../geom/point.ts";

const CAP_EASE: Record<Fabric, number> = { woven: 1.5, knit: 0 };
const BUTTON_STAND = 1.5; // past the centre front
const FACING = 3; // folded back inside the stand
const COLLAR_HEIGHT = 4; // finished
const CUFF_HEIGHT = 6; // finished
const CUFF_OVERLAP = 2;

interface Body {
  edges: Edge[];
  armhole: Pt[];
  neck: Pt[];
}

function body(m: TopMeasures, neckDrop: number, hemDepth: number): Body {
  const snp: Pt = [m.neckWidth / 2, 0];
  const cfNeck: Pt = [0, neckDrop];
  const sp: Pt = [m.shoulder / 2, m.shoulderDrop];
  const pit: Pt = [m.chest / 2, m.armholeDepth];
  const hemSide: Pt = [m.hem / 2, hemDepth];
  const cfHem: Pt = [0, hemDepth];
  // Neck meets the centre line square and leaves the shoulder square.
  const neck = quad(cfNeck, [snp[0], cfNeck[1]], snp, 40);
  // Armhole leaves the shoulder heading down and meets the side seam square.
  const armhole = cubic(sp, [sp[0], sp[1] + 0.5 * (pit[1] - sp[1])], [sp[0] + 0.2 * (pit[0] - sp[0]), pit[1]], pit, 40);
  return {
    neck,
    armhole,
    edges: [
      { kind: "neck", pts: neck },
      { kind: "shoulder", pts: line(snp, sp) },
      { kind: "armhole", pts: armhole },
      { kind: "side", pts: line(pit, hemSide) },
      { kind: "hem", pts: line(hemSide, cfHem) },
      { kind: "fold", pts: line(cfHem, cfNeck) },
    ],
  };
}

// Half sleeve cap from the underarm (−b, h) to the top (0, 0): leaves the underarm level and
// arrives at the top level, an S-curve.
const halfCap = (b: number, h: number): Pt[] => cubic([-b, h], [-0.55 * b, h], [-0.45 * b, 0], [0, 0]);

export function draftTop(kind: "shirt" | "t-shirt", m: TopMeasures, fabric: Fabric, unmeasured: string[]): { pieces: Piece[]; notes: string[] } {
  const notes: string[] = [];
  const shirt = kind === "shirt";
  const front = body(m, m.frontNeckDrop, m.length);
  const back = body(m, m.backNeckDrop, m.length);
  const armholeTotal = polylineLength(front.armhole) + polylineLength(back.armhole);

  // Sleeve: cap height so that the cap seam = armholes + ease.
  const b = m.bicep; // half of the full sleeve width = the flat bicep
  const sleeveLength = shirt ? m.sleeve - CUFF_HEIGHT : m.sleeve;
  const target = armholeTotal + CAP_EASE[fabric];
  const capLen = (h: number) => 2 * polylineLength(halfCap(b, h));
  let capH = solveIncreasing(capLen, target, 0.5, Math.max(1, sleeveLength - 2));
  if (capH === null) {
    capH = Math.min(0.6 * m.armholeDepth, sleeveLength - 2);
    notes.push(`Sleeve cap could not match the armhole (${armholeTotal.toFixed(1)} cm); cap height set to ${capH.toFixed(1)} cm. Check before cutting.`);
  }
  const left = halfCap(b, capH);
  const right = mirrorX(left).reverse();
  const opening = shirt ? m.sleeveOpening + 1.5 : m.sleeveOpening; // a shirt cuff gathers or pleats the sleeve end
  const sleeveHemR: Pt = [opening, sleeveLength], sleeveHemL: Pt = [-opening, sleeveLength];
  const sleeve: Piece = {
    id: "sleeve",
    name: "Sleeve",
    nameKo: "소매",
    cut: { count: 2, onFold: false, mirror: true },
    edges: [
      { kind: "sleeve-cap", pts: left },
      { kind: "sleeve-cap", pts: right },
      { kind: "underarm", pts: line([b, capH], sleeveHemR) },
      { kind: shirt ? "seam" : "sleeve-hem", pts: line(sleeveHemR, sleeveHemL) },
      { kind: "underarm", pts: line(sleeveHemL, [-b, capH]) },
    ],
    grain: [[0, 0.25 * sleeveLength], [0, 0.85 * sleeveLength]],
    // Top of the cap meets the shoulder seam; one notch on the front half, two on the back half.
    notches: [
      { at: [0, 0], count: 1 },
      { at: pointAlong(left, 0.45 * polylineLength(left)), count: 1 },
      { at: pointAlong(right, 0.55 * polylineLength(right)), count: 2 },
    ],
    marks: [{ kind: "lengthen", a: [-0.9 * b, capH + 0.5 * (sleeveLength - capH)], b: [0.9 * b, capH + 0.5 * (sleeveLength - capH)] }],
  };

  const notchOn = (pts: Pt[], t: number) => pointAlong(pts, t * polylineLength(pts));
  const bodyPiece = (id: "front" | "back", bd: Body, count: 1 | 2): Piece => ({
    id,
    name: id === "front" ? "Front" : "Back",
    nameKo: id === "front" ? "앞판" : "뒤판",
    cut: { count: 1, onFold: true, mirror: false },
    edges: bd.edges,
    grain: [[0.5 * (m.chest / 2), 0.3 * m.length], [0.5 * (m.chest / 2), 0.8 * m.length]],
    notches: [{ at: notchOn(bd.armhole, 0.55), count }],
    marks: [{ kind: "lengthen", a: [0.05 * m.chest, (m.armholeDepth + m.length) / 2], b: [0.45 * m.chest, (m.armholeDepth + m.length) / 2] }],
    unmeasured,
  });

  const frontPiece = bodyPiece("front", front, 1);
  if (shirt) {
    // The centre front is no longer a fold: a button stand and a facing fold back from it.
    frontPiece.cut = { count: 2, onFold: false, mirror: true };
    frontPiece.edges = frontPiece.edges.map((e) => (e.kind === "fold" ? { kind: "seam", pts: e.pts, allowanceCm: BUTTON_STAND + FACING } : e));
    frontPiece.marks = [...(frontPiece.marks ?? []), { kind: "placement", a: [0, m.frontNeckDrop], b: [0, m.length] }];
    notes.push(`Shirt front: ${BUTTON_STAND} cm button stand and ${FACING} cm facing are added past the centre front line.`);
  }
  const pieces: Piece[] = [frontPiece, bodyPiece("back", back, 2), sleeve];

  if (shirt) {
    const neckline = 2 * (polylineLength(front.neck) + polylineLength(back.neck));
    const collarLen = neckline + 2 * BUTTON_STAND;
    pieces.push(rect("collar", "Collar", "칼라", collarLen, 2 * COLLAR_HEIGHT, { count: 1, onFold: false, mirror: false }));
    const cuffLen = 2 * m.sleeveOpening + CUFF_OVERLAP;
    pieces.push(rect("cuff", "Cuff", "커프스", cuffLen, 2 * CUFF_HEIGHT, { count: 2, onFold: false, mirror: false }));
    notes.push(`Collar length ${collarLen.toFixed(1)} cm from the drafted neckline; cuff ${cuffLen.toFixed(1)} cm. Both fold lengthwise.`);
  }
  if (fabric === "knit") notes.push("Knit: a flat-laid knit may be stretched or relaxed; every width carries extra ±.");
  return { pieces, notes };
}

// A rectangle seamed on all sides (collar, cuff, waistband).
export function rect(id: string, name: string, nameKo: string, w: number, h: number, cut: Piece["cut"]): Piece {
  return {
    id,
    name,
    nameKo,
    cut,
    edges: [
      { kind: "seam", pts: line([0, 0], [w, 0]) },
      { kind: "seam", pts: line([w, 0], [w, h]) },
      { kind: "seam", pts: line([w, h], [0, h]) },
      { kind: "seam", pts: line([0, h], [0, 0]) },
    ],
    grain: [[0.2 * w, h / 2], [0.8 * w, h / 2]],
    notches: [{ at: [w / 2, 0], count: 1 }],
  };
}
