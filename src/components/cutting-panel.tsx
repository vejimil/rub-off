"use client";

import { useMemo, useState } from "react";
import { resizeToJpeg } from "@/lib/client/resize";
import { applyH, type Mat3 } from "@/lib/geom/homography";
import type { Pt } from "@/lib/geom/point";
import { svgPath } from "@/lib/geom/point";
import { bounds } from "@/lib/geom/polygon";
import { useLang } from "@/components/lang";
import { buttonGhost } from "@/components/ui";
import { L, type Local } from "@/lib/i18n/lang";
import { nest, piecesToCut } from "@/lib/nest/nest";
import type { Pattern } from "@/lib/pattern/types";

interface FabricPhoto {
  src: string;
  blob: Blob;
  width: number;
  height: number;
  scrapsCm: Pt[][];
  cmToPx: Mat3;
}

const ERRORS = {
  live_disabled: L("지금은 원단 사진을 읽을 수 없습니다. 원단 크기를 입력해 주십시오.", "Fabric photos can't be read right now. Type your fabric's size instead.", "Ahora no podemos leer fotos de tela. Escribe el tamaño de tu tela."),
  visitor_limit: L("오늘 읽을 수 있는 사진을 모두 썼습니다. 원단 크기를 입력해 주십시오.", "You've used today's photo readings. Type your fabric's size instead.", "Ya usaste las lecturas de fotos de hoy. Escribe el tamaño de tu tela."),
  daily_limit: L("오늘은 더 이상 사진을 읽을 수 없습니다. 원단 크기를 입력해 주십시오.", "Today's photo readings are used up. Type your fabric's size instead.", "Se agotaron las lecturas de fotos de hoy. Escribe el tamaño de tu tela."),
  failed: L("원단 사진을 읽지 못했습니다. 잠시 후 다시 해 주십시오.", "Couldn't read the fabric photo. Try again in a moment.", "No pudimos leer la foto de la tela. Inténtalo de nuevo en un momento."),
} as const;

const T = {
  sizes: L("원단 크기(cm, 가로x세로, 여러 장은 쉼표)", "Fabric size (cm, width x length, commas between pieces)", "Tamaño de la tela (cm, ancho x largo, comas entre piezas)"),
  finding: L("원단을 찾는 중…", "Finding the fabric…", "Buscando la tela…"),
  fromPhoto: L("원단 사진으로", "From a fabric photo", "Desde una foto de la tela"),
  crossGrain: L("식서 90° 돌림 허용", "Allow turning 90° off the grain", "Permitir girar 90° respecto al hilo"),
  grainNote: L(
    "입력한 크기(또는 사진)의 세로를 원단의 식서로 봅니다. 조각은 식서를 따라 0°·180°로만 돌리고, 원단 가장자리에서 1 cm 이상 띄웁니다.",
    "The fabric's grain (lengthwise) runs up and down the photo or the size you typed. Pieces turn only 0° or 180° along the grain and stay at least 1 cm from the edges and from each other.",
    "El hilo de la tela (a lo largo) va de arriba abajo en la foto o en el tamaño que escribiste. Las piezas solo giran 0° o 180° siguiendo el hilo y quedan al menos a 1 cm de los bordes y entre sí.",
  ),
  fabricAlt: L("원단", "Fabric", "Tela"),
  layoutLabel: L("원단 위 재단 배치", "Cutting layout on the fabric", "Colocación de las piezas sobre la tela"),
  seeIt: L("이 원단으로 만든 모습 보기", "See the garment in this fabric", "Ver la prenda en esta tela"),
  drawing: L("그리는 중… 30초쯤 걸립니다", "Drawing it… about 30 seconds", "Dibujándola… unos 30 segundos"),
  previewAlt: L("이 원단으로 만든 옷 미리보기", "The garment shown in this fabric", "La prenda mostrada en esta tela"),
  previewNote: L(
    "옷 모양과 주변은 사진 그대로 두고 옷감만 바꿔 그린 그림입니다. 실제 색과 무늬 크기는 다를 수 있습니다.",
    "Only the cloth is redrawn; the garment's shape and everything around it are your photo. Real colours and print size may differ.",
    "Solo se redibuja la tela; la forma de la prenda y lo que la rodea son tu foto. Los colores y el tamaño del estampado reales pueden variar.",
  ),
};

