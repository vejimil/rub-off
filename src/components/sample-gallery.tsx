"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PiecesOutline } from "@/components/pattern-preview";
import { Badge } from "@/components/ui";
import { GARMENT_KO, Workbench } from "@/components/workbench";
import type { SampleRun } from "@/lib/client/types";
import { draft } from "@/lib/pattern/draft";
import { EXAMPLES } from "@/lib/pattern/examples";
import { layOut } from "@/lib/pattern/layout";
import type { GarmentKind } from "@/lib/pattern/types";
import shorts from "@/lib/sample/shorts-run.json";
import tablesBottoms from "@/lib/sample/size-table-bottoms-read.json";
import tablesTops from "@/lib/sample/size-table-read.json";
import tee from "@/lib/sample/tee-run.json";
import type { ReadTable } from "@/lib/size/table";

// The sample page: two garments the owner photographed (replayed runs, no API call) and the
// other garment types drafted from typical measurements.

interface Sample {
  id: string;
  label: string;
  garment: GarmentKind;
  run?: SampleRun;
  sub: string;
}

const TOPS_TABLE = { read: tablesTops as ReadTable, src: "/samples/size-table.png" };
const BOTTOMS_TABLE = { read: tablesBottoms as ReadTable, src: "/samples/size-table-bottoms.png" };

const SAMPLES: Sample[] = [
  { id: "tee", label: "티셔츠", garment: "t-shirt", run: tee as unknown as SampleRun, sub: "실제 사진, 어깨점은 사진에서 직접 찍음" },
  { id: "shorts", label: "반바지", garment: "pants", run: shorts as unknown as SampleRun, sub: "실제 사진" },
  ...(["shirt", "hoodie", "skirt", "eco-bag"] as const).map((g) => ({ id: g, label: GARMENT_KO[g], garment: g, sub: "예시 치수로 그린 패턴" })),
];

// Tee: the owner's tape values for what a photo can't see (the neck drops are below the rib).
const TEE_TAPE = { frontNeckDrop: "12", backNeckDrop: "2.5" };

export function SampleGallery() {
  const [id, setId] = useState(SAMPLES[0].id);
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
              <div className="text-[15px] font-medium">{x.label}</div>
              <div className="mt-1">
                <Badge tone={x.run ? "chalk" : "muted"}>{x.run ? "실제 사진" : "예시 치수"}</Badge>
              </div>
            </div>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">
        <b className="text-ink">{s.label}</b>: {s.sub}
      </p>
      <Workbench
        key={s.id}
        live={false}
        garmentPicker={false}
        initial={{ photo: s.run?.photo, run: s.run?.run, garment: s.garment, fabric: s.run ? (s.id === "tee" ? "knit" : "woven") : ex.fabric }}
        initialEdits={s.id === "tee" ? TEE_TAPE : s.run ? undefined : Object.fromEntries(Object.entries(ex.m).map(([k, v]) => [k, String(v)]))}
        editedLabel={s.run ? "줄자" : "예시 값"}
        initialTab={s.run ? "measure" : "pattern"}
        sampleTable={isTop ? TOPS_TABLE : s.garment === "pants" ? BOTTOMS_TABLE : undefined}
        placeholder={
          <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-muted bg-well p-6 text-center">
            <div className="w-2/3">
              <PieceThumb garment={s.garment} />
            </div>
            <p className="max-w-72 text-sm text-muted">
              이 옷은 아직 사진 샘플이 없습니다. 기성복 {ex.size} 사이즈의 보통 치수를 넣어 그린 패턴입니다. 치수 탭에서 값을 고치면 패턴이 바로 바뀝니다.
            </p>
            <Link href="/make" className="text-sm font-medium underline">
              내 옷 사진으로 해 보기
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
