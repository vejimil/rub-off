"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlterPanel } from "@/components/alter-panel";
import { LangProvider, useLang } from "@/components/lang";
import { CuttingPanel } from "@/components/cutting-panel";
import { PatternPreview, SeamChecks } from "@/components/pattern-preview";
import { PhotoOverlay } from "@/components/photo-overlay";
import { SizePanel } from "@/components/size-panel";
import { Badge, buttonGhost, buttonPrimary, Card, Segmented, Tabs } from "@/components/ui";
import { resizeToJpeg } from "@/lib/client/resize";
import { combineMeasurements } from "@/lib/measure/combine";
import type { FailedRun, OkRun, PhotoView } from "@/lib/client/types";
import type { Pt } from "@/lib/geom/point";
import { draft, REQUIRED } from "@/lib/pattern/draft";
import { layOut } from "@/lib/pattern/layout";
import { DEFAULTS, MEASURE_NAME, type MeasuresOf } from "@/lib/pattern/measures";
import { patternPdf } from "@/lib/pattern/pdf";
import { loadPdfFont } from "@/lib/pattern/pdf-font";
import type { Fabric, GarmentKind } from "@/lib/pattern/types";
import { SIZE_KEYS, type SizeKey } from "@/lib/rules/fit-tolerance";
import { grade, gradedLabel } from "@/lib/rules/grading";
import type { Mine } from "@/lib/size/decide";
import type { ReadTable } from "@/lib/size/table";
import type { ReadComplaints } from "@/lib/fit/read-complaint";
import { L, type Lang, type Local } from "@/lib/i18n/lang";
import { GARMENT_NAME } from "@/lib/i18n/names";

const KEYS: Record<GarmentKind, string[]> = {
  shirt: ["length", "chest", "shoulder", "hem", "sleeve", "sleeveOpening", "bicep", "armholeDepth", "neckWidth", "shoulderDrop", "frontNeckDrop", "backNeckDrop"],
  "t-shirt": ["length", "chest", "shoulder", "hem", "sleeve", "sleeveOpening", "bicep", "armholeDepth", "neckWidth", "shoulderDrop", "frontNeckDrop", "backNeckDrop"],
  hoodie: [
    "length",
    "chest",
    "shoulder",
    "hem",
    "sleeve",
    "sleeveOpening",
    "bicep",
    "armholeDepth",
    "neckWidth",
    "shoulderDrop",
    "frontNeckDrop",
    "backNeckDrop",
    "hoodHeight",
    "hoodDepth",
    "ribHeight",
  ],
  pants: ["waist", "hip", "frontRise", "outseam", "thigh", "legOpening", "backRiseExtra"],
  skirt: ["length", "hem"],
  "eco-bag": ["width", "height", "handleLength", "handleWidth", "gusset"],
};

const RUN_ERRORS: Record<string, Local> = {
  live_disabled: L("지금은 사진 분석을 쉬고 있습니다. 예시에서 결과를 먼저 보십시오.", "Photo measuring is paused right now. Have a look at the examples meanwhile.", "La medición por foto está en pausa. Mientras tanto, mira los ejemplos."),
  visitor_limit: L("오늘 분석할 수 있는 사진 수를 모두 썼습니다.", "You've used today's photos.", "Ya usaste las fotos de hoy."),
  daily_limit: L("오늘 분석할 수 있는 양을 모두 썼습니다. 내일 다시 해 주십시오.", "Today's measuring is used up. Please try again tomorrow.", "Hoy ya no se pueden medir más fotos. Vuelve a intentarlo mañana."),
  too_large: L("사진이 너무 큽니다.", "The photo is too large.", "La foto es demasiado grande."),
  api_failed: L("분석이 끝나지 않았습니다. 잠시 후 다시 해 주십시오.", "Measuring didn't finish. Please try again in a moment.", "La medición no terminó. Vuelve a intentarlo en un momento."),
};

const STAGE: Record<FailedRun["stage"], Local> = {
  cost: L("비용 확인", "Checking the cost", "Revisando el costo"),
  segment: L("옷·A4 찾기", "Finding the garment and the A4 sheet", "Buscando la prenda y la hoja A4"),
  scale: L("A4로 cm 맞추기", "Setting centimetres from the A4 sheet", "Calculando centímetros con la hoja A4"),
  measure: L("치수 재기", "Measuring", "Midiendo"),
  draft: L("패턴 만들기", "Drafting the pattern", "Trazando el patrón"),
};