const PREVIEW_ERRORS = {
  ...ERRORS,
  measure_first: L("옷 사진을 먼저 재 주십시오.", "Measure the garment photo first.", "Mide primero la foto de la prenda."),
  failed: L("그림을 만들지 못했습니다. 잠시 후 다시 해 주십시오.", "Couldn't draw it. Try again in a moment.", "No se pudo dibujar. Inténtalo de nuevo en un momento."),
  live_disabled: L("지금은 미리보기를 만들 수 없습니다.", "The preview isn't available right now.", "Ahora no se puede hacer la vista previa."),
} as const;

const allFit = (n: number, pct: number) =>
  L(`조각 ${n}장이 모두 들어갑니다. 원단 사용률 ${pct}%.`, `All ${n} pieces fit. ${pct}% of the fabric is used.`, `Caben las ${n} piezas. Se usa el ${pct}% de la tela.`);
const noFit = (name: Local, w: string, h: string, fw: number, fh: number) =>
  L(
    `${subject(name.ko)} 들어가지 않습니다: 조각 ${w} × ${h} cm, 남은 가장 큰 빈 곳 ${fw} × ${fh} cm.`,
    `${name.en} doesn't fit: the piece is ${w} × ${h} cm, the largest space left is ${fw} × ${fh} cm.`,
    `${name.es} no cabe: la pieza mide ${w} × ${h} cm y el mayor hueco libre es de ${fw} × ${fh} cm.`,
  );
const turnHint = L(
  " 식서를 90° 돌리면 들어갈 수 있습니다(원단에 따라 늘어남·광택이 달라집니다).",
  " It would fit turned 90° off the grain (stretch and sheen may change with the fabric).",
  " Cabría girada 90° respecto al hilo (según la tela, cambian la elasticidad y el brillo).",
);

// 이/가 after a Korean name, by its last syllable.
const subject = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  return w + (c >= 0 && c < 11172 && c % 28 !== 0 ? "이" : "가");
};
const f2 = (n: number) => n.toFixed(2);

