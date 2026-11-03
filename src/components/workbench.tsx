"use client";

import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AlterPanel } from "@/components/alter-panel";
import { LangProvider, useLang } from "@/components/lang";
import { CuttingPanel } from "@/components/cutting-panel";
import { PatternPreview, SeamChecks } from "@/components/pattern-preview";
import { PhotoOverlay } from "@/components/photo-overlay";
import { PocketEditor } from "@/components/pocket-editor";
import { SizePanel } from "@/components/size-panel";
import { Badge, buttonGhost, buttonPrimary, Card, Segmented, Tabs } from "@/components/ui";
import { resizeToJpeg } from "@/lib/client/resize";
import { combineMeasurements } from "@/lib/measure/combine";
import type { FailedRun, OkRun, PhotoView } from "@/lib/client/types";
import type { Pt } from "@/lib/geom/point";
import { draft, REQUIRED } from "@/lib/pattern/draft";
import { layOut } from "@/lib/pattern/layout";
import { DEFAULTS, MEASURE_NAME, type MeasuresOf } from "@/lib/pattern/measures";
import { EXAMPLES } from "@/lib/pattern/examples";
import { patternPdf } from "@/lib/pattern/pdf";
import { pocketFromPhoto, pocketKinds, withPockets, type Pocket } from "@/lib/pattern/pockets";
import type { FoundPocket } from "@/lib/measure/pockets";
import { loadPdfFont } from "@/lib/pattern/pdf-font";
import { isTop, NOT_WORN, type Fabric, type GarmentKind } from "@/lib/pattern/types";
import { SIZE_KEYS, type SizeKey } from "@/lib/rules/fit-tolerance";
import { grade, gradedLabel } from "@/lib/rules/grading";
import type { Mine } from "@/lib/size/decide";
import type { ReadTable } from "@/lib/size/table";
import type { ReadComplaints } from "@/lib/fit/read-complaint";
import { L, type Lang, type Local } from "@/lib/i18n/lang";
import { GARMENT_NAME } from "@/lib/i18n/names";

const TOP_KEYS = ["length", "chest", "shoulder", "hem", "sleeve", "sleeveOpening", "bicep", "armholeDepth", "neckWidth", "shoulderDrop", "frontNeckDrop", "backNeckDrop"];
const KEYS: Record<GarmentKind, string[]> = {
  "t-shirt": TOP_KEYS,
  "long-sleeve": TOP_KEYS,
  sweatshirt: [...TOP_KEYS, "ribHeight"],
  dress: TOP_KEYS,
  shirt: TOP_KEYS,
  hoodie: [...TOP_KEYS, "hoodHeight", "hoodDepth", "ribHeight"],
  pants: ["waist", "hip", "frontRise", "outseam", "thigh", "legOpening", "backRiseExtra"],
  skirt: ["length", "hem"],
  "a-line-skirt": ["waist", "length", "hem"],
  "eco-bag": ["width", "height", "handleLength", "handleWidth", "gusset"],
  apron: ["width", "length", "bibWidth", "bibHeight", "neckStrap", "tieLength"],
  cushion: ["width", "height", "overlap"],
  pouch: ["width", "height", "gusset"],
};

const RUN_ERRORS: Record<string, Local> = {
  live_disabled: L("지금은 사진을 잴 수 없습니다. 예시에서 결과를 먼저 보십시오.", "Photos can't be measured right now. Have a look at the examples meanwhile.", "Ahora no se pueden medir fotos. Mientras tanto, mira los ejemplos."),
  visitor_limit: L("오늘 잴 수 있는 사진을 모두 썼습니다. 내일 다시 해 주십시오.", "You've used today's photos. Please try again tomorrow.", "Ya usaste las fotos de hoy. Vuelve a intentarlo mañana."),
  daily_limit: L("오늘은 더 이상 사진을 잴 수 없습니다. 내일 다시 해 주십시오.", "Today's measuring is used up. Please try again tomorrow.", "Hoy ya no se pueden medir más fotos. Vuelve a intentarlo mañana."),
  too_large: L("사진이 너무 큽니다.", "The photo is too large.", "La foto es demasiado grande."),
  api_failed: L("재기가 끝나지 않았습니다. 잠시 후 다시 해 주십시오.", "Measuring didn't finish. Please try again in a moment.", "La medición no terminó. Vuelve a intentarlo en un momento."),
};

const STAGE: Record<FailedRun["stage"], Local> = {
  cost: L("오늘 사용량 확인", "Checking today's use", "Revisando el uso de hoy"),
  identify: L("옷 종류 알아보기", "Telling what the garment is", "Reconociendo la prenda"),
  segment: L("옷·A4 찾기", "Finding the garment and the A4 sheet", "Buscando la prenda y la hoja A4"),
  scale: L("A4로 cm 맞추기", "Setting centimetres from the A4 sheet", "Calculando centímetros con la hoja A4"),
  measure: L("치수 재기", "Measuring", "Midiendo"),
  draft: L("패턴 만들기", "Drafting the pattern", "Trazando el patrón"),
};