// Everything else the workbench says, in each language.
const T = {
  failedRun: L("사진을 분석하지 못했습니다.", "Couldn't measure this photo.", "No se pudo medir esta foto."),
  noServer: L("서버에 연결하지 못했습니다.", "Couldn't reach the server.", "No se pudo conectar con el servidor."),
  tabMeasure: L("치수", "Measurements", "Medidas"),
  toMeasure: L("재기", "to measure", "por medir"),
  tabPattern: L("패턴", "Pattern", "Patrón"),
  tabFit: L("맞춤·수선", "Fit & alterations", "Ajuste y arreglos"),
  tabCut: L("원단 배치", "Cutting layout", "Colocación en la tela"),
  tabSize: L("사이즈", "Size", "Talla"),
  woven: L("우븐 (직물)", "Woven", "Tejido plano"),
  knit: L("니트 (편물)", "Knit", "Tejido de punto"),
  byA4: L("A4 기준", "From A4", "Con A4"),
  byTape: L("줄자 기준", "From tape", "Con cinta"),
  upload: L("옷 사진 올리기", "Upload a garment photo", "Sube una foto de la prenda"),
  uploadHint: L("바닥에 펴고, A4 용지와 함께, 옷 전체가 들어오게 위에서", "Lay it flat with an A4 sheet, the whole garment in frame, shot from above", "Extendida en el suelo, con una hoja A4, la prenda entera en la foto, desde arriba"),
  paused: L("지금은 사진 올리기를 쉬고 있습니다. 예시에서 결과를 보십시오.", "Photo uploads are paused right now. See the examples for results.", "Las fotos están en pausa. Mira los ejemplos para ver resultados."),
  addPhoto: L("뒷면 등 사진 추가", "Add another photo, such as the back", "Añade otra foto, como la espalda"),
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
  laidOut: L("놓인 모양", "How it lies", "Cómo está extendida"),
  sleeve: L("소매", "Sleeve", "Manga"),
  notes: L("측정 메모", "Measuring notes", "Notas de medición"),
  goodPhoto: L("잘 나오는 사진", "For a good photo", "Para una buena foto"),
  tips: [
    L("단색 바닥, 목이 화면 위쪽, 소매와 다리는 몸판에서 떨어뜨려 펴기", "A plain floor, the neck at the top, sleeves and legs spread away from the body", "Suelo liso, el cuello arriba, mangas y piernas separadas del cuerpo"),
    L("A4 네 모서리가 모두 보이게. 옷 위에 올려도 됩니다", "All four corners of the A4 sheet in view. It can lie on the garment", "Las cuatro esquinas de la hoja A4 a la vista. Puede ir encima de la prenda"),
    L("옷 둘레에 손가락 한두 마디 여유, 폰은 바닥과 평행하게", "A finger or two of floor around the garment, the phone parallel to the floor", "Uno o dos dedos de suelo alrededor de la prenda, el móvil paralelo al suelo"),
    L("앞면과 뒷면을 한 장씩 찍으면 서로 보완합니다", "A photo of the front and one of the back fill each other's gaps", "Una foto del delantero y otra de la espalda se completan entre sí"),
  ],
  measureIntro: L("사진에서 잰 단면입니다(cm). 줄자로 잰 값이 있으면 고쳐 쓰십시오.", "Flat measurements taken from the photo (cm). If you have tape values, type them in.", "Medidas en plano tomadas de la foto (cm). Si tienes medidas con cinta, escríbelas."),
  photo: L("사진", "Photo", "Foto"),
  typed: L("직접", "Typed", "Escrito"),
  typical: L("보통 값", "Typical value", "Valor típico"),
  measureFirst: L("재단 전 측정", "Measure before cutting", "Mide antes de cortar"),
  differs: L("사진마다 다름", "Photos disagree", "Las fotos no coinciden"),
  max: L("최댓값", "at most", "como máximo"),
  min: L("최솟값", "at least", "como mínimo"),
  fromPhoto: L("사진", "photo", "foto"),
  notMeasured: L("사진으로 못 잼", "Not measurable from a photo", "No se puede medir en la foto"),
  outOfRange: L("은 가능 범위 밖", "is outside what a garment can measure", "está fuera de lo posible para una prenda"),
  cantMeasure: L("사진으로 잴 수 없음", "Can't be measured from a photo", "No se puede medir en la foto"),
  patternIntro: L("시접·식서·너치·골선이 들어간 1:1 패턴. A4로 나눠 인쇄합니다.", "A 1:1 pattern with seam allowance, grainlines, notches and fold lines, printed on A4 pages.", "Un patrón 1:1 con margen de costura, hilo, piquetes y doblez, impreso en hojas A4."),
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
  fitIntro: L(
    "이 옷을 입을 사람에게 맞춥니다. 몸 치수와 불편한 점에서, 도식화에 고칠 곳을 표시한 수선 의뢰서를 만듭니다.",
    "Fit this garment to the person who wears it. From body measurements and what bothers them, you get an alteration order with each change marked on a technical drawing.",
    "Ajusta esta prenda a quien la lleva. Con sus medidas y lo que le molesta, obtienes una orden de arreglos con cada cambio marcado en un dibujo técnico.",
  ),
  fitNoPhoto: L(
    "고칠 옷을 바닥에 펴고 A4 용지와 함께 찍어 올리면, 그 옷의 치수로 의뢰서를 만듭니다. 사진이 없으면 보통 치수로 그립니다.",
    "Photograph the garment you want to alter, lying flat with an A4 sheet, and the order uses its own measurements. Without a photo it uses typical ones.",
    "Fotografía la prenda que quieres arreglar, extendida con una hoja A4, y la orden usará sus propias medidas. Sin foto, usa medidas típicas.",
  ),
  cutIntro: L("가진 원단(자투리 포함)에 이 패턴이 들어가는지, 어디에 놓고 자를지.", "Whether this pattern fits on the fabric you have (scraps included), and where to place each piece.", "Si este patrón cabe en la tela que tienes (retazos incluidos) y dónde colocar cada pieza."),
  cutNeedsPattern: L("패턴이 만들어지면 배치할 수 있습니다.", "Once the pattern is drafted you can lay it out.", "Cuando el patrón esté trazado podrás colocarlo."),
  sizeIntro: L("잘 맞는 이 옷을 기준으로, 실측표에서 같은 핏인 사이즈를 고릅니다.", "Taking this well-fitting garment as the reference, pick the size in a shop's size chart that fits the same way.", "Con esta prenda que te queda bien como referencia, elige en la tabla de medidas de una tienda la talla que queda igual."),
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
}

