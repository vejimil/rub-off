// The do-it-yourself side of an alteration order: for each alteration, what to have at hand, the
// steps in order, and the pieces to print at actual size. Pieces are of two kinds: fabric to cut
// (a back-rise insert, a hem band, side panels, patches, loops, facings), with seam allowance from
// the rule table; and paper templates laid on the garment to trace a line onto it (a hem or seam
// gauge with the new line on it, the curve of a lowered front waist or a shortened front hem, the
// taper of a leg). Sizes come from the alteration's amount and from the seam lengths of the pattern
// drafted from the same garment measurements, so a panel is as long as the seam it goes into.
// The whole garment pattern is not redrafted: alterations are made to the garment.
// Every sentence is a template filled by code and passed through the number guard; [A] constants
// are drafted by Claude for the owner to confirm.

import { polylineLength, type Pt } from "../geom/point.ts";
import { L, LANGS, type Local } from "../i18n/lang.ts";
import { draft } from "../pattern/draft.ts";
import { named, NOT_WORN, isTop, type Edge, type EdgeKind, type Fabric, type GarmentKind, type Pattern, type Piece } from "../pattern/types.ts";
import { guardNumbers } from "../rules/numbers.ts";
import { seamAllowance } from "../rules/seam-rules.ts";
import { HEM_SPARE, type Alteration, type Seams } from "./alter.ts";

// [A] Finished sizes of the pieces that don't follow from the garment, cm.
export const ELBOW_PATCH: [number, number] = [12, 16]; // across, along the sleeve
export const UNDERARM_PATCH: [number, number] = [10, 14];
export const LOOP = { width: 2, length: 14 }; // a pull loop: folded in four, a wrist goes through it
export const FACING_WIDTH = 3; // each side of a snap opening, enough for the snaps to overlap
export const KNEE_AT = 0.5; // a taper runs from the hem up this share of the inseam, to about the knee

export interface Guide {
  n: number; // the order's number
  tools: Local[];
  steps: Local[];
  pieces: Piece[]; // fabric to cut and paper templates, in printing order
  missing?: Local; // why a piece could not be sized
  tailor?: boolean; // better taken to a tailor
}

const f = (x: number) => (Math.round(x * 10) / 10).toString();

// ---------- tools ----------

const TOOL = {
  ripper: L("실뜯개", "Seam ripper", "Descosedor"),
  chalk: L("초크", "Tailor's chalk", "Jaboncillo"),
  tape: L("줄자", "Tape measure", "Cinta métrica"),
  pins: L("시침핀", "Pins", "Alfileres"),
  machine: L("재봉틀 (또는 바늘과 실)", "Sewing machine (or needle and thread)", "Máquina de coser (o aguja e hilo)"),
  needle: L("바늘과 실", "Needle and thread", "Aguja e hilo"),
  iron: L("다리미", "Iron", "Plancha"),
  scissors: L("재단 가위", "Fabric scissors", "Tijeras de tela"),
  safetyPin: L("옷핀", "Safety pin", "Imperdible"),
  elastic: L("같은 폭의 고무줄", "Elastic of the same width", "Elástico del mismo ancho"),
  fabric: L("같은 천이나 어울리는 천", "The same or a matching fabric", "La misma tela u otra que combine"),
  sturdy: L("질긴 천 (데님, 캔버스)", "Sturdy fabric (denim, canvas)", "Tela resistente (vaquero, lona)"),
  soft: L("부드러운 천 (면 저지, 플리스)", "Soft fabric (cotton jersey, fleece)", "Tela suave (punto de algodón, forro polar)"),
  snaps: L("큰 스냅", "Large snaps", "Broches grandes"),
  magnets: L("자석 단추", "Magnetic buttons", "Botones imantados"),
  pull: L("큰 지퍼 당김 고리와 후크", "A large zip pull and a hook and bar", "Un tirador grande y un corchete"),
  paper: L("인쇄한 수선 패턴 (배율 100%)", "The printed alteration pattern (at 100%)", "El patrón de arreglos impreso (al 100 %)"),
};

// ---------- pieces ----------

const line = (a: Pt, b: Pt): Pt[] => [a, b];

function rect(w: number, h: number, kinds: [EdgeKind, EdgeKind, EdgeKind, EdgeKind], allowance?: number): Edge[] {
  const c: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
  return kinds.map((kind, i) => ({ kind, pts: line(c[i], c[(i + 1) % 4]), ...(allowance !== undefined ? { allowanceCm: allowance } : {}) }));
}

function oval(rx: number, ry: number): Edge[] {
  const at = (t: number): Pt => [rx + rx * Math.cos(t), ry + ry * Math.sin(t)];
  const half = (t0: number): Pt[] => Array.from({ length: 13 }, (_, i) => at(t0 + (i * Math.PI) / 12));
  return [{ kind: "seam", pts: half(0) }, { kind: "seam", pts: half(Math.PI) }];
}

const fabricPiece = (id: string, names: Local, edges: Edge[], cut: Piece["cut"], grain: [Pt, Pt], marks?: Piece["marks"]): Piece => ({ id, ...named(names), cut, edges, grain, notches: [], marks });

// A paper template: its outline is the paper's edge (no allowance), and each `guide` line is to be
// traced onto the garment.
const paperPiece = (id: string, names: Local, edges: Edge[], marks: NonNullable<Piece["marks"]>): Piece => ({
  id,
  ...named(names),
  cut: { count: 1, onFold: false, mirror: false },
  paper: true,
  edges: edges.map((e) => ({ ...e, allowanceCm: 0 })),
  grain: [[0, 0], [0, 0]],
  notches: [],
  marks,
});

// A gauge card: its top edge goes on the line the garment has now; each line is a set distance from
// it. The name goes in the space below the lines, and the card is wider than it is tall so the name
// runs along them rather than across.
function gauge(id: string, names: Local, top: Local, lines: { at: number; label: Local }[]): Piece {
  const last = Math.max(...lines.map((l) => l.at));
  const h = last + 5, w = Math.max(10, h + 1);
  return {
    ...paperPiece(id, names, rect(w, h, ["seam", "seam", "seam", "seam"]), [
      { kind: "guide", a: [0, 0], b: [w, 0], label: top },
      ...lines.map((l) => ({ kind: "guide" as const, a: [0, l.at] as Pt, b: [w, l.at] as Pt, label: L(`${l.label.ko} ${f(l.at)} cm`, `${l.label.en} ${f(l.at)} cm`, `${l.label.es} ${f(l.at)} cm`) })),
    ]),
    labelAt: [w / 2, last + 2.6],
  };
}

// A curve template across a half width: `depth` at the centre (x = 0), nothing at the side (x = w).
function curveTemplate(id: string, names: Local, w: number, depth: number, top: Local, curve: Local, centre: Local): Piece {
  const curvePts: Pt[] = Array.from({ length: 13 }, (_, i) => {
    const x = w - (i * w) / 12;
    return [x, depth * (1 - (x / w) ** 2)] as Pt;
  });
  return paperPiece(id, names, [{ kind: "seam", pts: line([0, 0], [w, 0]) }, { kind: "seam", pts: curvePts }, { kind: "seam", pts: line([0, depth], [0, 0]) }], [
    { kind: "guide", a: [0.1 * w, 0], b: [0.9 * w, 0], label: top },
    { kind: "guide", a: curvePts[3], b: curvePts[9], label: curve },
    { kind: "guide", a: [0, depth], b: [0, 0], label: centre },
  ]);
}