// Everything else the workbench says, in each language.
const T = {
  autoPick: L("사진 보고 고르기", "Tell from the photo", "Según la foto"),
  identified: L("사진에서 알아본 옷", "Recognised as", "Reconocida como"),
  fillTypical: L("사진 없이 보통 치수로 채우기", "No photo? Fill in typical measurements", "¿Sin foto? Rellena con medidas típicas"),
  failedRun: L("이 사진으로 재지 못했습니다.", "Couldn't measure this photo.", "No se pudo medir esta foto."),
  noServer: L("서버에 연결하지 못했습니다.", "Couldn't reach the server.", "No se pudo conectar con el servidor."),
  tabMeasure: L("치수", "Measurements", "Medidas"),
  toMeasure: L("재기", "to measure", "por medir"),
  tabPattern: L("패턴", "Pattern", "Patrón"),
  pockets: L("주머니 달기", "Add pockets", "Añadir bolsillos"),
  garmentMeasures: L("이 옷의 치수", "This garment's measurements", "Medidas de esta prenda"),
  tabCut: L("원단 배치", "Cutting layout", "Colocación en la tela"),
  tabSize: L("사이즈", "Size", "Talla"),
  woven: L("우븐 (직물)", "Woven", "Tejido plano"),
  knit: L("니트 (편물)", "Knit", "Tejido de punto"),
  byA4: L("A4 기준", "From A4", "Con A4"),
  byTape: L("줄자 기준", "From tape", "Con cinta"),
  upload: L("옷 사진 올리기", "Upload a garment photo", "Sube una foto de la prenda"),
  uploadHint: L("바닥에 펴고 A4 용지와 함께, 옷 전체가 나오게 위에서 찍은 사진", "Lay it flat with an A4 sheet, the whole garment in frame, shot from above", "Extendida en el suelo, con una hoja A4, la prenda entera en la foto, desde arriba"),
  paused: L("지금은 사진을 올릴 수 없습니다. 예시에서 결과를 보십시오.", "Photo uploads aren't available right now. See the examples for results.", "Ahora no se pueden subir fotos. Mira los ejemplos para ver resultados."),
  addPhoto: L("사진 추가 (뒷면 등)", "Add another photo, such as the back", "Añade otra foto, como la espalda"),
  back: L("뒷면", "Back", "Espalda"),
  measureAgain: L("다시 재기", "Measure again", "Volver a medir"),
  measure: L("치수 재기", "Measure", "Medir"),
  tapShoulders: L("어깨점 직접 찍기", "Tap the shoulder points", "Marca los puntos del hombro"),
  removePhoto: L("사진 빼기", "Remove photo", "Quitar foto"),
  tapHelp: L(
    "사진에서 양쪽 어깨점(소매 솔기가 어깨선과 만나는 점)을 하나씩 누르십시오. 단색 옷은 솔기가 잘 안 보여 자동으로 찾은 점이 0.5–3 cm 벗어날 수 있습니다.",
    "Tap both shoulder points on the photo (where the sleeve seam meets the shoulder seam). On a plain garment the seam is hard to see, and the point found on its own can be 0.5–3 cm off.",
    "Toca en la foto los dos puntos del hombro (donde la costura de la manga se une a la del hombro). En una prenda lisa la costura se ve poco y el punto encontrado solo puede desviarse 0,5–3 cm.",
  ),
  measureWithTaps: L("이 점으로 다시 재기", "Measure with these points", "Medir con estos puntos"),
  cancel: L("취소", "Cancel", "Cancelar"),
  noA4: L("A4 없이 재려면 줄자로 잰 치수 하나", "No A4 sheet? Give one measurement taken with a tape", "¿Sin hoja A4? Da una medida tomada con cinta"),
  measureWithValue: L("이 값으로 재기", "Measure with this", "Medir con este valor"),
  laidOut: L("펴 놓은 상태", "How it lies", "Cómo está extendida"),
  sleeve: L("소매", "Sleeve", "Manga"),
  notes: L("측정 메모", "Measuring notes", "Notas de medición"),
  goodPhoto: L("이렇게 찍으면 잘 잽니다", "For a good photo", "Para una buena foto"),
  tips: [
    L("단색 바닥, 목이 화면 위쪽, 소매와 다리는 몸판에서 떨어뜨려 펴기", "A plain floor, the neck at the top, sleeves and legs spread away from the body", "Suelo liso, el cuello arriba, mangas y piernas separadas del cuerpo"),
    L("A4 네 모서리가 모두 보이게. 옷 위에 올려도 됩니다", "All four corners of the A4 sheet in view. It can lie on the garment", "Las cuatro esquinas de la hoja A4 a la vista. Puede ir encima de la prenda"),
    L("옷 둘레에 손가락 한두 마디 여유, 폰은 바닥과 평행하게", "A finger or two of floor around the garment, the phone parallel to the floor", "Uno o dos dedos de suelo alrededor de la prenda, el móvil paralelo al suelo"),
    L("앞면과 뒷면을 한 장씩 찍으면 서로 모자란 값을 채웁니다", "A photo of the front and one of the back fill each other's gaps", "Una foto del delantero y otra de la espalda se completan entre sí"),
  ],
  measureIntro: L("사진에서 잰 단면입니다(cm). 줄자로 잰 값이 있으면 고쳐 쓰십시오.", "Flat measurements taken from the photo (cm). If you have tape values, type them in.", "Medidas en plano tomadas de la foto (cm). Si tienes medidas con cinta, escríbelas."),
  measureIntroNoPhoto: L("이 옷의 단면 치수입니다(cm). 사진을 올려 재거나, 줄자로 잰 값을 넣으십시오.", "This garment's flat measurements (cm). Upload a photo to measure them, or type tape values.", "Medidas en plano de esta prenda (cm). Sube una foto para medirlas o escribe las medidas con cinta."),
  photo: L("사진", "Photo", "Foto"),
  typed: L("직접", "Typed", "Escrito"),
  typical: L("보통 값", "Typical value", "Valor típico"),
  measureFirst: L("재단 전 측정", "Measure before cutting", "Mide antes de cortar"),
  differs: L("사진마다 다름", "Photos disagree", "Las fotos no coinciden"),
  max: L("최댓값", "at most", "como máximo"),
  min: L("최솟값", "at least", "como mínimo"),
  fromPhoto: L("사진", "photo", "foto"),
  notMeasured: L("사진으로 못 잼", "Not measurable from a photo", "No se puede medir en la foto"),
  outOfRange: L(" cm는 옷에서 나올 수 없는 값", "is outside what a garment can measure", "está fuera de lo posible para una prenda"),
  cantMeasure: L("사진으로 잴 수 없음", "Can't be measured from a photo", "No se puede medir en la foto"),
  patternIntro: L("시접·식서·맞춤점·골선이 들어간 1:1 패턴입니다. A4에 나눠 인쇄합니다.", "A 1:1 pattern with seam allowance, grainlines, notches and fold lines, printed on A4 pages.", "Un patrón 1:1 con margen de costura, hilo, piquetes y doblez, impreso en hojas A4."),
  baseSize: L("원래 사이즈", "Original size", "Talla original"),
  original: L("원본", "Original", "Original"),
  measureFirstList: L("패턴을 만들려면 먼저 재 주십시오:", "To draft the pattern, first measure:", "Para trazar el patrón, primero mide:"),
  pdf: L("A4 패턴 PDF 받기", "Download the A4 pattern PDF", "Descargar el patrón en PDF (A4)"),
  pdfBusy: L("PDF 만드는 중…", "Making the PDF…", "Creando el PDF…"),
  printNotes: L("인쇄와 봉제 메모", "Printing and sewing notes", "Notas de impresión y costura"),
  printActual: L(
    "인쇄할 때 “실제 크기(100%)”를 고르고, 첫 장의 10 cm 사각형을 자로 확인하십시오.",
    "Print at “Actual size (100%)” and check the 10 cm square on the first page with a ruler.",
    "Imprime a “Tamaño real (100 %)” y comprueba con una regla el cuadrado de 10 cm de la primera hoja.",
  ),
  cutIntro: L("갖고 있는 원단(자투리 포함)에 이 패턴이 들어가는지, 어디에 놓고 자를지 봅니다.", "Whether this pattern fits on the fabric you have (scraps included), and where to place each piece.", "Si este patrón cabe en la tela que tienes (retazos incluidos) y dónde colocar cada pieza."),
  cutNeedsPattern: L("패턴을 만들고 나면 배치해 볼 수 있습니다.", "Once the pattern is drafted you can lay it out.", "Cuando el patrón esté trazado podrás colocarlo."),
  sizeIntro: L("잘 맞는 이 옷을 기준으로, 쇼핑몰 실측표에서 핏이 같은 사이즈를 고릅니다.", "Taking this well-fitting garment as the reference, pick the size in a shop's size chart that fits the same way.", "Con esta prenda que te queda bien como referencia, elige en la tabla de medidas de una tienda la talla que queda igual."),
  sizeNeedsMeasures: L("먼저 사진으로 재거나 치수를 입력해 주십시오.", "First measure from a photo or type the measurements.", "Primero mide con una foto o escribe las medidas."),
  reading: L("사진을 읽는 중 · 보통 10–30초", "Reading the photo · usually 10–30 seconds", "Leyendo la foto · suele tardar 10–30 segundos"),
  readingSteps: [
    L("옷과 A4 용지 찾기", "Find the garment and the A4 sheet", "Encontrar la prenda y la hoja A4"),
    L("A4 네 모서리로 cm 맞추기", "Set centimetres from the A4 sheet's corners", "Calcular centímetros con las esquinas de la hoja A4"),
    L("소매가 펴졌는지, 주름이 많은지 보기", "Check that the sleeves are spread and how wrinkled it is", "Ver si las mangas están extendidas y cuántas arrugas hay"),
    L("치수와 오차 재기", "Measure, with a ± for each value", "Medir, con un ± para cada valor"),
  ],
};