type Tab = "measure" | "pattern" | "fit" | "cut" | "size";

interface Shot {
  photo: PhotoView;
  file?: Blob;
  run?: OkRun;
  failure?: Local;
  missingA4?: boolean;
  taps?: Pt[]; // shoulder points tapped on this photo, as fractions of its size
  tapping?: boolean;
}

const TOPS: readonly GarmentKind[] = ["shirt", "t-shirt", "hoodie"];

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

function WorkbenchInner({ live, initial, sampleTable, sampleText, initialEdits, initialTab, garmentPicker = true, placeholder, editedLabel = T.typed }: WorkbenchProps) {
  const lang: Lang = useLang();
  const [garment, setGarment] = useState<GarmentKind>(initial?.garment ?? "t-shirt");
  const [fabric, setFabric] = useState<Fabric>(initial?.fabric ?? "woven");
  const [shots, setShots] = useState<Shot[]>(initial?.photo ? [{ photo: initial.photo, run: initial.run }] : []);
  const [busy, setBusy] = useState<number | null>(null);
  const [ref, setRef] = useState<{ key: string; cm: string }>({ key: "chest", cm: "" });
  const [edits, setEdits] = useState<Record<string, string>>(initialEdits ?? {});
  const [baseSize, setBaseSize] = useState("M");
  const [steps, setSteps] = useState(0);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState<Tab>(initialTab ?? "measure");


  const update = (i: number, s: Partial<Shot>) => setShots((all) => all.map((x, j) => (j === i ? { ...x, ...s } : x)));

  async function choose(f: File) {
    const r = await resizeToJpeg(f);
    setShots((all) => [...all, { photo: { src: r.url, width: r.width, height: r.height }, file: r.blob }]);
    setActive(shots.length);
  }

  async function analyse(i: number) {
    const shot = shots[i];
    if (!shot?.file) return;
    setBusy(i);
    update(i, { failure: undefined });
    const form = new FormData();
    form.set("photo", shot.file, "photo.jpg");
    form.set("garment", garment);
    form.set("fabric", fabric);
    if (ref.cm) {
      form.set("refKey", ref.key);
      form.set("refCm", ref.cm);
    }
    if (shot.taps?.length && TOPS.includes(garment)) form.set("shoulders", JSON.stringify(shot.taps));
    try {
      const res = await fetch("/api/photo", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) update(i, { failure: RUN_ERRORS[body.error] ?? T.failedRun });
      else if (!body.run.ok) {
        const f = body.run as FailedRun;
        const detail = f.detail;
        update(i, { failure: L(`${STAGE[f.stage].ko}: ${detail.ko}`, `${STAGE[f.stage].en}: ${detail.en}`, `${STAGE[f.stage].es}: ${detail.es}`), missingA4: f.missingA4, run: undefined });
      } else update(i, { run: body.run, failure: undefined, missingA4: false, tapping: false });
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
  const pattern = useMemo(() => {
    const m = JSON.parse(measuresKey) as Partial<MeasuresOf[GarmentKind]>;
    try {
      return draft({ garment, measures: grade(garment, m, steps), fabric, sizeLabel: steps ? gradedLabel(baseSize, steps) : "Original" });
    } catch {
      return null; // a required measurement is missing; the page says which
    }
  }, [garment, fabric, steps, baseSize, measuresKey]);
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
  const activeIndex = Math.min(active, shots.length - 1);
  const isTop = TOPS.includes(garment);
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
    { value: "fit" as const, label: T.tabFit[lang] },
    { value: "cut" as const, label: T.tabCut[lang] },
    { value: "size" as const, label: T.tabSize[lang] },
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
      {/* Left: the photo canvas */}
      <div className="space-y-4 lg:sticky lg:top-16">
        <Card className="space-y-4">
          {garmentPicker && (
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(GARMENT_NAME) as GarmentKind[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGarment(g)}
                  className={`press rounded-full px-3 py-1.5 text-sm ${g === garment ? "bg-ink text-sand" : "bg-well text-muted hover:text-ink"}`}
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
            <label className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-muted bg-well text-center transition-colors hover:border-ink">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-2xl text-sand">+</span>
              <span className="font-medium">{T.upload[lang]}</span>
              <span className="max-w-64 text-sm text-muted">{T.uploadHint[lang]}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
            </label>
          ) : (
            (placeholder ?? <p className="rounded-xl bg-well p-6 text-sm text-muted">{T.paused[lang]}</p>)
          )}

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
              {shot.run && isTop && !shot.tapping && (
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

      {/* Right: the steps */}
      <Card className="space-y-5">
        <Tabs value={tab} onChange={setTab} options={tabs} />

        {tab === "measure" && (
          <div>
            <p className="mb-4 text-sm text-muted">{T.measureIntro[lang]}</p>
            <div className="divide-y divide-line">
              {rows.map((r) => (
                <div key={r.key} className="flex items-center gap-3 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{MEASURE_NAME[r.key]?.[lang] ?? r.key}</span>
                      {r.source === "photo" && <Badge tone="chalk">{T.photo[lang]}</Badge>}
                      {r.source === "edited" && <Badge tone="ink">{(initialEdits?.[r.key] === edits[r.key] ? editedLabel : T.typed)[lang]}</Badge>}
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
              <p className="rounded-xl bg-mark-soft p-3 text-sm">
                {T.measureFirstList[lang]} {missing.map((m) => MEASURE_NAME[m.key]?.[lang] ?? m.key).join(", ")}
              </p>
            )}
            {sheet && pattern && (
              <>
                <PatternPreview sheet={sheet} dims />
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

        {tab === "fit" && (
          <div>
            <p className="mb-6 text-[15px] text-muted">{T.fitIntro[lang]}</p>
            {live && okRuns.length === 0 && <p className="mb-6 rounded-xl bg-chalk-soft p-4 text-[15px]">{T.fitNoPhoto[lang]}</p>}
            <AlterPanel
              garment={garment}
              fabric={fabric}
              measures={measures as Record<string, number>}
              sampleText={sampleText?.garment === garment ? sampleText : undefined}
            />
          </div>
        )}

        {tab === "cut" && (
          <div>
            <p className="mb-4 text-sm text-muted">{T.cutIntro[lang]}</p>
            {pattern ? <CuttingPanel pattern={pattern} live={live} /> : <p className="text-sm text-muted">{T.cutNeedsPattern[lang]}</p>}
          </div>
        )}

        {tab === "size" && (
          <div>
            <p className="mb-4 text-sm text-muted">{T.sizeIntro[lang]}</p>
            {Object.keys(mine).length === 0 ? <p className="text-sm text-muted">{T.sizeNeedsMeasures[lang]}</p> : <SizePanel mine={mine} fabric={fabric} sample={sampleTable} />}
          </div>
        )}
      </Card>
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
