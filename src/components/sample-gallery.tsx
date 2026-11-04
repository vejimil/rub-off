"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GarmentFlat } from "@/components/garment-flat";
import { PiecesOutline } from "@/components/pattern-preview";
import { LangProvider, useLang } from "@/components/lang";
import type { Lang } from "@/lib/i18n/lang";
import { Workbench } from "@/components/workbench";
import type { SampleRun } from "@/lib/client/types";
import { draft } from "@/lib/pattern/draft";
import { EXAMPLES } from "@/lib/pattern/examples";
import { drawingSheet } from "@/lib/pattern/layout";
import { isTop, type GarmentKind } from "@/lib/pattern/types";
import shorts from "@/lib/sample/shorts-run.json";
import tablesBottoms from "@/lib/sample/size-table-bottoms-read.json";
import tablesTops from "@/lib/sample/size-table-read.json";
import { COMPLAINT_EXAMPLE, TEE_COMPLAINT } from "@/lib/sample/complaints";
import tee from "@/lib/sample/tee-run.json";
import { L, type Local } from "@/lib/i18n/lang";
import { GARMENT_NAME } from "@/lib/i18n/names";
import type { ReadTable } from "@/lib/size/table";
import { fromComplaint, guarded } from "@/lib/fit/alter";
import { flatFor } from "@/lib/fit/flat";
import { parse, type ReadComplaints } from "@/lib/fit/read-complaint";

// The sample page: two garments the owner photographed (replayed runs, no API call), the T-shirt
// altered from an example text, and the wheelchair trousers altered from typical measurements.
// (The shorts photo hides the crotch, so hip and thigh are unmeasured and no flat can be drawn:
// no alteration example for them.)

interface Sample {
  id: string;
  label: Local;
  garment: GarmentKind;
  run?: SampleRun;
  sub: Local;
  tab?: "measure" | "pattern";
  alter?: Record<Lang, { text: string; read: ReadComplaints }>; // opens on the alteration screen, with this text read
  tape?: Record<string, string>; // the owner's tape values for what the photo can't see
}

const TOPS_TABLE = { read: tablesTops as ReadTable, src: "/samples/size-table.png" };
const BOTTOMS_TABLE = { read: tablesBottoms as ReadTable, src: "/samples/size-table-bottoms.png" };

// Tee: the owner's tape values for what a photo can't see (the neck drops are below the rib).
const TEE_TAPE = { frontNeckDrop: "12", backNeckDrop: "2.5" };
const TEE_RUN = tee as unknown as SampleRun, SHORTS_RUN = shorts as unknown as SampleRun;
const BOTH = L(
  "만든 수선 의뢰서와 직접 고치는 가이드",
  "an order for a tailor and a guide to do it yourself",
  "una orden para el taller y una guía para hacerlo tú",
);
const withBoth = (head: Local) => L(`${head.ko} ${BOTH.ko}`, `${head.en}: ${BOTH.en}`, `${head.es}: ${BOTH.es}`);

const SAMPLES: Sample[] = [
  {
    id: "tee",
    label: GARMENT_NAME["t-shirt"],
    garment: "t-shirt",
    run: TEE_RUN,
    tape: TEE_TAPE,
    sub: L("실제 사진, 어깨점은 사진에서 직접 찍음", "A real photo; the shoulder points were tapped on it", "Una foto real; los puntos del hombro se marcaron a mano"),
  },
  { id: "shorts", label: L("반바지", "Shorts", "Pantalón corto"), garment: "pants", run: SHORTS_RUN, sub: L("실제 사진", "A real photo", "Una foto real") },
  {
    id: "tee-alter",
    label: GARMENT_NAME["t-shirt"],
    garment: "t-shirt",
    run: TEE_RUN,
    tape: TEE_TAPE,
    alter: TEE_COMPLAINT,
    sub: withBoth(L("직접 찍은 사진과 '소매와 길이가 길고 품이 크다'는 예시 글로", "From the photo and an example text saying the sleeves and body are too long and it's baggy", "A partir de la foto y de un texto de ejemplo que dice que mangas y largo sobran y que queda holgada")),
  },
  {
    id: "pants",
    label: L("휠체어 바지", "Wheelchair trousers", "Pantalón para silla de ruedas"),
    garment: "pants",
    alter: COMPLAINT_EXAMPLE,
    sub: withBoth(L("휠체어를 타는 사람이 고무줄 바지의 불편한 점을 적은 예시 글로", "From what a wheelchair user wrote about their elastic-waist trousers (an example)", "A partir de lo que una persona en silla de ruedas escribió sobre su pantalón de cintura elástica (un ejemplo)")),
  },
];

const T = {
  photoGroup: L("실제 사진으로 잰 예시", "Measured from real photos", "Medido en fotos reales"),
  alterGroup: L("수선하기", "Alterations", "Arreglos"),
  tape: L("줄자", "Tape", "Cinta"),
  exampleValue: L("예시 값", "Example", "Ejemplo"),
  tryMine: L("내 옷 사진으로 해 보기", "Try it with a photo of your garment", "Pruébalo con una foto de tu prenda"),
};
const drawnFrom = (size: string) =>
  L(
    `이 예시는 사진 대신 기성복 ${size} 사이즈 고무줄 바지의 보통 치수를 썼습니다. 아래 '이 옷의 치수'에서 값을 고치면 결과가 바로 바뀝니다.`,
    `This example uses typical measurements of ready-to-wear size ${size} elastic-waist trousers instead of a photo. Change a value under "This garment's measurements" and the result updates.`,
    `Este ejemplo usa medidas típicas de un pantalón de cintura elástica de talla ${size} en lugar de una foto. Cambia un valor en «Medidas de esta prenda» y el resultado se actualiza.`,
  );