type Source = "photo" | "edited" | "default" | "missing";

export interface WorkbenchProps {
  live: boolean;
  initial?: { photo?: PhotoView; run?: OkRun; garment: GarmentKind; fabric: Fabric };
  garmentPicker?: boolean; // off when a sample page picks the garment
  placeholder?: ReactNode; // shown in place of the photo when there is none and no upload
  editedLabel?: Local; // badge for initialEdits values, e.g. "줄자" or "예시 값"
  sampleTable?: { read: ReadTable; src: string };
  initialEdits?: Record<string, string>; // e.g. tape-measured values for a sample
  initialTab?: Tab;
  sampleText?: { garment: GarmentKind; text: string; read: ReadComplaints }; // a wearer's words already sorted by Spark
  mode?: "pattern" | "alter"; // alter: the photo, then the wearer's words and the work order
}

export type Tab = "measure" | "pattern" | "cut" | "size";

interface Shot {
  photo: PhotoView;
  file?: Blob;
  run?: OkRun;
  failure?: Local;
  missingA4?: boolean;
  taps?: Pt[]; // shoulder points tapped on this photo, as fractions of its size
  tapping?: boolean;
}

const SIDE: Record<string, Local> = { front: L("앞면", "Front", "Delantero"), back: L("뒷면", "Back", "Espalda"), unclear: L("앞뒤 불분명", "Front or back unclear", "Delantero o espalda, no está claro") };
const WRINKLE: Record<string, Local> = {
  flat: L("평평함", "Flat", "Lisa"),
  "some wrinkles": L("주름 조금", "A few wrinkles", "Algunas arrugas"),
  "heavily wrinkled or bunched": L("많이 구겨짐", "Very wrinkled", "Muy arrugada"),
};
const SLEEVE_STATE: Record<string, Local> = {
  "spread flat": L("펴짐", "spread flat", "extendida"),
  "folded over the body": L("몸판 위로 접힘", "folded over the body", "doblada sobre el cuerpo"),
  "folded under or hidden": L("아래로 접혀 안 보임", "folded under, hidden", "doblada por debajo, no se ve"),
  "bent or twisted": L("굽음", "bent", "torcida"),
  "not a sleeve": L("소매 아님", "not a sleeve", "no es una manga"),
};

