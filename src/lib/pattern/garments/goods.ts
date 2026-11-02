// Things that aren't worn, drafted from flat measurements: a bib apron, an envelope cushion cover
// and a zip pouch. Origin at the top left (the apron: top of the bib on the centre line), y down, cm.

import type { Pt } from "../../geom/point.ts";
import { line, quad } from "../curves.ts";
import type { ApronMeasures, CushionMeasures, PouchMeasures } from "../measures.ts";
import { L, type Local } from "../../i18n/lang.ts";
import { named, type Edge, type Piece } from "../types.ts";

// [A] Owner to confirm.
const STRAP_WIDTH = 2.5; // finished neck strap and ties, pressed in quarters
const STRAP_INTO = 2; // each strap end tucked under the hem
const APRON_EDGE_HEM = 1.5; // the bib's curved edges and the sides, turned twice narrow
const ZIP_LONGER = 2; // a pouch zip at least this much longer than the opening

// A strap pressed in quarters: allowance included, so every edge has none.
function strap(id: string, names: Local, len: number, count: number): Piece {
  const w = 4 * STRAP_WIDTH;
  const e = (a: Pt, b: Pt): Edge => ({ kind: "seam", pts: line(a, b), allowanceCm: 0 });
  return {
    id,
    ...named(names),
    cut: { count, onFold: false, mirror: false },
    edges: [e([0, 0], [w, 0]), e([w, 0], [w, len]), e([w, len], [0, len]), e([0, len], [0, 0])],
    grain: [[w / 2, 0.2 * len], [w / 2, 0.8 * len]],
    notches: [],
  };
}

const box = (w: number, h: number, top: Edge["kind"], topAllowance?: number): Edge[] => [
  { kind: top, pts: line([0, 0], [w, 0]), allowanceCm: topAllowance },
  { kind: "seam", pts: line([w, 0], [w, h]) },
  { kind: "seam", pts: line([w, h], [0, h]) },
  { kind: "seam", pts: line([0, h], [0, 0]) },
];

export function draftApron(m: ApronMeasures): { pieces: Piece[]; notes: Local[] } {
  const b = m.bibWidth / 2, w = Math.max(m.width / 2, b), bh = Math.min(m.bibHeight, 0.8 * m.length), len = m.length;
  // The bib's edge drops from its top corner and sweeps out to the waist ties.
  const curve = quad([b, 0], [b, 0.75 * bh], [w, bh]);
  const body: Piece = {
    id: "body",
    ...named(L("몸판", "Body", "Cuerpo")),
    cut: { count: 1, onFold: true, mirror: false },
    edges: [
      { kind: "bag-top", pts: line([0, 0], [b, 0]) },
      { kind: "seam", pts: curve, allowanceCm: APRON_EDGE_HEM },
      { kind: "side", pts: line([w, bh], [w, len]), allowanceCm: APRON_EDGE_HEM },
      { kind: "hem", pts: line([w, len], [0, len]) },
      { kind: "fold", pts: line([0, len], [0, 0]) },
    ],
    grain: [[0.5 * w, 0.3 * len], [0.5 * w, 0.8 * len]],
    // Where the neck strap and the ties go.
    notches: [
      { at: [b, 0], count: 1 },
      { at: [w, bh], count: 1 },
    ],
  };
  return {
    pieces: [
      body,
      strap("neck-strap", L("목끈", "Neck strap", "Tira del cuello"), m.neckStrap + 2 * STRAP_INTO, 1),
      strap("tie", L("허리끈", "Waist tie", "Cinta de la cintura"), m.tieLength + STRAP_INTO, 2),
    ],
    notes: [
      L(
        `끈: 시접 포함. 긴 두 변을 가운데로 접어 다리고 한 번 더 접어 상침하면 폭 ${STRAP_WIDTH} cm. 끝을 맞춤점 자리에 ${STRAP_INTO} cm 넣고 박습니다.`,
        `Straps: allowances included. Press both long edges to the centre, fold again and topstitch: ${STRAP_WIDTH} cm wide. Sew each end ${STRAP_INTO} cm in, at the notches.`,
        `Tiras: margen incluido. Plancha los dos lados largos hacia el centro, dobla otra vez y pespuntea: ${STRAP_WIDTH} cm de ancho. Cose cada extremo ${STRAP_INTO} cm hacia dentro, en los piquetes.`,
      ),
      L(
        `가슴판 곡선과 옆선은 ${APRON_EDGE_HEM} cm를 두 번 접어 박습니다.`,
        `The bib curves and the sides are turned twice within ${APRON_EDGE_HEM} cm and stitched.`,
        `Las curvas del peto y los costados se doblan dos veces dentro de ${APRON_EDGE_HEM} cm y se cosen.`,
      ),
    ],
  };
}

