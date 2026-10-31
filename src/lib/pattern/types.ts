// A pattern piece: the finished seam line as a closed chain of labelled edges, in cm, y down,
// clockwise on screen. Seam allowance is added per edge from the rule table (seam-rules.ts), so a
// piece never stores a cutting line of its own.

import type { Pt } from "../geom/point.ts";

export type EdgeKind =
  | "side" // side seam
  | "shoulder"
  | "armhole"
  | "sleeve-cap"
  | "underarm" // sleeve seam
  | "hem"
  | "sleeve-hem"
  | "neck"
  | "waist"
  | "casing" // fold-over channel for elastic
  | "bag-top" // bag opening, turned twice
  | "inseam"
  | "crotch"
  | "seam" // any other plain seam
  | "fold"; // cut on the fold: no allowance

export interface Edge {
  kind: EdgeKind;
  pts: Pt[]; // from this edge's start to its end; the next edge starts at this edge's last point
  allowanceCm?: number; // overrides the rule table (an elastic casing depends on the elastic)
}

export interface Notch {
  at: Pt; // on the seam line
  count: 1 | 2; // one for front, two for back, as industry patterns do
}

export interface Piece {
  id: string;
  name: string; // printed on the pattern (ASCII: the PDF uses a standard font)
  nameKo: string;
  cut: { count: number; onFold: boolean; mirror: boolean }; // "Cut 2, mirror", "Cut 1 on fold"
  edges: Edge[];
  grain: [Pt, Pt]; // grainline arrow, parallel to the selvage
  notches: Notch[];
  // Lines inside the piece: placement marks, "lengthen or shorten here" double lines.
  marks?: { kind: "lengthen" | "placement"; a: Pt; b: Pt }[];
  // Values that could not be measured safely and were set from a rule or a default instead.
  unmeasured?: string[];
}

export type Fabric = "woven" | "knit";

export interface Pattern {
  garment: GarmentKind;
  sizeLabel: string; // "Original", or the graded size
  fabric: Fabric;
  pieces: Piece[];
  notes: string[];
}

export type GarmentKind = "shirt" | "t-shirt" | "skirt" | "eco-bag" | "pants";

export const seamLine = (p: Piece): Pt[] => p.edges.flatMap((e) => e.pts.slice(0, -1));
