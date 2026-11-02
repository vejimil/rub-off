// Elastic-waist pants, a gathered elastic skirt, an A-line skirt and a tote bag, drafted from flat
// measurements.
// Origin at the centre front (or centre back) waist, x toward the side seam, y down, cm.

import type { Pt } from "../../geom/point.ts";
import { add, dist, scale, xAt } from "../../geom/point.ts";
import { casingAllowance } from "../../rules/seam-rules.ts";
import { cubic, line, quad } from "../curves.ts";
import { rect } from "./top.ts";
import type { ALineMeasures, BagMeasures, PantsMeasures, SkirtMeasures } from "../measures.ts";
import { L, type Local } from "../../i18n/lang.ts";
import { named, type Piece } from "../types.ts";

export const ELASTIC_CM = 3; // [A] default elastic width; the user can change it

// Crotch extensions as shares of the flat hip (half the hip circumference). Pull-on pants:
// front about a sixteenth of the hip circumference, back about a tenth. [A] Owner to confirm.
const FRONT_EXT = 2 / 16;
const BACK_EXT = 2 / 10;

export function draftPants(m: PantsMeasures, unmeasured: string[], elastic = ELASTIC_CM): { pieces: Piece[]; notes: Local[] } {
  const notes: Local[] = [];
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
        ...named(front ? L("앞판", "Front leg", "Delantero") : L("뒤판", "Back leg", "Trasero")),
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
  if (Math.abs(diff) > 0.5)
    notes.push(
      L(
        `뒤 안솔기가 앞보다 ${diff.toFixed(1)} cm 깁니다. 무릎 위에서 오그려 박거나 뒤 밑위 끝을 줄이십시오.`,
        `Back inseam is ${diff.toFixed(1)} cm longer than the front; ease it in above the knee or shorten the back crotch point.`,
        `La entrepierna trasera es ${diff.toFixed(1)} cm más larga que la delantera; embébela por encima de la rodilla o acorta la punta del tiro trasero.`,
      ),
    );
  const fold = (casing - 1).toFixed(1);
  notes.push(
    L(
      `고무줄 ${elastic} cm용 허리 통(시접 ${casing.toFixed(1)} cm): 1 cm 접고 다시 ${fold} cm 접어 박습니다. 고무줄은 허리둘레보다 10% 정도 짧게 자릅니다.`,
      `Waist casing for ${elastic} cm elastic (${casing.toFixed(1)} cm allowance): turn under 1 cm, then fold ${fold} cm. Cut the elastic to your waist minus about 10%.`,
      `Jareta para elástico de ${elastic} cm (margen de ${casing.toFixed(1)} cm): dobla 1 cm y luego ${fold} cm. Corta el elástico a tu cintura menos un 10 %.`,
    ),
  );
  if (m.thigh > 0) {
    // Around the leg at crotch level: both pieces from the crotch point to the side seam.
    const legW = frontHip + backHip + m.hip * (FRONT_EXT + BACK_EXT);
    if (legW < 2 * m.thigh)
      notes.push(
        L(
          `패턴의 허벅지가 원래 옷(단면 ${m.thigh.toFixed(1)} cm)보다 좁을 수 있습니다. 재단 전에 확인하십시오.`,
          `Thigh on the pattern may be narrower than the original (${m.thigh.toFixed(1)} cm flat). Check before cutting.`,
          `El muslo del patrón puede quedar más estrecho que el original (${m.thigh.toFixed(1)} cm en plano). Compruébalo antes de cortar.`,
        ),
      );
  }
  return { pieces: [front.piece, back.piece], notes };
}

export function draftSkirt(m: SkirtMeasures, elastic = ELASTIC_CM): { pieces: Piece[]; notes: Local[] } {
  const w = m.hem / 2; // half a panel, cut on the fold
  const casing = casingAllowance(elastic);
  const piece: Piece = {
    id: "panel",
    ...named(L("앞·뒤판", "Front & back", "Delantero y trasero")),
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
      L(
        `개더 스커트: 허리가 밑단만큼 넓고, ${elastic} cm 고무줄이 주름을 잡습니다. 판이 엉덩이를 지나가야 합니다.`,
        `Gathered skirt: the waist is as wide as the hem and the ${elastic} cm elastic gathers it; the panels must pass over your hips.`,
        `Falda fruncida: la cintura es tan ancha como el bajo y el elástico de ${elastic} cm la frunce; los paneles deben pasar por tus caderas.`,
      ),
      L(
        `허리 통(시접 ${casing.toFixed(1)} cm): 1 cm 접고 다시 ${(casing - 1).toFixed(1)} cm 접어 박습니다.`,
        `Waist casing (${casing.toFixed(1)} cm allowance): turn under 1 cm, then fold ${(casing - 1).toFixed(1)} cm.`,
        `Jareta (margen de ${casing.toFixed(1)} cm): dobla 1 cm y luego ${(casing - 1).toFixed(1)} cm.`,
      ),
    ],
  };
}

// [A] A-line skirt rules, owner to confirm.
export const WAISTBAND_CM = 3; // finished
const BAND_OVERLAP = 3; // the waistband's underlap at the zip
export const ZIP_CM = 18; // invisible zip in the left side seam
const HIP_DOWN = 18; // hip line below the waist seam
const HIP_PASS = 4; // the hip line must be at least the wearer's hip plus this, around
const SIDE_RISE_SHARE = 0.08; // the side waist rises with the flare, so the waist meets the side square