// Seam lengths from the pattern drafted with the same measurements.
interface Lengths {
  side?: number; // a top's side seam (underarm to hem), a skirt's or trouser leg's outseam
  inseam?: number;
  underarm?: number;
  backWaist?: number; // one back trouser piece, centre back to the side, on the seam line
  frontWaist?: number;
  frontHem?: number; // half the front hem of a top
}

function lengthsOf(garment: GarmentKind, measures: Record<string, number>, fabric: Fabric): Lengths {
  let p: Pattern;
  try {
    p = draft({ garment, measures, fabric });
  } catch {
    return {};
  }
  const edge = (id: string, kind: EdgeKind) => {
    const e = p.pieces.find((x) => x.id === id)?.edges.find((x) => x.kind === kind);
    return e ? polylineLength(e.pts) : undefined;
  };
  const sideOf = p.pieces.find((x) => x.edges.some((e) => e.kind === "side"));
  const side = sideOf?.edges.find((e) => e.kind === "side");
  return {
    side: side ? polylineLength(side.pts) : undefined,
    inseam: edge("front", "inseam"),
    underarm: edge("sleeve", "underarm"),
    backWaist: edge("back", "casing") ?? edge("back", "waist"),
    frontWaist: edge("front", "casing") ?? edge("front", "waist") ?? edge("panel", "casing") ?? edge("panel", "waist"),
    frontHem: isTop(garment) ? edge("front", "hem") ?? edge("front", "seam") : edge("panel", "hem"),
  };
}

// ---------- guides ----------

const MEASURE_FIRST = L(
  "고칠 길이를 넣으면 실제 크기 조각을 그립니다. 재단 전에 옷을 입고 재 보십시오.",
  "Enter the amount and the actual-size pieces are made. Try the garment on and measure before cutting.",
  "Escribe la medida y se crean las piezas a tamaño real. Pruébate la prenda y mide antes de cortar.",
);
const NO_MEASURES = L(
  "이 옷의 치수가 없어 조각 크기를 정하지 못했습니다. 옷 사진을 올리거나 치수를 넣어 주십시오.",
  "Without this garment's measurements the pieces can't be sized. Upload a photo of it or enter its measurements.",
  "Sin las medidas de la prenda no se pueden dimensionar las piezas. Sube una foto o escribe sus medidas.",
);
const TRY_ON = L("다 박기 전에 시침핀으로 고정하고 입어 봅니다.", "Pin it and try it on before the final stitching.", "Sujétalo con alfileres y pruébatelo antes de coser del todo.");
const PRESS = L("솔기를 다림질해 마무리합니다.", "Press the seams to finish.", "Plancha las costuras para terminar.");
const UNCHECKED = L("이 단계의 길이는 재단 전에 직접 재서 정하십시오.", "Measure this step's amount yourself before cutting.", "Mide tú la medida de este paso antes de cortar.");

const SEAMS_NAME: Record<Seams, Local> = {
  side: L("양 옆선", "both side seams", "las dos costuras laterales"),
  leg: L("안솔기와 옆선", "the inseams and outseams", "las costuras de entrepierna y laterales"),
  underarm: L("소매 밑선", "the underarm seams", "las costuras bajo el brazo"),
};

export function diyGuide(garment: GarmentKind, measures: Record<string, number>, fabric: Fabric, a: Alteration, n: number): Guide {
  const g = build(garment, measures, fabric, a, n);
  // Every number a step carries: the amounts and constants the steps were filled from.
  const sa = seamAllowance("seam", fabric), hem = seamAllowance("hem", fabric);
  const cm = a.diy.cm ?? 0;
  const base = [cm, cm / 2, 2 * cm, cm - hem, cm + sa, cm + 2 * sa, sa, hem, n, LOOP.width, LOOP.length, 4 * LOOP.width, LOOP.length + 2, FACING_WIDTH, HEM_SPARE.top, HEM_SPARE.pants, ...ELBOW_PATCH, ...UNDERARM_PATCH];
  const allowed = base.map((x) => Math.round(x * 10) / 10);
  const steps = g.steps.map((s) => (LANGS.every((l) => guardNumbers(s[l], allowed)) ? s : UNCHECKED));
  return { ...g, steps };
}

