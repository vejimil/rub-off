// Pockets on a top, from SAM 3.1's "pocket" masks and Spark's word on what each one is. Size and
// place come from the masks on the floor plane, in the top's own frame (hem levelled, y down), so
// they can be set on the drafted front: across from the centre line, down from the high point of
// the shoulder, which is where the draft puts its origin. A pocket let into a seam, one Spark says
// is no pocket, and a patch pocket partly covered are left out, each with a note.

import type { Pt } from "../geom/point.ts";
import { L, type Local } from "../i18n/lang.ts";
import type { PocketKind } from "../pattern/pockets.ts";
import type { PocketCheck } from "../photo/pocket-check.ts";

export interface FoundPocket {
  kind: PocketKind;
  host: "front" | "back";
  fromCentre: number; // its top centre, cm across from the centre line (0 for a kangaroo)
  belowNeck: number; // its top, cm down from the high point of the shoulder
  width: number; // finished, cm; a kangaroo's whole width
  height: number;
  plusMinusCm: number;
  regions: number[]; // which masks it came from (0-based)
}

const MIN_CM = 6, MAX_CM = 50;
const SAME_CM = 3; // two patch pockets this close in place are the same pocket
const COVERED_REL = 0.1; // a partly covered half of a kangaroo: its other half sets the width

export function pocketsFromMasks(
  polys: readonly Pt[][], // in the top's frame
  check: PocketCheck,
  // neckY: the two side neck points' mean height, which the length is measured from too.
  at: { centreX: number; neckY: number; side: "front" | "back"; rel: number },
): { pockets: FoundPocket[]; notes: Local[] } {
  const notes: Local[] = [];
  const answer = (i: number) => check.pockets.find((p) => p.number === i + 1);
  const box = (poly: readonly Pt[]) => {
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };
  const pm = (w: number, h: number, extra = 0) => Math.round((0.5 + (at.rel + extra) * Math.max(w, h)) * 10) / 10;
  const found: FoundPocket[] = [];
  let seamed = 0, covered = 0, outside = 0;

  // Patch pockets: each mask whole in view is one.
  polys.forEach((poly, i) => {
    const a = answer(i);
    if (!a || poly.length < 3) return;
    if (a.kind === "not a pocket") return;
    if (a.kind === "set into a seam, or a welt pocket") return void seamed++;
    if (!a.kind.startsWith("patch")) return;
    if (a.view !== "whole pocket in view") return void covered++;
    const b = box(poly);
    const width = b.maxX - b.minX, height = b.maxY - b.minY;
    if (width < MIN_CM || height < MIN_CM || width > MAX_CM || height > MAX_CM) return void outside++;
    const p: FoundPocket = {
      kind: a.kind === "patch pocket with square corners" ? "patch" : "round",
      host: at.side,
      fromCentre: Math.abs((b.minX + b.maxX) / 2 - at.centreX),
      belowNeck: b.minY - at.neckY,
      width,
      height,
      plusMinusCm: pm(width, height),
      regions: [i],
    };
    // The same pocket twice (two masks on one pocket): keep the first.
    if (!found.some((q) => q.kind === p.kind && Math.abs(q.fromCentre - p.fromCentre) < SAME_CM && Math.abs(q.belowNeck - p.belowNeck) < SAME_CM)) found.push(p);
  });

  // A kangaroo: one mask across the centre, or two halves either side of a zip. It is symmetric,
  // so its width is twice its reach from the centre line on the best side in view.
  const halves = polys.map((poly, i) => ({ poly, i, a: answer(i) })).filter((x) => x.a && x.poly.length >= 3 && x.a.kind.includes("kangaroo"));
  if (halves.length) {
    const whole = halves.filter((x) => x.a!.view === "whole pocket in view");
    const use = whole.length ? whole : halves;
    const boxes = use.map((x) => box(x.poly));
    const reach = Math.max(...boxes.map((b) => Math.max(Math.abs(b.minX - at.centreX), Math.abs(b.maxX - at.centreX))));
    const top = Math.min(...boxes.map((b) => b.minY)), bottom = Math.max(...boxes.map((b) => b.maxY));
    const width = 2 * reach, height = bottom - top;
    if (width < MIN_CM || height < MIN_CM || width > MAX_CM || height > MAX_CM) outside++;
    else {
      found.push({ kind: "kangaroo", host: at.side, fromCentre: 0, belowNeck: top - at.neckY, width, height, plusMinusCm: pm(width, height, whole.length ? 0 : COVERED_REL), regions: use.map((x) => x.i) });
      if (!whole.length) notes.push(L("캥거루 주머니가 일부 가려져 있어 크기의 ±를 키웠습니다.", "The kangaroo pocket is partly covered, so its size carries a larger ±.", "El bolsillo canguro está en parte tapado, así que su tamaño lleva un ± mayor."));
    }
  }

  if (found.length)
    notes.push(
      L(
        `사진에서 주머니 ${found.length}개를 찾아 크기와 위치를 패턴에 옮겼습니다. 주머니 달기에서 고칠 수 있습니다.`,
        `${found.length} pocket${found.length > 1 ? "s were" : " was"} found in the photo and put on the pattern at the size and place measured. You can change ${found.length > 1 ? "them" : "it"} under Add pockets.`,
        `Se ${found.length > 1 ? "encontraron" : "encontró"} ${found.length} bolsillo${found.length > 1 ? "s" : ""} en la foto y se ${found.length > 1 ? "pusieron" : "puso"} en el patrón con el tamaño y la posición medidos. Puedes cambiarlo en Añadir bolsillos.`,
      ),
    );
  if (seamed) notes.push(L("솔기에 끼운 주머니나 입술 주머니는 옷의 솔기를 바꾸므로 패턴에 넣지 않았습니다.", "A pocket set into a seam, or a welt pocket, changes the garment's own seams, so it isn't on the pattern.", "Un bolsillo metido en una costura, o de ojal, cambia las costuras de la prenda, así que no está en el patrón."));
  if (covered) notes.push(L("일부가 가려진 주머니는 재지 않았습니다. 펴서 다시 찍거나 주머니 달기에서 직접 넣어 주십시오.", "A pocket that is partly covered wasn't measured. Smooth it out and take the photo again, or add it under Add pockets.", "Un bolsillo tapado en parte no se midió. Alísalo y vuelve a hacer la foto, o añádelo en Añadir bolsillos."));
  if (outside) notes.push(L("주머니로 보기에는 너무 작거나 큰 곳이 있어 넣지 않았습니다.", "Something marked as a pocket was too small or too large to be one, so it was left out.", "Algo marcado como bolsillo era demasiado pequeño o grande para serlo, así que se dejó fuera."));
  return { pockets: found, notes };
}