// The page passes its language in: a part of the page rendered after the layout (it waits for the
// URL) doesn't reliably see the layout's language on the server, so the workbench sets it again
// for everything inside it.
export function Workbench(props: WorkbenchProps & { lang?: Lang }) {
  const outer = useLang();
  return (
    <LangProvider lang={props.lang ?? outer}>
      <WorkbenchInner {...props} />
    </LangProvider>
  );
}

function WorkbenchInner({ live, initial, sampleTable, sampleText, initialEdits, initialTab, garmentPicker = true, placeholder, editedLabel = T.typed, mode = "pattern" }: WorkbenchProps) {
  const alter = mode === "alter";
  const lang: Lang = useLang();
  const [garment, setGarment] = useState<GarmentKind>(initial?.garment ?? "t-shirt");
  // Until a kind is picked by hand, the photo tells the kind (and knit or woven). A page that
  // arrives with a garment (a landing card, a sample) has it picked already.
  const [auto, setAuto] = useState(live && !initial);
  const [picked, setPicked] = useState(!!initial);
  const [fabric, setFabric] = useState<Fabric>(initial?.fabric ?? "woven");
  const [shots, setShots] = useState<Shot[]>(initial?.photo ? [{ photo: initial.photo, run: initial.run }] : []);
  const [busy, setBusy] = useState<number | null>(null);
  const [ref, setRef] = useState<{ key: string; cm: string }>({ key: "chest", cm: "" });
  const [edits, setEdits] = useState<Record<string, string>>(initialEdits ?? {});
  const [baseSize, setBaseSize] = useState("M");
  const [steps, setSteps] = useState(0);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState<Tab>(initialTab ?? "measure");
  const [filled, setFilled] = useState<Record<string, string>>({}); // typical values filled in, until changed


  // Typical ready-to-wear measurements for this garment, to draft a pattern without a photo.
  function fillTypical() {
    const ex = EXAMPLES[garment];
    // The values are one garment's: that garment shows as picked.
    setAuto(false);
    setPicked(true);
    const vals = Object.fromEntries(Object.entries(ex.m).map(([k, v]) => [k, String(v)]));
    setEdits((all) => ({ ...all, ...vals }));
    setFilled(vals);
    setFabric(ex.fabric);
    if (!alter) setTab("pattern");
  }
  const filledLabel = EXAMPLES[garment].size === "One" ? L("보통 크기", "Typical size", "Tamaño típico") : L(`기성복 ${EXAMPLES[garment].size}`, `Typical ${EXAMPLES[garment].size}`, `Talla ${EXAMPLES[garment].size} típica`);
  const typicalNote = (() => {
    const size = EXAMPLES[garment].size;
    return size === "One"
      ? L("보통 크기로 그립니다. 치수는 언제든 고칠 수 있습니다.", "Drafted at a typical size; change any value whenever you like.", "Se traza a un tamaño típico; cambia cualquier valor cuando quieras.")
      : L(
          `기성복 ${size} 사이즈의 보통 치수로 그립니다. 내 옷과는 다르니 줄자로 재서 고쳐 쓰십시오.`,
          `Drafted from typical ready-to-wear size ${size} measurements. Your garment will differ, so measure it with a tape and change them.`,
          `Se traza con medidas típicas de la talla ${size} de confección. Tu prenda será distinta: mídela con cinta y cámbialas.`,
        );
  })();
  const fillButton = (
    <div className="space-y-1.5">
      <button type="button" onClick={fillTypical} className={`${buttonGhost} w-full`}>
        {T.fillTypical[lang]}
      </button>
      <p className="text-center text-xs text-muted">{typicalNote[lang]}</p>
    </div>
  );

  const update = (i: number, s: Partial<Shot>) => setShots((all) => all.map((x, j) => (j === i ? { ...x, ...s } : x)));

  async function choose(f: File) {
    const r = await resizeToJpeg(f);
    setShots((all) => [...all, { photo: { src: r.url, width: r.width, height: r.height }, file: r.blob }]);
    if (!picked && !shots.some((s) => s.run)) setAuto(true);
    setActive(shots.length);
  }

  async function analyse(i: number) {
    const shot = shots[i];
    if (!shot?.file) return;
    setBusy(i);
    update(i, { failure: undefined });
    const form = new FormData();
    form.set("photo", shot.file, "photo.jpg");
    form.set("garment", auto ? "auto" : garment);
    form.set("fabric", fabric);
    if (ref.cm) {
      form.set("refKey", ref.key);
      form.set("refCm", ref.cm);
    }
    if (shot.taps?.length && isTop(garment)) form.set("shoulders", JSON.stringify(shot.taps));
    try {
      const res = await fetch("/api/photo", { method: "POST", body: form });
      const body = await res.json();
      // The photo lay on its side: the server stood it upright, and its marks are on the turned one.
      if (body.upright) {
        const { jpeg, width, height } = body.upright as { jpeg: string; width: number; height: number };
        const blob = new Blob([Uint8Array.from(atob(jpeg), (c) => c.charCodeAt(0))], { type: "image/jpeg" });
        update(i, { photo: { src: URL.createObjectURL(blob), width, height }, file: blob, taps: undefined });
      }
      if (!res.ok) update(i, { failure: RUN_ERRORS[body.error] ?? T.failedRun });
      else if (!body.run.ok) {
        const f = body.run as FailedRun;
        const detail = f.detail;
        update(i, { failure: L(`${STAGE[f.stage].ko}: ${detail.ko}`, `${STAGE[f.stage].en}: ${detail.en}`, `${STAGE[f.stage].es}: ${detail.es}`), missingA4: f.missingA4, run: undefined });
        if (f.stage === "identify") setAuto(false);
        // Taken for the wrong kind: the chips show what it was taken for, ready to be changed.
        else if (body.identified && body.identified.garment !== "something else") {
          setGarment(body.identified.garment);
          setAuto(false);
        }
      } else {
        const run = body.run as OkRun;
        if (run.identified) {
          setGarment(run.garment);
          if (run.identified.fabric !== "unclear") setFabric(run.identified.fabric);
          setAuto(false);
        }
        update(i, { run, failure: undefined, missingA4: false, tapping: false });
      }
    } catch {
      update(i, { failure: T.noServer });
    } finally {
      setBusy(null);
    }
  }

  // Several photos of the same garment: each value from the photo that measured it most surely.
  const okRuns = shots.flatMap((s) => (s.run && s.run.garment === garment ? [s.run] : []));
  const combined = useMemo(() => combineMeasurements(okRuns.map((r) => r.measured.values)), [okRuns]);

  // Each value: what the user typed, else the photos', else a typical default, else missing.
  const rows = KEYS[garment].map((key) => {
    const measured = combined.values[key] as { cm: number; plusMinusCm: number; bound?: string } | undefined;
    const refused = measured ? undefined : okRuns.flatMap((r) => r.measured.refused).find((r) => r.key === key);
    const conflict = combined.conflicts.find((c) => c.key === key);
    const fallback = (DEFAULTS[garment] as Record<string, number>)[key];
    const typed = edits[key];
    const value = typed !== undefined && typed !== "" ? Number(typed) : measured ? Math.round(measured.cm * 10) / 10 : fallback;
    const source: Source = typed !== undefined && typed !== "" ? "edited" : measured ? "photo" : fallback !== undefined ? "default" : "missing";
    return { key, measured, refused, conflict, value, source, required: REQUIRED[garment].includes(key) };
  });
  const measures = Object.fromEntries(rows.filter((r) => r.value !== undefined && Number.isFinite(r.value)).map((r) => [r.key, r.value]));
  const missing = rows.filter((r) => r.required && r.source === "missing");

  // measures is rebuilt every render; its JSON is what changes.
  const measuresKey = JSON.stringify(measures);
  const base = useMemo(() => {
    const m = JSON.parse(measuresKey) as Partial<MeasuresOf[GarmentKind]>;
    try {
      return draft({ garment, measures: grade(garment, m, steps), fabric, sizeLabel: steps ? gradedLabel(baseSize, steps) : "Original" });
    } catch {
      return null; // a required measurement is missing; the page says which
    }
  }, [garment, fabric, steps, baseSize, measuresKey]);
  // Pockets belong to a garment: another garment's pieces have other names.
  const [pocketsBy, setPocketsBy] = useState<Partial<Record<GarmentKind, Pocket[]>>>({});
  // Pockets measured on the photos go on the pattern until the pockets are changed by hand.
  const foundKey = JSON.stringify(okRuns.flatMap((r) => r.pockets ?? []));
  const photoPockets = useMemo(
    () => (base ? (JSON.parse(foundKey) as FoundPocket[]).flatMap((f, i) => pocketFromPhoto(base, f, `p${i + 1}`) ?? []) : []),
    [base, foundKey],
  );
  const pockets = useMemo(() => pocketsBy[garment] ?? photoPockets, [pocketsBy, garment, photoPockets]);
  const setPockets: Dispatch<SetStateAction<Pocket[]>> = (f) => setPocketsBy((all) => ({ ...all, [garment]: typeof f === "function" ? f(all[garment] ?? photoPockets) : f }));
  const pattern = useMemo(() => (base ? withPockets(base, pockets) : null), [base, pockets]);
  const sheet = useMemo(() => (pattern ? layOut(pattern) : null), [pattern]);

  const [pdfBusy, setPdfBusy] = useState(false);
  async function downloadPdf() {
    if (!pattern) return;
    setPdfBusy(true);
    try {
      // The Korean PDF carries a Korean font, fetched only when it is needed.
      const { bytes } = await patternPdf(pattern, { createdFor: "Rub-Off", lang, font: await loadPdfFont(lang) });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `rub-off-${garment}-${pattern.sizeLabel}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfBusy(false);
    }
  }

  const mine: Partial<Record<SizeKey, Mine>> = Object.fromEntries(
    rows
      // Only real values: not defaults, and not a photo value that is only a bound (a hidden crotch).
      .filter((r) => (SIZE_KEYS as readonly string[]).includes(r.key) && (r.source === "edited" || (r.source === "photo" && !r.measured?.bound)))
      .map((r) => [r.key, { cm: r.value! }]),
  );

  const shot = shots[Math.min(active, shots.length - 1)];
  // The photo to show in another fabric: the one in view if it was measured as this garment, else the first that was.
  const measuredShot = [shot, ...shots].find((s) => s?.file && s.run?.garment === garment);
  const garmentPhoto = measuredShot?.file && measuredShot.run ? { file: measuredShot.file, word: measuredShot.run.concepts[0] } : undefined;
  const activeIndex = Math.min(active, shots.length - 1);
  const top = isTop(garment);
  const tabs = [
    {
      value: "measure" as const,
      label: (
        <>
          {T.tabMeasure[lang]}
          {missing.length > 0 && (
            <span className="ml-1.5 rounded-full bg-mark px-1.5 text-xs text-white">
              {lang === "ko" ? `${T.toMeasure.ko} ${missing.length}` : `${missing.length} ${T.toMeasure[lang]}`}
            </span>
          )}
        </>
      ),
    },
    { value: "pattern" as const, label: T.tabPattern[lang] },
    { value: "cut" as const, label: T.tabCut[lang] },
    { value: "size" as const, label: T.tabSize[lang] },
  ];

  const measureList = (
    <div className="divide-y divide-line">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium">{MEASURE_NAME[r.key]?.[lang] ?? r.key}</span>
              {r.source === "photo" && <Badge tone="chalk">{T.photo[lang]}</Badge>}
              {r.source === "edited" && <Badge tone={filled[r.key] === edits[r.key] ? "warn" : "ink"}>{(initialEdits?.[r.key] === edits[r.key] ? editedLabel : filled[r.key] === edits[r.key] ? filledLabel : T.typed)[lang]}</Badge>}
              {r.source === "default" && <Badge tone="warn">{T.typical[lang]}</Badge>}
              {r.source === "missing" && <Badge tone="mark">{T.measureFirst[lang]}</Badge>}
              {r.conflict && <Badge tone="warn">{T.differs[lang]}</Badge>}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">
              {r.source === "photo" && r.measured && `${r.measured.bound === "max" ? `${T.max[lang]} · ` : r.measured.bound === "min" ? `${T.min[lang]} · ` : ""}± ${r.measured.plusMinusCm.toFixed(1)} cm`}
              {r.conflict && ` · ${r.conflict.values.map((x) => x.toFixed(1)).join(" / ")}`}
              {r.source === "edited" && r.measured && `${T.fromPhoto[lang]} ${r.measured.cm.toFixed(1)}`}
              {r.source === "default" && T.notMeasured[lang]}
              {r.source === "missing" &&
                (r.refused
                  ? lang === "ko"
                    ? `사진 값 ${r.refused.cm.toFixed(1)}${T.outOfRange.ko}`
                    : `${T.fromPhoto[lang]} ${r.refused.cm.toFixed(1)} ${T.outOfRange[lang]}`
                  : T.cantMeasure[lang])}
            </p>
          </div>
          <label className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${r.source === "missing" ? "border-mark bg-mark-soft" : "border-line bg-field"}`}>
            <input
              inputMode="decimal"
              value={edits[r.key] ?? (r.value !== undefined ? String(r.value) : "")}
              placeholder="—"
              onChange={(e) => setEdits({ ...edits, [r.key]: e.target.value })}
              className="num w-14 bg-transparent text-right text-base font-semibold outline-none"
            />
            <span className="text-xs text-muted">cm</span>
          </label>
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
      {/* Left: the photo canvas */}
      <div className="space-y-4 lg:sticky lg:top-16">
        <Card className="space-y-4">
          {garmentPicker && (
            <div className="flex flex-wrap gap-1.5">
              {live && (
                <button
                  type="button"
                  onClick={() => setAuto(true)}
                  className={`press rounded-full px-3 py-1.5 text-sm ${auto ? "bg-ink text-sand" : "bg-well text-muted hover:text-ink"}`}
                >
                  {T.autoPick[lang]}
                </button>
              )}
              {(Object.keys(GARMENT_NAME) as GarmentKind[]).filter((g) => !alter || !NOT_WORN.includes(g)).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setGarment(g);
                    setAuto(false);
                    setPicked(true);
                  }}
                  className={`press rounded-full px-3 py-1.5 text-sm ${!auto && g === garment ? "bg-ink text-sand" : "bg-well text-muted hover:text-ink"}`}
                >
                  {GARMENT_NAME[g][lang]}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <Segmented
              size="sm"
              value={fabric}
              onChange={setFabric}
              options={[
                { value: "woven", label: T.woven[lang] },
                { value: "knit", label: T.knit[lang] },
              ]}
            />
            {shot?.run?.garment === garment && (
              <Badge tone={shot.run.scale.source === "tape" ? "warn" : "chalk"}>
                {`${(shot.run.scale.source !== "tape" ? T.byA4 : T.byTape)[lang]} · ±${(shot.run.scale.relError * 100).toFixed(1)}%`}
              </Badge>
            )}
          </div>

          {shot ? (
            <div className="mx-auto w-full" style={{ maxWidth: `calc((100svh - 260px) * ${(shot.photo.width / shot.photo.height).toFixed(3)})` }}>
              <PhotoOverlay
                photo={shot.photo}
                run={shot.run?.garment === garment ? shot.run : undefined}
                taps={shot.taps}
                onTap={shot.tapping ? (p) => update(activeIndex, { taps: [...(shot.taps ?? []), p].slice(-2) }) : undefined}
              />
            </div>
          ) : live ? (
            <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-muted bg-well text-center transition-colors hover:border-ink">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-2xl text-sand">+</span>
              <span className="font-medium">{T.upload[lang]}</span>
              <span className="max-w-64 text-sm text-muted">{T.uploadHint[lang]}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
            </label>
          ) : (
            (placeholder ?? <p className="rounded-xl bg-well p-6 text-sm text-muted">{T.paused[lang]}</p>)
          )}
          {shots.length === 0 && garmentPicker && fillButton}

          {(shots.length > 1 || (live && shots.length > 0)) && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {shots.map((sh, i) => (
                <button
                  key={sh.photo.src}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`relative h-16 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${i === activeIndex ? "border-ink" : "border-transparent opacity-70 hover:opacity-100"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- local thumbnails */}
                  <img src={sh.photo.src} alt="" className="h-full w-full object-cover" />
                  <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${sh.run ? "bg-ok" : sh.failure ? "bg-mark" : "bg-line"}`} />
                </button>
              ))}
              {live && (
                <label
                  className="flex h-16 w-14 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted hover:border-ink"
                  title={T.addPhoto[lang]}
                >
                  <span className="text-lg leading-none">+</span>
                  {T.back[lang]}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
                </label>
              )}
            </div>
          )}

          {shot?.file && busy !== activeIndex && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => analyse(activeIndex)} disabled={busy !== null} className={buttonPrimary}>
                {(shot.run ? T.measureAgain : T.measure)[lang]}
              </button>
              {shot.run && top && !shot.tapping && (
                <button onClick={() => update(activeIndex, { tapping: true, taps: [] })} className={buttonGhost}>
                  {T.tapShoulders[lang]}
                </button>
              )}
              <button
                onClick={() => {
                  setShots((all) => all.filter((_, j) => j !== activeIndex));
                  setActive(0);
                }}
                className="ml-auto text-sm text-muted underline"
              >
                {T.removePhoto[lang]}
              </button>
            </div>
          )}
          {busy === activeIndex && <Analyzing lang={lang} />}

          {shot?.tapping && (
            <div className="space-y-2 rounded-xl bg-chalk-soft p-3 text-sm">
              <p>{T.tapHelp[lang]}</p>
              <div className="flex gap-2">
                <button onClick={() => analyse(activeIndex)} disabled={(shot.taps?.length ?? 0) === 0 || busy !== null} className={buttonPrimary}>
                  {T.measureWithTaps[lang]} · {shot.taps?.length ?? 0}/2
                </button>
                <button onClick={() => update(activeIndex, { taps: [], tapping: false })} className="text-muted underline">
                  {T.cancel[lang]}
                </button>
              </div>
            </div>
          )}
          {shot?.failure && <p className="rounded-xl bg-mark-soft p-3 text-sm">{shot.failure[lang]}</p>}
          {shot?.missingA4 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-soft p-3 text-sm">
              {T.noA4[lang]}
              <select value={ref.key} onChange={(e) => setRef({ ...ref, key: e.target.value })} className="rounded-lg border border-line bg-field px-2 py-1">
                {KEYS[garment]
                  .filter((k) => REQUIRED[garment].includes(k))
                  .map((k) => (
                    <option key={k} value={k}>
                      {MEASURE_NAME[k]?.[lang] ?? k}
                    </option>
                  ))}
              </select>
              <input inputMode="decimal" value={ref.cm} onChange={(e) => setRef({ ...ref, cm: e.target.value })} className="w-16 rounded-lg border border-line bg-field px-2 py-1" /> cm
              <button onClick={() => analyse(activeIndex)} disabled={!ref.cm || busy !== null} className={buttonPrimary}>
                {T.measureWithValue[lang]}
              </button>
            </div>
          )}

          {shot?.run?.garment === garment && (
            <div className="space-y-2">
              {shot.run.identified && shot.run.identified.garment !== "something else" && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted">{T.identified[lang]}</span>
                  <Badge tone="chalk">{GARMENT_NAME[shot.run.identified.garment][lang]}</Badge>
                  {shot.run.identified.fabric !== "unclear" && <Badge>{(shot.run.identified.fabric === "knit" ? T.knit : T.woven)[lang]}</Badge>}
                </div>
              )}
              {shot.run.layout && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted">{T.laidOut[lang]}</span>
                  <Badge>{SIDE[shot.run.layout.side][lang]}</Badge>
                  <Badge tone={shot.run.layout.wrinkles === "flat" ? "ok" : "warn"}>{WRINKLE[shot.run.layout.wrinkles][lang]}</Badge>
                  {shot.run.layout.sleeves.map((sl) => (
                    <Badge key={sl.number} tone={sl.state === "spread flat" ? "ok" : "mark"}>
                      {T.sleeve[lang]} {sl.number} · {SLEEVE_STATE[sl.state][lang]}
                    </Badge>
                  ))}
                </div>
              )}
              {shot.run.measured.notes.length > 0 && (
                <details className="text-sm text-muted">
                  <summary className="cursor-pointer select-none">
                    {T.notes[lang]} · {shot.run.measured.notes.length}
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {shot.run.measured.notes.map((n, i) => (
                      <li key={i}>{n[lang]}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </Card>
        {shots.length === 0 && !placeholder && (
          <Card className="text-sm text-muted">
            <p className="mb-2 font-medium text-ink">{T.goodPhoto[lang]}</p>
            <ul className="list-disc space-y-1 pl-5">
              {T.tips.map((t) => (
                <li key={t.en}>{t[lang]}</li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Right: the steps; on the alteration screen, the wearer's words and the work order */}
      {alter ? (
        <Card className="space-y-6">
          <AlterPanel garment={garment} fabric={fabric} measures={measures as Record<string, number>} sampleText={sampleText?.garment === garment ? sampleText : undefined} />
          <details className="no-print rounded-xl border border-line p-4">
            <summary className="cursor-pointer select-none text-[15px] font-medium">
              {T.garmentMeasures[lang]}
              {missing.length > 0 && <span className="ml-2 rounded-full bg-mark px-1.5 text-xs text-white">{lang === "ko" ? `${T.toMeasure.ko} ${missing.length}` : `${missing.length} ${T.toMeasure[lang]}`}</span>}
            </summary>
            <p className="mb-2 mt-3 text-sm text-muted">{(okRuns.length ? T.measureIntro : T.measureIntroNoPhoto)[lang]}</p>
            {measureList}
          </details>
        </Card>
      ) : (
      <Card className="space-y-5">
        <Tabs value={tab} onChange={setTab} options={tabs} />

        {tab === "measure" && (
          <div>
            <p className="mb-4 text-sm text-muted">{(okRuns.length ? T.measureIntro : T.measureIntroNoPhoto)[lang]}</p>
            {measureList}
          </div>
        )}

        {tab === "pattern" && (
          <div className="space-y-4">
            <p className="mb-4 text-sm text-muted">{T.patternIntro[lang]}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-muted">{T.baseSize[lang]}</span>
                <input value={baseSize} onChange={(e) => setBaseSize(e.target.value)} className="w-14 rounded-lg border border-line bg-field px-2 py-1 text-center" />
              </label>
              <Segmented size="sm" value={steps} onChange={setSteps} options={[-2, -1, 0, 1, 2].map((v) => ({ value: v, label: v === 0 ? T.original[lang] : gradedLabel(baseSize, v) }))} />
            </div>
            {missing.length > 0 && (
              <div className="space-y-3 rounded-xl bg-mark-soft p-3 text-sm">
                <p>
                  {T.measureFirstList[lang]} {missing.map((m) => MEASURE_NAME[m.key]?.[lang] ?? m.key).join(", ")}
                </p>
                {garmentPicker && fillButton}
              </div>
            )}
            {sheet && pattern && (
              <>
                <PatternPreview sheet={sheet} dims />
                {base && pocketKinds(base).length > 0 && (
                  <details className="rounded-xl border border-line p-4" open={pockets.length > 0 || undefined}>
                    <summary className="cursor-pointer select-none text-[15px] font-medium">
                      {T.pockets[lang]}
                      {pockets.length > 0 && <span className="ml-2 text-sm text-muted">{pockets.length}</span>}
                    </summary>
                    <div className="mt-3">
                      <PocketEditor base={base} pockets={pockets} setPockets={setPockets} />
                    </div>
                  </details>
                )}
                <SeamChecks sheet={sheet} />
                <button onClick={downloadPdf} disabled={pdfBusy} className={`${buttonPrimary} w-full`}>
                  {(pdfBusy ? T.pdfBusy : T.pdf)[lang]}
                </button>
                <details className="text-sm text-muted">
                  <summary className="cursor-pointer select-none">{T.printNotes[lang]}</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>{T.printActual[lang]}</li>
                    {pattern.notes.map((n, i) => (
                      <li key={i}>{n[lang]}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </div>
        )}

        {tab === "cut" && (
          <div>
            <p className="mb-4 text-sm text-muted">{T.cutIntro[lang]}</p>
            {pattern ? <CuttingPanel pattern={pattern} live={live} garmentPhoto={garmentPhoto} /> : <p className="text-sm text-muted">{T.cutNeedsPattern[lang]}</p>}
          </div>
        )}

        {tab === "size" && (
          <div>
            <p className="mb-4 text-sm text-muted">{T.sizeIntro[lang]}</p>
            {Object.keys(mine).length === 0 ? <p className="text-sm text-muted">{T.sizeNeedsMeasures[lang]}</p> : <SizePanel mine={mine} fabric={fabric} sample={sampleTable} />}
          </div>
        )}
      </Card>
      )}
    </div>
  );
}

// While SAM 3.1 and Muse Spark work: what is being done, in order. One request does all of it,
// so no step is shown as finished before the answer comes back.
function Analyzing({ lang }: { lang: Lang }) {
  return (
    <div className="rounded-xl bg-well p-4">
      <p className="mb-2 text-sm font-medium">{T.reading[lang]}</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
        {T.readingSteps.map((s) => (
          <li key={s.en}>{s[lang]}</li>
        ))}
      </ol>
    </div>
  );
}