function build(garment: GarmentKind, measures: Record<string, number>, fabric: Fabric, a: Alteration, n: number): Guide {
  const { how, where, seams } = a.diy;
  const cm = a.diy.cm !== undefined && a.diy.cm > 0 ? a.diy.cm : undefined;
  const sa = seamAllowance("seam", fabric), hem = seamAllowance("hem", fabric);
  const len = lengthsOf(garment, measures, fabric);
  const id = (s: string) => `alt${n}-${s}`;
  const nm = (x: Local) => L(`${n}. ${x.ko}`, `${n}. ${x.en}`, `${n}. ${x.es}`);
  const top = isTop(garment);
  const pants = garment === "pants";
  const sleeve = where === "sleeve";
  const g = (tools: Local[], steps: Local[], pieces: Piece[] = [], extra: Partial<Guide> = {}): Guide => ({ n, tools, steps, pieces, ...extra });
  const need = (size?: number) => (cm === undefined ? MEASURE_FIRST : size === undefined ? NO_MEASURES : undefined);

  switch (how) {
    case "hem-up": {
      const edge = sleeve ? L("소매 끝", "sleeve end", "borde de la manga") : L("밑단 끝", "hem edge", "borde del bajo");
      const pieces = cm
        ? [
            gauge(id("gauge"), nm(L("밑단 표시 본", "Hem gauge", "Plantilla del bajo")), L(`지금 ${edge.ko}에 맞춤`, `On the ${edge.en} as it is now`, `Sobre el ${edge.es} actual`), [
              { at: cm, label: L("새 접는 선", "New fold", "Nuevo doblez") },
              ...(cm > hem ? [{ at: cm - hem, label: L("자를 선", "Cut", "Corte") }] : []),
            ]),
          ]
        : [];
      return g(
        [TOOL.ripper, TOOL.chalk, TOOL.pins, TOOL.iron, TOOL.machine, ...(cm && cm > hem ? [TOOL.scissors] : []), ...(cm ? [TOOL.paper] : [])],
        [
          L(`${edge.ko}의 박음질을 실뜯개로 뜯고 접힌 시접을 다림질로 폅니다.`, `Unpick the stitching at the ${edge.en} and press the turned-up allowance flat.`, `Descose la costura del ${edge.es} y plancha el dobladillo para alisarlo.`),
          cm
            ? L(
                `표시 본의 윗변을 원래 접혀 있던 선에 대고 옷 쪽으로 ${f(cm)} cm에 새 접는 선을 둘레 전체에 초크로 긋습니다.`,
                `Lay the gauge's top edge on the old fold line and chalk the new fold ${f(cm)} cm up, all the way round.`,
                `Apoya el borde superior de la plantilla en el doblez antiguo y marca con jaboncillo el nuevo doblez ${f(cm)} cm más arriba, por todo el contorno.`,
              )
            : L("입어 보고 원하는 길이에 시침핀을 꽂아 새 접는 선을 둘레 전체에 초크로 긋습니다.", "Try it on, pin the length you want and chalk the new fold all the way round.", "Pruébatela, marca con alfileres el largo que quieres y traza el nuevo doblez por todo el contorno."),
          ...(cm && cm > hem
            ? [L(`새 접는 선에서 ${f(hem)} cm 아래 '자를 선'을 따라 남는 천을 잘라 냅니다.`, `Cut off the extra along the cut line, ${f(hem)} cm below the new fold.`, `Recorta lo que sobra por la línea de corte, ${f(hem)} cm por debajo del nuevo doblez.`)]
            : []),
          L("새 접는 선대로 접어 다림질하고, 시접 끝을 한 번 더 접어 넣어 박습니다.", "Fold along the new line, press, turn the raw edge under and stitch.", "Dobla por la nueva línea, plancha, mete el borde hacia dentro y cose."),
          PRESS,
        ],
        pieces,
        { missing: cm ? undefined : MEASURE_FIRST },
      );
    }
    case "cuff-shorten":
      return g(
        [TOOL.ripper, TOOL.chalk, TOOL.scissors, TOOL.pins, TOOL.machine, TOOL.iron, ...(cm ? [TOOL.paper] : [])],
        [
          L("커프스를 소매에서 뜯어 냅니다. 커프스의 주름 위치를 사진으로 찍어 둡니다.", "Unpick the cuffs from the sleeves. Photograph where the pleats sit.", "Descose los puños de las mangas. Haz una foto de dónde van los pliegues."),
          cm
            ? L(`표시 본의 윗변을 소매 끝에 대고 ${f(cm)} cm 위에 자를 선을 긋고 잘라 냅니다.`, `Lay the gauge's top edge on the sleeve end, chalk the cut line ${f(cm)} cm up and cut.`, `Apoya la plantilla en el borde de la manga, marca el corte ${f(cm)} cm más arriba y corta.`)
            : L("입어 보고 원하는 소매 길이를 표시한 뒤 그만큼 잘라 냅니다.", "Try it on, mark the sleeve length you want and cut the difference off.", "Pruébatela, marca el largo de manga que quieres y corta la diferencia."),
          L("소매 트임이 짧아졌다면 트임을 그만큼 위로 다시 엽니다.", "If the sleeve placket got shorter, open it the same amount higher.", "Si la abertura de la manga ha quedado corta, ábrela lo mismo hacia arriba."),
          L("주름을 원래대로 잡고 커프스를 다시 답니다.", "Pleat the sleeve as before and sew the cuffs back on.", "Haz los pliegues como antes y vuelve a coser los puños."),
          PRESS,
        ],
        cm ? [gauge(id("gauge"), nm(L("소매 자를 선 표시 본", "Sleeve cut gauge", "Plantilla de corte de manga")), L("소매 끝에 맞춤", "On the sleeve end", "Sobre el borde de la manga"), [{ at: cm, label: L("자를 선", "Cut", "Corte") }])] : [],
        { missing: cm ? undefined : MEASURE_FIRST },
      );
    case "hem-down": {
      const edge = sleeve ? L("소매 끝", "sleeve end", "borde de la manga") : L("밑단 끝", "hem edge", "borde del bajo");
      return g(
        [TOOL.ripper, TOOL.chalk, TOOL.iron, TOOL.machine, ...(cm ? [TOOL.paper] : [])],
        [
          L(`${edge.ko}의 박음질을 뜯고 접힌 시접을 다림질로 폅니다.`, `Unpick the stitching at the ${edge.en} and press the allowance flat.`, `Descose la costura del ${edge.es} y plancha el dobladillo para alisarlo.`),
          cm
            ? L(
                `펼친 시접이 ${f(cm)} cm보다 넉넉히 남는지 봅니다. 모자라면 '덧단 달기'로 바꿉니다.`,
                `Check that the unfolded allowance is comfortably more than ${f(cm)} cm. If not, switch to adding a band.`,
                `Comprueba que el dobladillo desplegado mide bastante más de ${f(cm)} cm. Si no, cambia a añadir una tira.`,
              )
            : L("펼친 시접이 얼마나 남는지 재 봅니다.", "Measure how much allowance there is unfolded.", "Mide cuánto dobladillo queda desplegado."),
          cm
            ? L(`표시 본의 윗변을 원래 접혀 있던 선에 대고 ${f(cm)} cm 아래에 새 접는 선을 긋습니다.`, `Lay the gauge's top edge on the old fold and chalk the new fold ${f(cm)} cm lower.`, `Apoya la plantilla en el doblez antiguo y marca el nuevo doblez ${f(cm)} cm más abajo.`)
            : L("입어 보고 원하는 길이에 새 접는 선을 긋습니다.", "Try it on and chalk the new fold at the length you want.", "Pruébatela y marca el nuevo doblez al largo que quieres."),
          L("새 선대로 접어 박습니다. 원래 접힌 자국은 물을 뿌려 다림질하면 옅어집니다.", "Fold on the new line and stitch. Steam the old fold line to fade it.", "Dobla por la nueva línea y cose. Plancha con vapor la marca del doblez antiguo para que se note menos."),
        ],
        cm ? [gauge(id("gauge"), nm(L("밑단 표시 본", "Hem gauge", "Plantilla del bajo")), L("원래 접혀 있던 선에 맞춤", "On the old fold line", "Sobre el doblez antiguo"), [{ at: cm, label: L("새 접는 선", "New fold", "Nuevo doblez") }])] : [],
        { missing: cm ? undefined : MEASURE_FIRST },
      );
    }
    case "band": {
      // A band sewn to the hem as it is: finished height = the amount. Tops and skirts: front and
      // back halves joined at the sides; trousers and sleeves: one tube per leg or sleeve.
      const tube = sleeve || pants;
      const around = sleeve ? measures.sleeveOpening : pants ? measures.legOpening : measures.hem;
      const length = around > 0 ? (tube ? 2 * around : around) : undefined;
      const names = sleeve ? L("소매 덧단", "Sleeve band", "Tira de manga") : L("밑단 덧단", "Hem band", "Tira del bajo");
      const pieces =
        cm && length
          ? [fabricPiece(id("band"), nm(names), rect(length, cm, ["seam", tube ? "seam" : "side", sleeve ? "sleeve-hem" : "hem", tube ? "seam" : "side"]), { count: 2, onFold: false, mirror: false }, [[0.1 * length, 0.2 * cm], [0.1 * length, 0.8 * cm]])]
          : [];
      return g(
        [TOOL.fabric, TOOL.scissors, TOOL.pins, TOOL.machine, TOOL.iron, TOOL.paper],
        [
          L("천을 세탁해 줄어들 만큼 미리 줄여 둡니다.", "Wash the new fabric first so it shrinks before cutting.", "Lava antes la tela nueva para que encoja antes de cortar."),
          L(
            `수선 패턴의 ${names.ko}을 천에 대고 2장 자릅니다. 시접 ${f(sa)} cm와 아래 단 시접 ${f(hem)} cm가 들어 있습니다.`,
            `Cut 2 ${names.en.toLowerCase()} pieces from the alteration pattern. They include ${f(sa)} cm seam allowance and ${f(hem)} cm at the hem.`,
            `Corta 2 piezas de ${names.es.toLowerCase()} con el patrón de arreglos. Incluyen ${f(sa)} cm de margen y ${f(hem)} cm de dobladillo.`,
          ),
          tube
            ? L("각 조각의 짧은 두 변을 박아 고리로 만듭니다.", "Sew each piece's short ends together into a ring.", "Cose los extremos cortos de cada pieza para formar un aro.")
            : L("두 조각의 짧은 변끼리 박아 고리로 만듭니다. 이음선이 옷의 옆선에 오게 합니다.", "Sew the two pieces' short ends together into a ring, with the joins at the garment's side seams.", "Une los extremos cortos de las dos piezas en un aro, con las uniones en las costuras laterales."),
          L(
            `덧단 윗변을 옷의 지금 ${sleeve ? "소매 끝" : "밑단 끝"}에 겉끼리 맞대 박습니다.`,
            `Sew the band's top edge to the garment's ${sleeve ? "sleeve end" : "hem edge"} as it is, right sides together.`,
            `Cose el borde superior de la tira al ${sleeve ? "borde de la manga" : "borde del bajo"} actual, derecho con derecho.`,
          ),
          L(`덧단 아래를 ${f(hem)} cm 두 번 접어 박습니다.`, `Turn the band's lower edge under twice, ${f(hem)} cm in all, and stitch.`, `Dobla dos veces el borde inferior de la tira, ${f(hem)} cm en total, y cose.`),
          PRESS,
        ],
        pieces,
        { missing: need(length) },
      );
    }
    case "take-in":
    case "let-out": {
      const take = how === "take-in";
      const sw = SEAMS_NAME[seams ?? "side"];
      const pieces = cm
        ? [
            gauge(id("gauge"), nm(take ? L("줄일 선 표시 본", "Take-in gauge", "Plantilla para meter") : L("늘릴 선 표시 본", "Let-out gauge", "Plantilla para sacar")), L("지금 박음선에 맞춤", "On the stitching line as it is", "Sobre la costura actual"), [
              { at: cm, label: L("새로 박을 선", "New stitching", "Nueva costura") },
            ]),
          ]
        : [];
      return g(
        [...(take ? [] : [TOOL.ripper]), TOOL.chalk, TOOL.pins, TOOL.machine, TOOL.iron, ...(cm ? [TOOL.paper] : [])],
        [
          L("옷을 뒤집어 입고 거울 앞에서 고칠 곳을 시침핀으로 잡아 봅니다.", "Put the garment on inside out and pin the change in front of a mirror.", "Ponte la prenda del revés y marca el cambio con alfileres frente al espejo."),
          cm
            ? take
              ? L(
                  `표시 본의 윗변을 ${sw.ko}의 지금 박음선에 대고, ${f(cm)} cm 안쪽에 새로 박을 선을 초크로 긋습니다. 끝에서는 원래 선으로 부드럽게 이어 줍니다.`,
                  `Lay the gauge's top edge on the stitching of ${sw.en} and chalk the new line ${f(cm)} cm further in. Blend it into the old line at the ends.`,
                  `Apoya la plantilla en la costura de ${sw.es} y marca la nueva línea ${f(cm)} cm más adentro. Únela con la línea antigua en los extremos.`,
                )
              : L(
                  `${sw.ko}을 뜯고, 시접이 ${f(cm)} cm보다 넉넉히 남는지 봅니다. 표시 본으로 지금 박음선에서 ${f(cm)} cm 바깥에 새 선을 긋습니다.`,
                  `Unpick ${sw.en} and check the allowance is comfortably more than ${f(cm)} cm. With the gauge, chalk the new line ${f(cm)} cm outside the old stitching.`,
                  `Descose ${sw.es} y comprueba que el margen mide bastante más de ${f(cm)} cm. Con la plantilla, marca la nueva línea ${f(cm)} cm por fuera de la costura antigua.`,
                )
            : L(`${sw.ko}을 같은 폭으로 고칠 선을 초크로 긋습니다.`, `Chalk the new line on ${sw.en}, the same amount on each.`, `Marca la nueva línea en ${sw.es}, lo mismo en cada una.`),
          TRY_ON,
          take
            ? L("새 선을 박고, 입어서 맞으면 원래 박음질을 뜯고 남는 시접은 정리합니다.", "Stitch the new line; once it fits, unpick the old stitching and trim and finish the allowance.", "Cose la nueva línea; cuando quede bien, descose la costura antigua y remata el margen.")
            : L("새 선을 박고 시접 끝을 지그재그로 정리합니다.", "Stitch the new line and zigzag the allowance edges.", "Cose la nueva línea y remata los bordes del margen en zigzag."),
          PRESS,
        ],
        pieces,
        { missing: cm ? undefined : MEASURE_FIRST },
      );
    }
    case "panel": {
      const sw = SEAMS_NAME[seams ?? "side"];
      const runs: { key: string; names: Local; length?: number }[] =
        seams === "leg"
          ? [
              { key: "outseam", names: L("옆선 덧천", "Outseam panel", "Pieza lateral"), length: len.side },
              { key: "inseam", names: L("안솔기 덧천", "Inseam panel", "Pieza de entrepierna"), length: len.inseam },
            ]
          : seams === "underarm"
            ? [{ key: "underarm", names: L("소매 밑선 덧천", "Underarm panel", "Pieza bajo el brazo"), length: len.underarm }]
            : [{ key: "side", names: L("옆선 덧천", "Side panel", "Pieza lateral"), length: len.side }];
      const sized = cm !== undefined && runs.every((r) => r.length);
      const pieces = sized
        ? runs.map((r) => fabricPiece(id(r.key), nm(r.names), rect(cm, r.length!, ["seam", "side", "hem", "side"]), { count: 2, onFold: false, mirror: false }, [[cm / 2, 0.15 * r.length!], [cm / 2, 0.85 * r.length!]]))
        : [];
      return g(
        [TOOL.ripper, TOOL.fabric, TOOL.scissors, TOOL.pins, TOOL.machine, TOOL.iron, TOOL.paper],
        [
          L(`${sw.ko}을 처음부터 끝까지 뜯고, 단도 그 근처만 뜯어 둡니다.`, `Unpick ${sw.en} from end to end, and the hem just around them.`, `Descose ${sw.es} de punta a punta, y el bajo solo alrededor.`),
          cm
            ? L(
                `수선 패턴의 덧천을 2장씩 자릅니다. 완성 폭 ${f(cm)} cm에 시접 ${f(sa)} cm가 양쪽에 붙어 있습니다.`,
                `Cut 2 of each panel from the alteration pattern: ${f(cm)} cm wide finished, with ${f(sa)} cm seam allowance on each side.`,
                `Corta 2 de cada pieza con el patrón de arreglos: ${f(cm)} cm de ancho terminado, con ${f(sa)} cm de margen a cada lado.`,
              )
            : L("몸 치수나 고칠 길이를 넣으면 덧천 폭을 계산합니다.", "The panel width is worked out once body measurements or an amount are entered.", "El ancho de la pieza se calcula al introducir las medidas del cuerpo o una cantidad."),
          L("덧천의 한쪽 긴 변을 앞판에, 다른 쪽을 뒤판에 겉끼리 맞대 박습니다.", "Sew one long edge of each panel to the front and the other to the back, right sides together.", "Cose un borde largo de cada pieza al delantero y el otro a la espalda, derecho con derecho."),
          ...(seams === "underarm" || (top && seams === "side")
            ? [L("겨드랑이 쪽 끝은 진동 박음선에 맞춰 같이 박습니다.", "At the underarm, sew the panel's end into the armhole seam.", "En la axila, cose el extremo de la pieza en la costura de la sisa.")]
            : []),
          TRY_ON,
          L("단을 원래대로 접어 박고 다림질합니다.", "Turn up and stitch the hem as it was, then press.", "Vuelve a coser el bajo como estaba y plancha."),
        ],
        pieces,
        { missing: cm === undefined ? MEASURE_FIRST : sized ? undefined : NO_MEASURES, tailor: seams === "underarm" },
      );
    }
    case "elastic-shorter":
    case "elastic-longer": {
      const shorter = how === "elastic-shorter";
      return g(
        [TOOL.ripper, TOOL.safetyPin, TOOL.scissors, TOOL.needle, ...(shorter ? [] : [TOOL.elastic])],
        [
          L("허리 안쪽의 고무줄 이음매 근처에서 허리단 박음질을 조금 뜯어 구멍을 냅니다.", "Unpick a short stretch of the waistband stitching near the elastic's join, on the inside.", "Descose un tramo corto de la cinturilla por dentro, cerca de la unión del elástico."),
          L("구멍으로 고무줄을 꺼내 이음매를 자릅니다. 반대쪽 끝에 옷핀을 꽂아 빠지지 않게 합니다.", "Pull the elastic out through the opening and cut it at the join. Pin the other end so it doesn't slip in.", "Saca el elástico por la abertura y córtalo por la unión. Sujeta el otro extremo con un imperdible para que no se escape."),
          cm
            ? shorter
              ? L(`고무줄을 ${f(cm)} cm 잘라 내고 두 끝을 겹쳐 튼튼하게 박습니다.`, `Cut ${f(cm)} cm off the elastic, overlap the ends and stitch them firmly.`, `Corta ${f(cm)} cm del elástico, superpón los extremos y cóselos bien.`)
              : L(`새 고무줄을 ${f(cm)} cm 더 길게 이어 붙이거나, 그만큼 긴 새 고무줄로 바꿔 옷핀으로 끼웁니다.`, `Join on ${f(cm)} cm of new elastic, or thread in a new one that much longer with the safety pin.`, `Añade ${f(cm)} cm de elástico nuevo, o pasa con el imperdible uno nuevo así de más largo.`)
            : L("고무줄을 허리에 둘러 편한 길이를 정하고 두 끝을 겹쳐 박습니다.", "Wrap the elastic round your waist to find a comfortable length, then overlap the ends and stitch.", "Rodea la cintura con el elástico para hallar un largo cómodo, superpón los extremos y cose."),
          L("고무줄을 허리단 안에 고르게 펴고, 뜯은 곳을 다시 박습니다.", "Spread the elastic evenly inside the waistband and stitch the opening shut.", "Reparte el elástico por igual dentro de la cinturilla y cierra la abertura."),
        ],
      );
    }
    case "back-rise": {
      const w = len.backWaist;
      const pieces =
        cm && w
          ? [
              fabricPiece(
                id("rise"),
                nm(L("뒤 밑위 덧단", "Back-rise insert", "Pieza de tiro trasero")),
                [
                  { kind: "seam", pts: line([0, 0], [w, 0]) },
                  { kind: "seam", pts: Array.from({ length: 13 }, (_, i) => { const x = w - (i * w) / 12; return [x, cm * (1 - (x / w) ** 2)] as Pt; }) },
                  { kind: "fold", pts: line([0, cm], [0, 0]) },
                ],
                { count: 1, onFold: true, mirror: false },
                [[0.25 * w, 0.15 * cm], [0.25 * w, 0.8 * cm]],
              ),
            ].map((p) => ({ ...p, labelAt: [0.62 * w, 0.3 * cm] as Pt }))
          : [];
      return g(
        [TOOL.ripper, TOOL.fabric, TOOL.scissors, TOOL.pins, TOOL.machine, TOOL.iron, TOOL.paper],
        [
          L("뒤 허리단을 한쪽 옆선에서 다른 쪽 옆선까지 뜯어 냅니다. 고무줄은 앞에 남겨 둡니다.", "Unpick the back waistband from one side seam to the other. Leave the elastic in the front.", "Descose la cinturilla trasera de una costura lateral a la otra. Deja el elástico en el delantero."),
          cm
            ? L(
                `수선 패턴의 뒤 밑위 덧단을 천을 반으로 접은 골선에 대고 1장 자릅니다. 뒤중심에서 ${f(cm)} cm 높고 옆선으로 갈수록 좁아지는 곡선입니다.`,
                `Cut 1 back-rise insert from the alteration pattern, on the fold of the fabric. It is ${f(cm)} cm deep at centre back and tapers to nothing at the side seams.`,
                `Corta 1 pieza de tiro trasero con el patrón de arreglos, al doblez de la tela. Mide ${f(cm)} cm en el centro trasero y se reduce a nada en los costados.`,
              )
            : L("수선 패턴의 뒤 밑위 덧단을 천을 반으로 접은 골선에 대고 1장 자릅니다.", "Cut 1 back-rise insert from the alteration pattern, on the fold of the fabric.", "Corta 1 pieza de tiro trasero con el patrón de arreglos, al doblez de la tela."),
          L("덧단의 곡선 쪽을 바지 뒤 허리에 겉끼리 맞대 박습니다.", "Sew the insert's curved edge to the back waist of the trousers, right sides together.", "Cose el borde curvo de la pieza a la cintura trasera, derecho con derecho."),
          L("덧단의 곧은 쪽에 뒤 허리단을 다시 답니다. 허리단이 옆선에서 앞 허리단과 이어지게 합니다.", "Sew the back waistband back on along the insert's straight edge, meeting the front band at the side seams.", "Vuelve a coser la cinturilla trasera en el borde recto de la pieza, uniéndola con la delantera en los costados."),
          L("앉아서 입어 보고 뒤가 내려가지 않는지 확인합니다.", "Sit in it and check that the back no longer drops.", "Siéntate con él puesto y comprueba que ya no se baja por detrás."),
        ],
        pieces,
        { missing: need(w) },
      );
    }
    case "front-rise": {
      const w = len.frontWaist;
      const pieces = cm && w ? [curveTemplate(id("front"), nm(L("앞 허리선 본", "Front waist template", "Plantilla de cintura delantera")), w, cm, L("지금 허리선에 맞춤", "On the waistline as it is", "Sobre la cintura actual"), L("새 허리선", "New waistline", "Nueva cintura"), L("앞중심", "Centre front", "Centro delantero"))] : [];
      return g(
        [TOOL.ripper, TOOL.chalk, TOOL.pins, TOOL.machine, TOOL.paper],
        [
          cm
            ? L(
                `수선 패턴의 앞 허리선 본을 앞판 허리에 대고 새 허리선을 초크로 긋습니다. 앞중심에서 ${f(cm)} cm 내려가고 옆선에서 원래 선과 만납니다. 반대쪽은 본을 뒤집어 긋습니다.`,
                `Lay the front waist template on the front waist and chalk the new waistline: ${f(cm)} cm lower at centre front, meeting the old line at the side seam. Flip the template for the other side.`,
                `Coloca la plantilla en la cintura delantera y marca la nueva cintura: ${f(cm)} cm más baja en el centro delantero, uniéndose con la antigua en el costado. Dale la vuelta para el otro lado.`,
              )
            : L("앉았을 때 접히는 높이를 재고, 앞중심에서 그만큼 내려 옆선으로 이어지는 새 허리선을 긋습니다.", "Measure the fold when you sit and chalk a new waistline that much lower at centre front, curving into the side seams.", "Mide el pliegue al sentarte y traza una nueva cintura así de baja en el centro delantero, curvándose hasta los costados."),
          L("고무줄 허리라면 앞쪽 허리단 박음질만 뜯고, 고무줄을 새 선 위치로 내려 박습니다. 뒤는 그대로 둡니다.", "On an elastic waist, unpick only the front of the waistband and stitch the casing down to the new line. Leave the back as it is.", "En cintura elástica, descose solo la parte delantera de la cinturilla y cose la jareta en la nueva línea. Deja la espalda como está."),
          TRY_ON,
        ],
        pieces,
        { missing: need(w) },
      );
    }
    case "front-hem": {
      const w = len.frontHem;
      const pieces = cm && w ? [curveTemplate(id("hem"), nm(L("앞 밑단 본", "Front hem template", "Plantilla del bajo delantero")), w, cm, L("지금 밑단 끝에 맞춤", "On the hem edge as it is", "Sobre el borde del bajo actual"), L("새 밑단 끝", "New hem edge", "Nuevo borde del bajo"), L("앞중심", "Centre front", "Centro delantero"))] : [];
      return g(
        [TOOL.ripper, TOOL.chalk, TOOL.scissors, TOOL.pins, TOOL.machine, TOOL.iron, TOOL.paper],
        [
          L("앞 밑단의 박음질만 옆선에서 옆선까지 뜯습니다. 뒤 밑단은 그대로 둡니다.", "Unpick the front hem only, side seam to side seam. Leave the back hem alone.", "Descose solo el bajo delantero, de costado a costado. Deja el trasero como está."),
          cm
            ? L(
                `앞 밑단 본의 윗변을 지금 밑단 끝에 대고 새 밑단 끝을 긋습니다. 앞중심에서 ${f(cm)} cm 올라가고 옆선에서 원래 선과 만납니다.`,
                `Lay the template's top edge on the hem edge and chalk the new hem edge: ${f(cm)} cm higher at centre front, meeting the old edge at the side seams.`,
                `Apoya la plantilla en el borde del bajo y marca el nuevo borde: ${f(cm)} cm más alto en el centro delantero, uniéndose con el antiguo en los costados.`,
              )
            : L("앉아서 남는 앞자락 길이를 재고, 앞중심에서 그만큼 올라가 옆선으로 이어지는 곡선을 긋습니다.", "Measure the extra front length when you sit and chalk a curve that much higher at centre front, meeting the side seams.", "Mide lo que sobra del delantero al sentarte y traza una curva así de alta en el centro delantero, hasta los costados."),
          L(`새 선에서 ${f(hem)} cm 아래로 시접을 남기고 자릅니다.`, `Cut ${f(hem)} cm below the new line, for the hem allowance.`, `Corta ${f(hem)} cm por debajo de la nueva línea, para el dobladillo.`),
          L("시접을 접어 곡선을 따라 박습니다. 곡선에서는 시접을 좁게 접어야 울지 않습니다.", "Turn the allowance up and stitch along the curve; keep the turn narrow so the curve lies flat.", "Dobla el margen y cose siguiendo la curva; dobla estrecho para que la curva quede plana."),
          PRESS,
        ],
        pieces,
        { missing: need(w) },
      );
    }
    case "taper": {
      const t = len.inseam !== undefined ? len.inseam * KNEE_AT : undefined;
      const pieces =
        cm && t
          ? [
              {
                ...paperPiece(id("taper"), nm(L("바지통 줄일 선 본", "Leg taper template", "Plantilla para estrechar la pernera")), rect(cm + 2, t, ["seam", "seam", "seam", "seam"]), [
                  // The edge itself goes on the seam; its label sits near the hem end, where the new line is furthest away.
                  { kind: "guide", a: [0, 0.95 * t], b: [0, 0.75 * t], label: L("지금 안솔기 박음선에 맞춤", "On the inseam stitching", "Sobre la costura de entrepierna") },
                  { kind: "guide", a: [0, 0], b: [cm, t], label: L("새로 박을 선", "New stitching", "Nueva costura") },
                  { kind: "guide", a: [cm + 2, t], b: [0, t], label: L("밑단", "Hem", "Bajo") },
                ]),
                labelAt: [(cm + 2) / 2, 0.3 * t] as Pt,
              },
            ]
          : [];
      return g(
        [TOOL.ripper, TOOL.chalk, TOOL.pins, TOOL.machine, TOOL.iron, TOOL.paper],
        [
          L("바지를 뒤집고 밑단의 안솔기 근처 박음질을 뜯습니다.", "Turn the trousers inside out and unpick the hem around the inseam.", "Da la vuelta al pantalón y descose el bajo alrededor de la entrepierna."),
          cm
            ? L(
                `본의 긴 변을 안솔기 박음선에 대고, 밑단에서 ${f(cm)} cm 안쪽에서 시작해 무릎 쪽에서 원래 선과 만나는 선을 긋습니다.`,
                `Lay the template's long edge on the inseam stitching and chalk the line: ${f(cm)} cm in at the hem, meeting the old line towards the knee.`,
                `Apoya el borde largo de la plantilla en la costura de entrepierna y marca la línea: ${f(cm)} cm hacia dentro en el bajo, uniéndose con la antigua hacia la rodilla.`,
              )
            : L("밑단에서 줄일 만큼 안쪽에 점을 찍고, 무릎에서 원래 선으로 이어지는 선을 긋습니다.", "Mark how far in at the hem and chalk a line that meets the old seam at the knee.", "Marca cuánto meter en el bajo y traza una línea que se una a la costura antigua en la rodilla."),
          L("양쪽 다리에 똑같이 긋습니다.", "Do the same on both legs.", "Haz lo mismo en las dos perneras."),
          TRY_ON,
          L("새 선을 박고 남는 시접을 정리한 뒤, 밑단을 다시 접어 박습니다.", "Stitch the new line, trim and finish the allowance, then turn up and stitch the hem again.", "Cose la nueva línea, remata el margen y vuelve a coser el bajo."),
        ],
        pieces,
        { missing: need(t) },
      );
    }
    case "shoulder":
      return g(
        [TOOL.ripper, TOOL.chalk, TOOL.scissors, TOOL.pins, TOOL.machine, TOOL.iron],
        [
          L("소매를 진동에서 떼어 냅니다. 소매산 가운데와 어깨선이 만나는 곳에 초크로 표시해 둡니다.", "Take the sleeves out of the armholes. Chalk where the top of the sleeve cap meets the shoulder seam.", "Desmonta las mangas de las sisas. Marca dónde se encuentra la copa con la costura del hombro."),
          cm
            ? L(`어깨 끝에서 ${f(cm)} cm 안쪽에 점을 찍고, 진동선을 겨드랑이 쪽으로 부드럽게 이어 새로 긋습니다.`, `Mark ${f(cm)} cm in from each shoulder point and redraw the armhole down to the underarm in a smooth curve.`, `Marca ${f(cm)} cm hacia dentro desde cada punta del hombro y vuelve a trazar la sisa hasta la axila en una curva suave.`)
            : L("어깨 끝에서 줄일 만큼 안쪽에 점을 찍고 진동선을 새로 긋습니다.", "Mark how far in from each shoulder point and redraw the armhole.", "Marca cuánto meter desde cada punta del hombro y vuelve a trazar la sisa."),
          L("새 진동선에 소매를 시침핀으로 고정해 입어 봅니다.", "Pin the sleeves into the new armholes and try it on.", "Prende las mangas en las nuevas sisas con alfileres y pruébatela."),
          L("소매를 박고 남는 시접을 정리합니다.", "Sew the sleeves in and trim the allowance.", "Cose las mangas y recorta el margen."),
        ],
        [],
        { tailor: true },
      );
    case "remove-pockets":
      return g(
        [TOOL.ripper, TOOL.iron],
        [
          L("뒷주머니 둘레의 박음질을 실뜯개로 조심히 뜯습니다.", "Carefully unpick the stitching round the back pockets.", "Descose con cuidado la costura alrededor de los bolsillos traseros."),
          L("리벳은 집에서 빼기 어려우니, 배기는 리벳만 수선집에 맡깁니다.", "Rivets are hard to remove at home; take only the ones that dig in to a tailor.", "Los remaches son difíciles de quitar en casa; lleva al taller solo los que se clavan."),
          L("남은 실밥을 뽑고 물을 뿌려 다림질하면 자국이 옅어집니다.", "Pull out the loose threads and steam-press to fade the marks.", "Quita los hilos sueltos y plancha con vapor para que las marcas se noten menos."),
        ],
      );
    case "cast-opening": {
      const pieces = cm ? [fabricPiece(id("facing"), nm(L("트임 안단", "Opening facing", "Vista de la abertura")), rect(FACING_WIDTH, cm, ["seam", "seam", "hem", "seam"]), { count: 2, onFold: false, mirror: true }, [[FACING_WIDTH / 2, 0.15 * cm], [FACING_WIDTH / 2, 0.85 * cm]])] : [];
      return g(
        [TOOL.ripper, TOOL.chalk, TOOL.fabric, TOOL.scissors, TOOL.machine, TOOL.snaps, TOOL.paper],
        [
          cm
            ? L(`옆선을 밑단에서 위로 ${f(cm)} cm 뜯습니다. 위쪽 끝은 되박음으로 단단히 막습니다.`, `Unpick the outseam ${f(cm)} cm up from the hem. Backstitch firmly at the top.`, `Descose la costura lateral ${f(cm)} cm desde el bajo. Remata bien arriba.`)
            : L("깁스 높이를 재고, 옆선을 밑단에서 그 높이보다 조금 더 위까지 뜯습니다.", "Measure the cast's height and unpick the outseam from the hem to a little above it.", "Mide la altura de la escayola y descose la costura lateral desde el bajo hasta un poco más arriba."),
          L(`수선 패턴의 트임 안단을 2장 잘라, 트임 양쪽 가장자리에 하나씩 박아 안으로 넘깁니다.`, "Cut 2 opening facings from the alteration pattern and sew one to each edge of the opening, then turn them inside.", "Corta 2 vistas con el patrón de arreglos, cose una en cada borde de la abertura y vuélvelas hacia dentro."),
          L("앞쪽 안단과 뒤쪽 안단이 겹치는 자리에 스냅을 같은 간격으로 답니다.", "Sew snaps evenly spaced where the front and back facings overlap.", "Cose broches a la misma distancia donde se solapan las vistas delantera y trasera."),
          L("깁스를 푼 뒤에는 안단을 떼고 옆선을 다시 박으면 원래대로 돌아갑니다.", "Once the cast is off, remove the facings and sew the seam shut to undo it.", "Cuando quites la escayola, retira las vistas y cose la costura para dejarla como estaba."),
        ],
        pieces,
        { missing: cm ? undefined : MEASURE_FIRST },
      );
    }
    case "pull-loops": {
      const w = 4 * LOOP.width, h = LOOP.length + 2;
      // Each fold line in two parts, the label on the short one, clear of the name in the middle.
      const folds = [1, 2, 3].flatMap((k) => [
        { kind: "guide" as const, a: [k * LOOP.width, 0.25 * h] as Pt, b: [k * LOOP.width, 0] as Pt, label: L("접는 선", "Fold", "Doblez") },
        { kind: "guide" as const, a: [k * LOOP.width, 0.25 * h] as Pt, b: [k * LOOP.width, h] as Pt },
      ]);
      const piece = paperPiece(id("loop"), nm(L("당김 고리", "Pull loop", "Presilla")), rect(w, h, ["seam", "seam", "seam", "seam"]), folds);
      // Cut from fabric along the paper's edge: no allowance to add.
      const loop: Piece = { ...piece, paper: false, cut: { count: 3, onFold: false, mirror: false }, grain: [[LOOP.width / 2, 0.3 * h], [LOOP.width / 2, 0.9 * h]], labelAt: [1.5 * LOOP.width, 0.55 * h] };
      return g(
        [TOOL.sturdy, TOOL.scissors, TOOL.iron, TOOL.machine, TOOL.paper],
        [
          L(
            `수선 패턴의 당김 고리를 질긴 천에서 3장 자릅니다 (${f(w)} × ${f(h)} cm, 시접 포함).`,
            `Cut 3 pull loops from sturdy fabric with the alteration pattern (${f(w)} x ${f(h)} cm, allowance included).`,
            `Corta 3 presillas de tela resistente con el patrón de arreglos (${f(w)} × ${f(h)} cm, margen incluido).`,
          ),
          L(`긴 변 둘을 가운데로 접고 다시 반으로 접어 ${f(LOOP.width)} cm 폭으로 다림질한 뒤 가장자리를 박습니다.`, `Fold both long edges to the middle, fold in half again to ${f(LOOP.width)} cm wide, press and edge-stitch.`, `Dobla los dos bordes largos al centro y otra vez por la mitad hasta ${f(LOOP.width)} cm de ancho, plancha y pespuntea.`),
          L("양 끝을 접어 넣고, 허리단 안쪽 양옆과 뒤중심에 고리 모양으로 단단히 박습니다.", "Turn the ends under and sew each loop firmly inside the waistband, at both sides and at centre back.", "Mete los extremos y cose cada presilla bien firme por dentro de la cinturilla, a los lados y en el centro trasero."),
          L("손목을 넣어 당겨 보고 박음질이 버티는지 확인합니다.", "Put your wrist through and pull to check the stitching holds.", "Mete la muñeca y tira para comprobar que la costura aguanta."),
        ],
        [loop],
      );
    }
    case "elbow-patch":
    case "underarm-patch": {
      const elbow = how === "elbow-patch";
      const [pw, ph] = elbow ? ELBOW_PATCH : UNDERARM_PATCH;
      const names = elbow ? L("팔꿈치 덧댐", "Elbow patch", "Codera") : L("겨드랑이 덧댐", "Underarm patch", "Refuerzo de axila");
      const many = elbow ? L("팔꿈치 덧댐", "elbow patches", "coderas") : L("겨드랑이 덧댐", "underarm patches", "refuerzos de axila");
      const piece = fabricPiece(id(elbow ? "elbow" : "underarm"), nm(names), oval(pw / 2, ph / 2), { count: 2, onFold: false, mirror: false }, [[pw / 2, 0.2 * ph], [pw / 2, 0.8 * ph]]);
      return g(
        [elbow ? TOOL.sturdy : TOOL.soft, TOOL.scissors, TOOL.chalk, TOOL.pins, TOOL.iron, TOOL.machine, TOOL.paper],
        [
          L(
            `수선 패턴의 ${many.ko}을 2장 자릅니다. 완성 ${f(pw)} × ${f(ph)} cm에 시접 ${f(sa)} cm가 둘레에 붙어 있습니다.`,
            `Cut 2 ${many.en} from the alteration pattern: ${f(pw)} x ${f(ph)} cm finished, with ${f(sa)} cm allowance all round.`,
            `Corta 2 ${many.es} con el patrón de arreglos: ${f(pw)} × ${f(ph)} cm terminadas, con ${f(sa)} cm de margen alrededor.`,
          ),
          L(`시접 ${f(sa)} cm를 안으로 접어 다림질합니다. 곡선은 시접에 가윗집을 넣으면 잘 접힙니다.`, `Press the ${f(sa)} cm allowance under; clip it round the curves so it turns smoothly.`, `Plancha hacia dentro el margen de ${f(sa)} cm; da piquetes en las curvas para que se doble bien.`),
          elbow
            ? L("옷을 입고 팔을 굽혀 팔꿈치 끝을 초크로 표시합니다. 덧댐 가운데를 그 점에 맞춥니다.", "Put the garment on, bend your arm and chalk the point of the elbow. Centre the patch on that mark.", "Ponte la prenda, dobla el brazo y marca la punta del codo. Centra la codera en esa marca.")
            : L("옷을 뒤집어 겨드랑이 솔기에 덧댐 가운데를 맞춥니다.", "Turn the garment inside out and centre the patch on the underarm seam.", "Da la vuelta a la prenda y centra el refuerzo en la costura de la axila."),
          L("소매를 펼쳐 놓고 가장자리를 따라 박습니다. 소매가 좁으면 손바느질로 감칩니다.", "Lay the sleeve open and stitch round the edge; on a narrow sleeve, slip-stitch it by hand.", "Abre la manga y cose alrededor del borde; si la manga es estrecha, cóselo a mano a punto escondido."),
        ],
        [piece],
      );
    }
    case "fasteners":
      return top
        ? g(
            [TOOL.magnets, TOOL.ripper, TOOL.needle],
            [
              L("단추를 떼고, 단춧구멍은 안쪽에서 감침질로 막거나 그대로 둡니다.", "Remove the buttons; slip-stitch the buttonholes shut from the inside, or leave them.", "Quita los botones; cierra los ojales por dentro a punto escondido, o déjalos."),
              L("자석 단추를 단추 자리와 단춧구멍 자리에 마주 보게 답니다.", "Sew the magnetic buttons where the buttons and buttonholes were, facing each other.", "Cose los botones imantados donde estaban los botones y los ojales, enfrentados."),
              L("단추를 원래 자리에 겉에만 다시 달면 겉모습은 그대로입니다.", "Sew the old buttons back on the outside only, for the same look.", "Vuelve a coser los botones solo por fuera para que se vea igual."),
            ],
          )
        : g(
            [TOOL.pull, TOOL.ripper, TOOL.needle],
            [
              L("지퍼 손잡이 구멍에 큰 당김 고리를 끼웁니다.", "Clip the large pull onto the zip's slider.", "Engancha el tirador grande en el carro de la cremallera."),
              L("허리 단추를 떼고, 같은 자리에 후크와 걸이를 답니다.", "Remove the waist button and sew a hook and bar in its place.", "Quita el botón de la cintura y cose un corchete en su lugar."),
            ],
          );
    case "tailor":
      return g([], [L("이 수선은 집에서 하기 어렵습니다. 수선 의뢰서를 수선집에 가져가십시오.", "This one is hard to do at home. Take the alteration order to a tailor.", "Este arreglo es difícil en casa. Lleva la orden de arreglos a un taller.")], [], { tailor: true });
  }
}

// Every piece of every guide, as one pattern to print at actual size.
export function alterationPattern(garment: GarmentKind, measures: Record<string, number>, fabric: Fabric, guides: readonly Guide[]): Pattern | null {
  if (NOT_WORN.includes(garment)) return null;
  const pieces = guides.flatMap((g) => g.pieces);
  if (!pieces.length) return null;
  return {
    garment,
    sizeLabel: "Original",
    fabric,
    pieces,
    notes: [
      L(
        "번호는 수선 가이드의 번호와 같습니다. '종이 본'은 천을 자르지 않고, 옷에 대고 선을 옮겨 그리는 데 씁니다.",
        "The numbers match the alteration guide. A paper template is not cut from fabric: lay it on the garment and trace its lines.",
        "Los números coinciden con la guía de arreglos. Una plantilla de papel no se corta en tela: colócala sobre la prenda y calca sus líneas.",
      ),
    ],
    measures: { ...measures },
    unmeasured: [],
  };
}