export function draftALine(m: ALineMeasures): { pieces: Piece[]; notes: Local[] } {
  const len = m.length - WAISTBAND_CM; // the panel, below the waistband
  const wq = m.waist / 2, hq = m.hem / 2; // a quarter of the waist and of the hem, around
  const rise = Math.min(2, SIDE_RISE_SHARE * Math.max(0, hq - wq));
  const sideTop: Pt = [wq, -rise];
  // The side seam is as long as the centre: the hem curves up toward the side.
  const d = [hq - wq, len + rise] as const, dl = Math.hypot(d[0], d[1]);
  const u: Pt = [d[0] / dl, d[1] / dl];
  const sideHem = add(sideTop, scale(u, len));
  const waist = quad([0, 0], [0.55 * wq, 0], sideTop);
  // Leaves the side square to it and meets the centre fold square.
  const hem = cubic(sideHem, add(sideHem, scale([-u[1], u[0]], 0.25 * hq)), [0.45 * hq, len], [0, len]);
  const panel: Piece = {
    id: "panel",
    ...named(L("앞·뒤판", "Front & back", "Delantero y trasero")),
    cut: { count: 2, onFold: true, mirror: false },
    edges: [
      { kind: "waist", pts: waist },
      { kind: "side", pts: line(sideTop, sideHem) },
      { kind: "hem", pts: hem },
      { kind: "fold", pts: line([0, len], [0, 0]) },
    ],
    grain: [[0.4 * wq, 0.2 * len], [0.4 * wq, 0.8 * len]],
    // The zip's end on the side seam.
    notches: [{ at: add(sideTop, scale(u, ZIP_CM)), count: 1 }],
    marks: [{ kind: "lengthen", a: [0.1 * wq, 0.6 * len], b: [0.9 * xAt([sideTop, sideHem], 0.6 * len), 0.6 * len] }],
  };
  const bandLen = 2 * m.waist + BAND_OVERLAP;
  const band = rect("waistband", L("허리단", "Waistband", "Cinturilla"), bandLen, 2 * WAISTBAND_CM, { count: 1, onFold: false, mirror: false });
  const hipAround = 4 * xAt([sideTop, sideHem], HIP_DOWN);
  return {
    pieces: [panel, band],
    notes: [
      L(
        `A라인 스커트: 왼쪽 옆선에 콘솔 지퍼 ${ZIP_CM} cm(맞춤점까지). 허리단 ${bandLen.toFixed(1)} cm는 길이 방향으로 반 접어 완성 ${WAISTBAND_CM} cm.`,
        `A-line skirt: a ${ZIP_CM} cm invisible zip in the left side seam (to the notch). The ${bandLen.toFixed(1)} cm waistband folds lengthwise to ${WAISTBAND_CM} cm finished.`,
        `Falda en A: cremallera invisible de ${ZIP_CM} cm en el costado izquierdo (hasta el piquete). La cinturilla de ${bandLen.toFixed(1)} cm se dobla a lo largo y queda de ${WAISTBAND_CM} cm.`,
      ),
      L(
        `허리선 ${HIP_DOWN} cm 아래 둘레가 ${hipAround.toFixed(1)} cm입니다. 입을 사람의 엉덩이둘레에 ${HIP_PASS} cm를 더한 값보다 작으면 옆선을 늘려 그리십시오.`,
        `${HIP_DOWN} cm below the waist the skirt is ${hipAround.toFixed(1)} cm around. If that is less than the wearer's hip plus ${HIP_PASS} cm, widen the side seams.`,
        `${HIP_DOWN} cm por debajo de la cintura la falda mide ${hipAround.toFixed(1)} cm de contorno. Si es menos que la cadera de quien la lleva más ${HIP_PASS} cm, ensancha los costados.`,
      ),
    ],
  };
}

const HANDLE_INTO_TOP = 3; // each handle end tucked under the top hem

export function draftBag(m: BagMeasures): { pieces: Piece[]; notes: Local[] } {
  const w = m.width + m.gusset, h = m.height + m.gusset / 2;
  const body: Piece = {
    id: "body",
    ...named(L("몸판", "Body", "Cuerpo")),
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
    ...named(L("손잡이", "Handle", "Asa")),
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
  const notes: Local[] = [
    L(
      "손잡이: 시접 포함. 긴 두 변을 가운데로 접어 다리고, 한 번 더 접어 상침합니다.",
      "Handles: allowances included. Press both long edges to the centre, fold again, topstitch.",
      "Asas: margen incluido. Plancha los dos lados largos hacia el centro, dobla otra vez y pespuntea.",
    ),
    L(
      `손잡이 끝은 맞춤점 자리에서 입구 단 아래로 ${HANDLE_INTO_TOP} cm 넣습니다.`,
      `Handle ends go ${HANDLE_INTO_TOP} cm under the top hem, at the notches.`,
      `Los extremos de las asas van ${HANDLE_INTO_TOP} cm bajo el dobladillo superior, en los piquetes.`,
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
  return { pieces: [body, handle], notes };
}