// Mode 3: does the pattern fit on the fabric you have? Scraps from a photo (SAM 3.1 + A4) or typed
// sizes; the layout is deterministic and runs here in the browser.
// garmentPhoto: the garment photo already measured, and the word its outline was found with, for
// showing the garment in the fabric (Muse Image, kept to the garment's own outline).
export function CuttingPanel({ pattern, live, garmentPhoto }: { pattern: Pattern; live: boolean; garmentPhoto?: { file: Blob; word: string } }) {
  const lang = useLang();
  const [sizes, setSizes] = useState("110x100");
  const [photo, setPhoto] = useState<FabricPhoto | null>(null);
  const [crossGrain, setCrossGrain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ src: string; for: string } | null>(null);
  const [drawing, setDrawing] = useState(false);

  // Typed scraps, "110x100, 60x45", laid side by side 10 cm apart.
  const typed = useMemo(() => {
    const dims = sizes
      .split(/[,\s]+/)
      .map((s) => s.match(/^(\d+(?:\.\d+)?)[x×*](\d+(?:\.\d+)?)$/i))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [Number(m[1]), Number(m[2])] as const);
    const starts = dims.map((_, i) => dims.slice(0, i).reduce((s, [w]) => s + w + 10, 0));
    return dims.map(([w, h], i): Pt[] => [[starts[i], 0], [starts[i] + w, 0], [starts[i] + w, h], [starts[i], h]]);
  }, [sizes]);

  const fabric = photo?.scrapsCm ?? typed;
  const result = useMemo(() => (fabric.length ? nest(piecesToCut(pattern), fabric, { allowCrossGrain: crossGrain }) : null), [pattern, fabric, crossGrain]);

  async function upload(f: File) {
    setBusy(true);
    setError(null);
    try {
      const r = await resizeToJpeg(f);
      const form = new FormData();
      form.set("photo", r.blob, "fabric.jpg");
      const res = await fetch("/api/fabric", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) setError((ERRORS[body.error as keyof typeof ERRORS] ?? ERRORS.failed)[lang]);
      else if (!body.run.ok) setError(body.run.detail[lang]);
      else setPhoto({ src: r.url, blob: r.blob, width: r.width, height: r.height, scrapsCm: body.run.scrapsCm, cmToPx: body.run.cmToPx });
    } catch {
      setError(ERRORS.failed[lang]);
    } finally {
      setBusy(false);
    }
  }

  async function drawPreview() {
    if (!photo || !garmentPhoto) return;
    setDrawing(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("photo", garmentPhoto.file, "garment.jpg");
      form.set("fabric", photo.blob, "fabric.jpg");
      form.set("word", garmentPhoto.word);
      const res = await fetch("/api/preview", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((PREVIEW_ERRORS[body.error as keyof typeof PREVIEW_ERRORS] ?? PREVIEW_ERRORS.failed)[lang]);
      } else setPreview({ src: URL.createObjectURL(await res.blob()), for: photo.src });
    } catch {
      setError(PREVIEW_ERRORS.failed[lang]);
    } finally {
      setDrawing(false);
    }
  }

  const fb = bounds(fabric.flat());
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label>
          {T.sizes[lang]}{" "}
          <input value={sizes} onChange={(e) => { setSizes(e.target.value); setPhoto(null); }} className="w-44 rounded-lg border border-line bg-field px-2 py-1" />
        </label>
        {live && (
          <label className={`${buttonGhost} cursor-pointer`}>
            {busy ? T.finding[lang] : T.fromPhoto[lang]}
            <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        )}
        <label>
          <input type="checkbox" checked={crossGrain} onChange={(e) => setCrossGrain(e.target.checked)} /> {T.crossGrain[lang]}
        </label>
      </div>
      <p className="text-sm text-muted">{T.grainNote[lang]}</p>
      {error && <p className="rounded-xl bg-mark-soft p-3 text-sm">{error}</p>}
      {live && photo && garmentPhoto && preview?.for !== photo.src && (
        <button type="button" onClick={drawPreview} disabled={drawing} className={buttonGhost}>
          {drawing ? T.drawing[lang] : T.seeIt[lang]}
        </button>
      )}
      {photo && preview?.for === photo.src && (
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture made from the user's own photos */}
          <img src={preview.src} alt={T.previewAlt[lang]} className="block h-auto w-full rounded-xl" />
          <figcaption className="text-xs text-muted">{T.previewNote[lang]}</figcaption>
        </figure>
      )}

      {result && (
        <>
          {result.unplaced.length === 0 ? (
            <p className="rounded-xl bg-ok-soft p-3 text-sm">
              {allFit(result.placed.length, Math.round((100 * result.usedAreaCm2) / result.fabricAreaCm2))[lang]}
            </p>
          ) : (
            <ul className="space-y-1 rounded-xl bg-mark-soft p-3 text-sm">
              {result.unplaced.map((u) => (
                <li key={u.piece.id}>
                  {noFit(u.piece.label, u.size[0].toFixed(0), u.size[1].toFixed(0), u.largestFree[0], u.largestFree[1])[lang]}
                  {!crossGrain && u.size[1] <= u.largestFree[0] && u.size[0] <= u.largestFree[1] && turnHint[lang]}
                </li>
              ))}
            </ul>
          )}
          {photo ? (
            <figure className="relative overflow-hidden rounded-xl bg-well">
              {/* eslint-disable-next-line @next/next/no-img-element -- the user's own fabric photo */}
              <img src={photo.src} alt={T.fabricAlt[lang]} className="block h-auto w-full" />
              <svg viewBox={`0 0 ${photo.width} ${photo.height}`} className="absolute inset-0 h-full w-full" aria-hidden>
                {result.placed.map((p) => (
                  <path key={p.piece.id} d={svgPath(p.outline.map((q) => applyH(photo.cmToPx, q)), true)} fill="rgba(6,43,138,0.25)" stroke="var(--ink)" strokeWidth={photo.width / 300} />
                ))}
              </svg>
            </figure>
          ) : (
            <svg viewBox={`${fb.minX - 2} ${fb.minY - 2} ${fb.maxX - fb.minX + 4} ${fb.maxY - fb.minY + 4}`} className="h-auto w-full rounded-xl bg-well" role="img" aria-label={T.layoutLabel[lang]}>
              {fabric.map((f, i) => (
                <path key={i} d={svgPath(f, true)} fill="var(--sand)" stroke="var(--muted)" strokeWidth={0.3} />
              ))}
              {result.placed.map((p) => {
                const b = bounds(p.outline);
                return (
                  <g key={p.piece.id}>
                    <path d={svgPath(p.outline, true)} fill="rgba(6,43,138,0.12)" stroke="var(--ink)" strokeWidth={0.3} />
                    <text x={f2((b.minX + b.maxX) / 2)} y={f2((b.minY + b.maxY) / 2)} fontSize={2.5} textAnchor="middle" fill="var(--ink)">
                      {p.piece.label[lang]}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </>
      )}
    </section>
  );
}