// The page passes its language in, for the same reason as the workbench.
export function SampleGallery({ initial, lang }: { initial?: string; lang?: Lang }) {
  const outer = useLang();
  return (
    <LangProvider lang={lang ?? outer}>
      <Gallery initial={initial} />
    </LangProvider>
  );
}

function Gallery({ initial }: { initial?: string }) {
  const lang = useLang();
  const [id, setId] = useState(SAMPLES.some((x) => x.id === initial) ? initial! : SAMPLES[0].id);
  const s = SAMPLES.find((x) => x.id === id)!;
  const ex = EXAMPLES[s.garment];
  const top = isTop(s.garment);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        {[
          { title: T.photoGroup, items: SAMPLES.filter((x) => !x.alter) },
          { title: T.alterGroup, items: SAMPLES.filter((x) => x.alter) },
        ].map((group) => (
          <div key={group.title.en}>
            <p className="mb-2 text-sm font-medium text-muted">{group.title[lang]}</p>
            <div className="flex gap-2">
        {group.items.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setId(x.id)}
            className={`press flex w-36 shrink-0 flex-col overflow-hidden rounded-xl border-2 bg-paper text-left ${x.id === id ? "border-ink" : "border-line hover:border-muted"}`}
          >
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-well">
              {x.alter && (!x.run || hasFlat(x)) ? (
                <OrderThumb sample={x} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- local sample photos
                <img src={x.run!.photo.src} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="p-2.5">
              <div className="text-[15px] font-medium">{x.label[lang]}</div>
            </div>
          </button>
        ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted">
        <b className="text-ink">{s.label[lang]}</b>: {s.sub[lang]}
      </p>
      <Workbench
        key={s.id}
        live={false}
        garmentPicker={false}
        initial={{ photo: s.run?.photo, run: s.run?.run, garment: s.garment, fabric: s.run ? (s.run === TEE_RUN ? "knit" : "woven") : ex.fabric }}
        initialEdits={s.tape ?? (s.run ? undefined : Object.fromEntries(Object.entries(ex.m).map(([k, v]) => [k, String(v)])))}
        editedLabel={s.run ? T.tape : T.exampleValue}
        initialTab={s.tab ?? (s.run ? "measure" : "pattern")}
        mode={s.alter ? "alter" : "pattern"}
        sampleText={s.alter ? { ...s.alter[lang], garment: s.garment } : undefined}
        sampleTable={top ? TOPS_TABLE : s.garment === "pants" ? BOTTOMS_TABLE : undefined}
        placeholder={
          <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-muted bg-well p-6 text-center">
            <div className="aspect-square w-2/3">
              <PieceThumb garment={s.garment} aspect={1} />
            </div>
            <p className="max-w-72 text-sm text-muted">{drawnFrom(ex.size)[lang]}</p>
            <Link href={`/${lang}/${s.alter ? "alter" : "make"}`} className="text-sm font-medium underline">
              {T.tryMine[lang]}
            </Link>
          </div>
        }
      />
    </div>
  );
}

// A sample's measurements: the photo's (with the tape values) or, without a photo, the typical ones.
function measuresOf(sample: Sample): Record<string, number> {
  if (!sample.run) return EXAMPLES[sample.garment].m as unknown as Record<string, number>;
  const measured = sample.run.run.measured.values as Record<string, { cm: number }>;
  return { ...Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, v.cm])), ...Object.fromEntries(Object.entries(sample.tape ?? {}).map(([k, v]) => [k, Number(v)])) };
}
const fabricOf = (sample: Sample) => (sample.run === TEE_RUN ? "knit" : EXAMPLES[sample.garment].fabric);
// A photo may not measure everything a flat needs: without it, the card shows the photo.
const hasFlat = (sample: Sample) => flatFor(sample.garment, measuresOf(sample), fabricOf(sample), []) !== null;

// An alteration example's card: the garment's technical flat with the order's marks.
function OrderThumb({ sample }: { sample: Sample }) {
  const lang = useLang();
  const views = useMemo(() => {
    const ex = sample.alter![lang];
    const order = parse(ex.read, ex.text, sample.garment).map((c) => guarded(fromComplaint(sample.garment, c)));
    return flatFor(sample.garment, measuresOf(sample), fabricOf(sample), order);
  }, [lang, sample]);
  return views ? <div className="h-full w-full bg-field p-1.5 [&_svg]:h-full [&_svg]:w-full">{<GarmentFlat views={views} />}</div> : null;
}

function PieceThumb({ garment, aspect = 4 / 3 }: { garment: GarmentKind; aspect?: number }) {
  const sheet = useMemo(() => {
    const ex = EXAMPLES[garment];
    return drawingSheet(draft({ garment, measures: ex.m, fabric: ex.fabric }), aspect);
  }, [garment, aspect]);
  return <PiecesOutline sheet={sheet} className="h-full max-h-full w-full p-2" />;
}
