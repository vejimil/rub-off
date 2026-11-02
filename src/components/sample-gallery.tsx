"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PiecesOutline } from "@/components/pattern-preview";
import { LangProvider, useLang } from "@/components/lang";
import type { Lang } from "@/lib/i18n/lang";
import { Badge } from "@/components/ui";
import { Workbench } from "@/components/workbench";
import type { SampleRun } from "@/lib/client/types";
import { draft } from "@/lib/pattern/draft";
import { EXAMPLES } from "@/lib/pattern/examples";
import { layOut } from "@/lib/pattern/layout";
import type { GarmentKind } from "@/lib/pattern/types";
import shorts from "@/lib/sample/shorts-run.json";
import tablesBottoms from "@/lib/sample/size-table-bottoms-read.json";
import tablesTops from "@/lib/sample/size-table-read.json";
import { COMPLAINT_EXAMPLE } from "@/lib/sample/complaints";
import tee from "@/lib/sample/tee-run.json";
import { L, type Local } from "@/lib/i18n/lang";
import { GARMENT_NAME } from "@/lib/i18n/names";
import type { ReadTable } from "@/lib/size/table";

// The sample page: two garments the owner photographed (replayed runs, no API call) and the
// other garment types drafted from typical measurements.

interface Sample {
  id: string;
  label: Local;
  garment: GarmentKind;
  run?: SampleRun;
  sub: Local;
  tab?: "measure" | "pattern" | "fit";
}

const TOPS_TABLE = { read: tablesTops as ReadTable, src: "/samples/size-table.png" };
const BOTTOMS_TABLE = { read: tablesBottoms as ReadTable, src: "/samples/size-table-bottoms.png" };

const SAMPLES: Sample[] = [
  {
    id: "tee",
    label: GARMENT_NAME["t-shirt"],
    garment: "t-shirt",
    run: tee as unknown as SampleRun,
    sub: L("실제 사진, 어깨점은 사진에서 직접 찍음", "A real photo; the shoulder points were tapped on it", "Una foto real; los puntos del hombro se marcaron a mano"),
  },
  { id: "shorts", label: L("반바지", "Shorts", "Pantalón corto"), garment: "pants", run: shorts as unknown as SampleRun, sub: L("실제 사진", "A real photo", "Una foto real") },
  {
    id: "pants",
    label: L("휠체어 바지", "Wheelchair trousers", "Pantalón para silla de ruedas"),
    garment: "pants",
    sub: L(
      "휠체어를 타는 사람이 고무줄 바지에 대해 적은 불편함과, 거기서 나온 수선 의뢰서",
      "What a wheelchair user wrote about their elastic-waist trousers (in Korean), and the alteration order made from it",
      "Lo que una persona en silla de ruedas escribió sobre su pantalón de cintura elástica (en coreano), y la orden de arreglos que sale de ahí",
    ),
    tab: "fit",
  },
  ...(["shirt", "hoodie", "skirt", "eco-bag"] as const).map((g) => ({ id: g, label: GARMENT_NAME[g], garment: g, sub: L("예시 치수로 그린 패턴", "A pattern drafted from example measurements", "Un patrón trazado con medidas de ejemplo") })),
];

// Tee: the owner's tape values for what a photo can't see (the neck drops are below the rib).
const TEE_TAPE = { frontNeckDrop: "12", backNeckDrop: "2.5" };

const T = {
  real: L("실제 사진", "Real photo", "Foto real"),
  example: L("예시 치수", "Example sizes", "Medidas de ejemplo"),
  tape: L("줄자", "Tape", "Cinta"),
  exampleValue: L("예시 값", "Example", "Ejemplo"),
  tryMine: L("내 옷 사진으로 해 보기", "Try it with a photo of your garment", "Pruébalo con una foto de tu prenda"),
};
const drawnFrom = (size: string) =>
  L(
    `기성복 ${size} 사이즈의 보통 치수로 그린 패턴입니다. 치수 탭에서 값을 고치면 패턴이 바로 바뀝니다.`,
    `Drafted from typical ready-to-wear size ${size} measurements. Change a value in the Measurements tab and the pattern redraws.`,
    `Trazado con medidas típicas de la talla ${size} de confección. Cambia un valor en la pestaña Medidas y el patrón se vuelve a dibujar.`,
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
  const isTop = s.garment === "t-shirt" || s.garment === "shirt" || s.garment === "hoodie";
  return (
    <div className="space-y-6">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {SAMPLES.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setId(x.id)}
            className={`press flex w-36 shrink-0 flex-col overflow-hidden rounded-xl border-2 bg-paper text-left ${x.id === id ? "border-ink" : "border-line hover:border-muted"}`}
          >
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-well">
              {x.run ? (
                // eslint-disable-next-line @next/next/no-img-element -- local sample photos
                <img src={x.run.photo.src} alt="" className="h-full w-full object-cover" />
              ) : (
                <PieceThumb garment={x.garment} />
              )}
            </div>
            <div className="p-2.5">
              <div className="text-[15px] font-medium">{x.label[lang]}</div>
              <div className="mt-1">
                <Badge tone={x.run ? "chalk" : "muted"}>{(x.run ? T.real : T.example)[lang]}</Badge>
              </div>
            </div>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">
        <b className="text-ink">{s.label[lang]}</b>: {s.sub[lang]}
      </p>
      <Workbench
        key={s.id}
        live={false}
        garmentPicker={false}
        initial={{ photo: s.run?.photo, run: s.run?.run, garment: s.garment, fabric: s.run ? (s.id === "tee" ? "knit" : "woven") : ex.fabric }}
        initialEdits={s.id === "tee" ? TEE_TAPE : s.run ? undefined : Object.fromEntries(Object.entries(ex.m).map(([k, v]) => [k, String(v)]))}
        editedLabel={s.run ? T.tape : T.exampleValue}
        initialTab={s.tab ?? (s.run ? "measure" : "pattern")}
        sampleText={{ ...COMPLAINT_EXAMPLE[lang], garment: "pants" }}
        sampleTable={isTop ? TOPS_TABLE : s.garment === "pants" ? BOTTOMS_TABLE : undefined}
        placeholder={
          <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-muted bg-well p-6 text-center">
            <div className="w-2/3">
              <PieceThumb garment={s.garment} />
            </div>
            <p className="max-w-72 text-sm text-muted">{drawnFrom(ex.size)[lang]}</p>
            <Link href={`/${lang}/make${s.tab === "fit" ? "?tab=fit" : ""}`} className="text-sm font-medium underline">
              {T.tryMine[lang]}
            </Link>
          </div>
        }
      />
    </div>
  );
}

function PieceThumb({ garment }: { garment: GarmentKind }) {
  const sheet = useMemo(() => {
    const ex = EXAMPLES[garment];
    return layOut(draft({ garment, measures: ex.m, fabric: ex.fabric }));
  }, [garment]);
  return <PiecesOutline sheet={sheet} className="h-full max-h-full w-full p-2" />;
}