export function draftCushion(m: CushionMeasures): { pieces: Piece[]; notes: Local[] } {
  const backH = m.height / 2 + m.overlap / 2;
  const front: Piece = {
    id: "front",
    ...named(L("앞판", "Front", "Delantero")),
    cut: { count: 1, onFold: false, mirror: false },
    edges: box(m.width, m.height, "seam"),
    grain: [[m.width / 2, 0.2 * m.height], [m.width / 2, 0.8 * m.height]],
    notches: [],
  };
  const back: Piece = {
    id: "back",
    ...named(L("뒤판", "Back", "Espalda")),
    cut: { count: 2, onFold: false, mirror: false },
    edges: box(m.width, backH, "bag-top"),
    grain: [[m.width / 2, 0.2 * backH], [m.width / 2, 0.8 * backH]],
    notches: [],
  };
  return {
    pieces: [front, back],
    notes: [
      L(
        `뒤판 두 장의 입구 쪽 단을 먼저 박고, 입구가 ${m.overlap.toFixed(1)} cm 겹치게 앞판 위에 겉끼리 맞대어 네 변을 박은 뒤 뒤집습니다.`,
        `Hem the opening edge of both backs first, lay them face down on the front overlapping ${m.overlap.toFixed(1)} cm, stitch all four sides and turn it out.`,
        `Haz primero el dobladillo de la abertura de las dos espaldas, colócalas del revés sobre el delantero solapando ${m.overlap.toFixed(1)} cm, cose los cuatro lados y dale la vuelta.`,
      ),
    ],
  };
}

export function draftPouch(m: PouchMeasures): { pieces: Piece[]; notes: Local[] } {
  const w = m.width + m.gusset, h = m.height + m.gusset / 2;
  const panel: Piece = {
    id: "panel",
    ...named(L("겉감", "Outer", "Exterior")),
    cut: { count: 2, onFold: false, mirror: false },
    edges: box(w, h, "seam"),
    grain: [[w / 2, 0.2 * h], [w / 2, 0.8 * h]],
    notches: [
      { at: [0, 0], count: 1 },
      { at: [w, 0], count: 1 },
    ],
  };
  const lining: Piece = { ...panel, id: "lining", ...named(L("안감", "Lining", "Forro")) };
  const notes: Local[] = [
    L(
      `지퍼는 입구 ${w.toFixed(1)} cm보다 ${ZIP_LONGER} cm 이상 긴 것을 씁니다. 겉감과 안감 사이에 지퍼를 끼워 위 변을 박습니다.`,
      `Use a zip at least ${ZIP_LONGER} cm longer than the ${w.toFixed(1)} cm opening. Sandwich it between outer and lining along the top edge.`,
      `Usa una cremallera al menos ${ZIP_LONGER} cm más larga que la abertura de ${w.toFixed(1)} cm. Colócala entre el exterior y el forro a lo largo del borde superior.`,
    ),
  ];
  if (m.gusset > 0)
    notes.push(
      L(
        `바닥 모서리 박기: 옆선을 박은 뒤 모서리마다 ${m.gusset.toFixed(1)} cm 폭으로 가로질러 박습니다.`,
        `Box the bottom corners: after sewing the sides, stitch across each corner ${m.gusset.toFixed(1)} cm wide.`,
        `Esquinas en caja: después de coser los lados, cose a través de cada esquina con ${m.gusset.toFixed(1)} cm de ancho.`,
      ),
    );
  return { pieces: [panel, lining], notes };
}
