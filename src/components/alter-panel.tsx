"use client";

import { useState } from "react";
import { GarmentFlat } from "@/components/garment-flat";
import { useLang } from "@/components/lang";
import { PatternPreview } from "@/components/pattern-preview";
import { Badge, buttonGhost, buttonPrimary, Segmented } from "@/components/ui";
import { compare, complaintsFor, fromBody, fromComplaint, guarded, type Alteration, type Complaint } from "@/lib/fit/alter";
import { BODY_HOW, BODY_KEYS, BODY_NAME, targetsFromBody, type BodyFit, type BodyKey } from "@/lib/fit/body";
import { alterationPattern, diyGuide, type Guide } from "@/lib/fit/diy";
import { flatFor } from "@/lib/fit/flat";
import { MAX_TEXT, parse, type ReadComplaints } from "@/lib/fit/read-complaint";
import { L } from "@/lib/i18n/lang";
import { GARMENT_NAME } from "@/lib/i18n/names";
import { cutText } from "@/lib/pattern/dims";
import { layOut } from "@/lib/pattern/layout";
import { patternPdf } from "@/lib/pattern/pdf";
import { loadPdfFont } from "@/lib/pattern/pdf-font";
import { MEASURE_NAME } from "@/lib/pattern/measures";
import { NOT_WORN, type Fabric, type GarmentKind } from "@/lib/pattern/types";

const ERRORS = {
  live_disabled: L("지금은 적은 글을 읽을 수 없습니다. 아래 목록에서 골라 주십시오.", "Written text can't be read right now. Please pick from the list below.", "Ahora mismo no se pueden leer textos. Elige de la lista de abajo."),
  visitor_limit: L("오늘 읽을 수 있는 글을 모두 읽었습니다. 아래 목록에서 골라 주십시오.", "You've used today's text readings. Please pick from the list below.", "Ya has usado las lecturas de texto de hoy. Elige de la lista de abajo."),
  daily_limit: L("오늘은 더 이상 글을 읽을 수 없습니다. 아래 목록에서 골라 주십시오.", "Today's text readings are used up. Please pick from the list below.", "Hoy ya no quedan lecturas de texto. Elige de la lista de abajo."),
  failed: L("글을 읽지 못했습니다. 잠시 후 다시 해 주십시오.", "Couldn't read the text. Please try again in a moment.", "No se pudo leer el texto. Inténtalo de nuevo en un momento."),
  offline: L("서버에 연결하지 못했습니다.", "Couldn't connect.", "No se pudo conectar."),
};

const T = {
  bag: L("몸에 맞춰 입는 옷이 아니어서 고칠 치수가 없습니다.", "This isn't fitted to a body, so there are no fit measurements to change.", "Esto no se ajusta al cuerpo, así que no hay medidas de ajuste que cambiar."),
  bodyTitle: L("입을 사람의 몸 치수", "The wearer's body measurements", "Medidas del cuerpo de quien la lleva"),
  bodySub: L(
    "줄자로 잰 값을 넣으면 이 옷과 비교해 줄이거나 늘릴 곳을 찾습니다.",
    "Enter tape measurements to compare them with this garment and find what to take in or let out.",
    "Escribe medidas tomadas con cinta para compararlas con la prenda y ver qué meter o sacar.",
  ),
  example: L("예시 값 넣기", "Fill in example values", "Rellenar con un ejemplo"),
  fit: L("원하는 핏", "Fit you want", "Ajuste que quieres"),
  slim: L("붙게", "Close", "Ajustado"),
  regular: L("보통", "Regular", "Normal"),
  loose: L("여유 있게", "Loose", "Holgado"),
  caption: L("이 옷과 몸에 맞는 값 비교", "This garment against the values that fit the body", "Esta prenda frente a los valores que le quedan al cuerpo"),
  thFlat: L("단면", "Measurement", "Medida"),
  thThis: L("이 옷", "This garment", "Esta prenda"),
  thFits: L("몸에 맞는 값", "Fits the body", "Le queda al cuerpo"),
  thVerdict: L("판정", "Verdict", "Resultado"),
  atLeast: L(" 이상", " or more", " o más"),
  fits: L("맞음", "Fits", "Queda bien"),
  big: L("큼", "Too big", "Grande"),
  small: L("작음", "Too small", "Pequeño"),
  long: L("김", "Too long", "Largo"),
  short: L("짧음", "Too short", "Corto"),
  seated: L("앉아서 입을 때", "When seated", "En posición sentada"),
  general: L("길이와 품", "Length and fit", "Largo y holgura"),
  askNote: L(
    "재 본 길이가 있으면 넣어 주십시오. 비워 두면 수선집에서 잽니다.",
    "If you've measured it, enter the length. Leave it blank and the tailor will measure it.",
    "Si lo has medido, escribe la medida. Si lo dejas vacío, lo mide el taller.",
  ),
  write: L("직접 적기", "Write it yourself", "Escríbelo tú"),
  reading: L("읽는 중…", "Reading…", "Leyendo…"),
  found: L("글에서 찾은 것", "Found in your text", "Encontrado en tu texto"),
  notListed: L("목록에 없는 불편함", "Something not on the list", "Algo que no está en la lista"),
  order: L("수선 의뢰서", "Alteration order", "Orden de arreglos"),
  empty: L("아직 비어 있습니다", "Empty so far", "Vacía por ahora"),
  flat: L("도식화", "Technical flat", "Dibujo técnico"),
  toMeasure: L("재서 정함", "to measure", "a medir"),
  toMeasureAria: L("수선집에서 재서 정함", "The tailor measures it", "Lo mide el taller"),
  checkFirst: L("고치기 전에 옷을 입고 한 번 더 확인하십시오.", "Try the garment on and check once more before altering it.", "Pruébate la prenda y compruébalo otra vez antes de arreglarla."),
  leadEmpty: L(
    "불편한 점을 적거나 목록에서 고르면, 수선집에 그대로 보여 줄 의뢰서가 여기에 나옵니다.",
    "Write or pick what bothers you, and an order you can hand to a tailor as it is appears here.",
    "Escribe o elige lo que te molesta, y aquí aparecerá una orden que puedes llevar tal cual al taller.",
  ),
  leadTitle: L("어디가 불편한가요?", "What bothers you?", "¿Qué te molesta?"),
  leadSub: L(
    "입었을 때 불편한 점을 말하듯 적어 주십시오. 길이를 재 봤다면 숫자도 함께 적으면 그 값으로 계산합니다.",
    "Write what bothers you when you wear it, the way you'd say it. If you've measured how much, include the number and it's used.",
    "Escribe lo que te molesta al llevarla, como lo dirías. Si has medido cuánto, pon también el número y se usará.",
  ),
  leadPlaceholder: L(
    "예: 소매가 3 cm쯤 길고, 바지통이 너무 넓어요. 앉으면 뒤 허리가 내려가요.",
    "e.g. The sleeves are about 3 cm too long and the legs are too wide. When I sit, the back of the waist drops.",
    "p. ej.: Las mangas me sobran unos 3 cm y las perneras son demasiado anchas. Al sentarme se me baja la cintura por detrás.",
  ),
  makeOrder: L("고칠 곳 찾기", "Find what to alter", "Buscar qué arreglar"),
  orPick: L("또는 목록에서 고르기", "Or pick from the list", "O elige de la lista"),
  inOrder: L("의뢰서에 담겼습니다", "Added to the order", "Añadido a la orden"),
  seeOrder: L("의뢰서 보기", "See the order", "Ver la orden"),
  bodyMore: L("몸 치수로 더 정확하게 (선택)", "More exact with body measurements (optional)", "Más exacto con medidas del cuerpo (opcional)"),
  print: L("인쇄 · PDF로 저장", "Print · save as PDF", "Imprimir · guardar en PDF"),
  who: L("누가 고치나요", "Who's doing it", "Quién lo arregla"),
  toTailor: L("수선집에 맡기기", "Take it to a tailor", "Llevarla al taller"),
  diy: L("직접 고치기", "Do it myself", "Hacerlo yo"),
  guide: L("수선 가이드", "Alteration guide", "Guía de arreglos"),
  tools: L("준비물", "You need", "Necesitas"),
  steps: L("순서", "Steps", "Pasos"),
  cutPieces: L("수선 패턴", "Alteration pattern", "Patrón de arreglos"),
  tailorBetter: L("수선집 권장", "Best left to a tailor", "Mejor en un taller"),
  emptyDiy: L(
    "불편한 점을 적거나 고르면, 직접 고치는 순서와 실제 크기 수선 패턴이 여기에 나옵니다.",
    "Write or pick what bothers you, and the steps to fix it yourself, with an actual-size alteration pattern, appear here.",
    "Escribe o elige lo que te molesta, y aquí aparecerán los pasos para arreglarlo tú, con un patrón de arreglos a tamaño real.",
  ),
  patternTitle: L("수선 패턴", "Alteration pattern", "Patrón de arreglos"),
  patternSub: L(
    "새로 자를 천 조각과, 옷에 대고 선을 옮겨 그리는 종이 본입니다. 실제 크기(배율 100%)로 인쇄해 첫 장의 10 cm 사각형을 자로 확인하십시오.",
    "Fabric pieces to cut, and paper templates to lay on the garment and trace. Print at actual size (100%) and check the 10 cm square on the first page with a ruler.",
    "Piezas de tela para cortar y plantillas de papel para colocar sobre la prenda y calcar. Imprime a tamaño real (100 %) y comprueba con una regla el cuadrado de 10 cm de la primera página.",
  ),
  download: L("수선 패턴 PDF 받기", "Download the alteration pattern (PDF)", "Descargar el patrón de arreglos (PDF)"),
  making: L("만드는 중…", "Making…", "Preparando…"),
  pdfHeading: L("수선 패턴", "Alteration pattern", "Patrón de arreglos"),
};
const count = (n: number) => L(`고칠 곳 ${n}군데`, `${n} change${n > 1 ? "s" : ""}`, `${n} arreglo${n > 1 ? "s" : ""}`);
const numbered = (n: number) => L(`${n}번`, `Number ${n}`, `Número ${n}`);

// Typical adult values, for trying the panel without a tape measure.
const EXAMPLE_BODY: Partial<Record<BodyKey, number>> = { chestGirth: 92, shoulderWidth: 44, armLength: 58, bicepGirth: 29, waistGirth: 76, hipGirth: 96, thighGirth: 56, crotchDepth: 26, waistToAnkle: 98 };

const LONG = ["length", "sleeve", "outseam", "frontRise"];

export interface AlterPanelProps {
  garment: GarmentKind;
  fabric: Fabric;
  measures: Record<string, number>; // the garment as measured (and corrected)
  sampleText?: { text: string; read: ReadComplaints };
}

// Mode 4: fit this garment to its wearer. What the wearer says is wrong (written and sorted by
// Muse Spark, or picked from the list) goes through the alteration rules; tape-measured body sizes,
// folded away, become target garment sizes; the result is a work order with a technical flat of
// the garment, marked.
export function AlterPanel({ garment, fabric, measures, sampleText }: AlterPanelProps) {
  const lang = useLang();
  const [body, setBody] = useState<Partial<Record<BodyKey, string>>>({});
  const [fit, setFit] = useState<BodyFit>("regular");
  const [picked, setPicked] = useState<Record<string, string>>({}); // complaint id → typed cm ("" if none)
  const [text, setText] = useState(sampleText?.text ?? "");
  const [read, setRead] = useState<{ text: string; read: ReadComplaints } | null>(sampleText ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof ERRORS | null>(null);
  const [listOpen, setListOpen] = useState(false); // the list opens itself when the text can't be read
  const [who, setWho] = useState<"tailor" | "diy">("tailor");
  const [pdfBusy, setPdfBusy] = useState(false);

  const bodyNums = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v as number) && (v as number) > 0)) as Partial<Record<BodyKey, number>>;
  const targets = targetsFromBody(garment, bodyNums, fit, fabric, measures);
  const comparisons = compare(targets, measures, fabric);
  const options = complaintsFor(garment);

  const fromText: Complaint[] = read ? parse(read.read, read.text, garment) : [];
  const alterations: Alteration[] = [
    ...fromBody(garment, comparisons),
    ...Object.entries(picked).map(([id, cm]) => fromComplaint(garment, { id, amountCm: cm ? Number(cm) : undefined })),
    ...fromText.filter((c) => !(c.id in picked)).map((c) => fromComplaint(garment, c)),
  ].map((a) => guarded(a));
  const views = flatFor(garment, measures, fabric, alterations);
  const diy = who === "diy";
  const guides: Guide[] = diy ? alterations.map((a, i) => diyGuide(garment, measures, fabric, a, i + 1)) : [];
  const altPattern = diy ? alterationPattern(garment, measures, fabric, guides) : null;
  const altSheet = altPattern ? layOut(altPattern) : null;

  async function downloadPdf() {
    if (!altPattern) return;
    setPdfBusy(true);
    try {
      const heading = `${T.pdfHeading[lang]}: ${GARMENT_NAME[garment][lang]}`;
      const { bytes } = await patternPdf(altPattern, { title: heading, heading, createdFor: "Rub-Off", lang, font: await loadPdfFont(lang) });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `rub-off-${garment}-alterations.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfBusy(false);
    }
  }

  async function analyse() {
    const t = text.trim();
    if (!t) return;
    if (sampleText && t === sampleText.text) return setRead(sampleText);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/complaints", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t, garment }) });
      const b = await res.json();
      if (!res.ok) {
        const err = b.error in ERRORS ? (b.error as keyof typeof ERRORS) : "failed";
        setError(err);
        if (err !== "failed") setListOpen(true);
      }
      else setRead({ text: t, read: b.read });
    } catch {
      setError("offline");
    } finally {
      setBusy(false);
    }
  }

  if (NOT_WORN.includes(garment)) return <p className="text-[15px] text-muted">{T.bag[lang]}</p>;

  const seated = options.filter((o) => o.seated);
  const general = options.filter((o) => !o.seated);
  const found = fromText.map((c) => ({ c, label: options.find((o) => o.id === c.id)?.label[lang] ?? T.notListed[lang] }));
  const toggle = (id: string) => {
    const next = { ...picked };
    if (id in next) delete next[id];
    else next[id] = "";
    setPicked(next);
  };
  const chip = (o: (typeof options)[number]) => {
    const on = o.id in picked;
    return (
      <button
        key={o.id}
        type="button"
        aria-pressed={on}
        onClick={() => toggle(o.id)}
        className={`press inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-left text-[15px] leading-snug ${on ? "bg-ink text-sand" : "bg-well text-ink hover:bg-chalk-soft"}`}
      >
        {on && (
          <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden>
            <path d="M1.5 5.5 L4 8 L8.5 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
        {o.label[lang]}
      </button>
    );
  };
  const verdict = (key: string, v: "fits" | "big" | "small") => (v === "fits" ? T.fits : LONG.includes(key) ? (v === "big" ? T.long : T.short) : T[v])[lang];

  const bodySection = (
    <section aria-labelledby="body-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="body-title" className="text-lg font-semibold">
            {T.bodyTitle[lang]}
          </h3>
          <p className="mt-1 text-[15px] text-muted">{T.bodySub[lang]}</p>
        </div>
        <button type="button" className={buttonGhost} onClick={() => setBody(Object.fromEntries(BODY_KEYS[garment].map((k) => [k, String(EXAMPLE_BODY[k])])))}>
          {T.example[lang]}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {BODY_KEYS[garment].map((k) => (
          <label key={k} className="rounded-xl bg-field px-4 py-3">
            <span className="flex items-center gap-2">
              <span className="flex-1 font-medium">{BODY_NAME[k][lang]}</span>
              <input
                inputMode="decimal"
                value={body[k] ?? ""}
                onChange={(e) => setBody({ ...body, [k]: e.target.value })}
                aria-describedby={`how-${k}`}
                className="num w-20 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-right text-lg"
              />
              <span className="text-muted">cm</span>
            </span>
            <span id={`how-${k}`} className="mt-1.5 block text-[13px] leading-snug text-muted">
              {BODY_HOW[k][lang]}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[15px] text-muted">{T.fit[lang]}</span>
        <Segmented
          size="sm"
          label={T.fit[lang]}
          value={fit}
          onChange={setFit}
          options={[
            { value: "slim", label: T.slim[lang] },
            { value: "regular", label: T.regular[lang] },
            { value: "loose", label: T.loose[lang] },
          ]}
        />
      </div>
      {comparisons.length > 0 && (
        <table className="w-full text-[15px]">
          <caption className="sr-only">{T.caption[lang]}</caption>
          <thead>
            <tr className="text-left text-[13px] text-muted">
              <th className="pb-2 font-normal">{T.thFlat[lang]}</th>
              <th className="pb-2 text-right font-normal">{T.thThis[lang]}</th>
              <th className="pb-2 text-right font-normal">{T.thFits[lang]}</th>
              <th className="pb-2 pl-4 font-normal">
                <span className="sr-only">{T.thVerdict[lang]}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c) => (
              <tr key={c.key} /* taste-skill-ignore: rule between table rows */ className="border-t border-line align-top">
                <td className="py-2.5 pr-3">
                  <span className="font-medium">{MEASURE_NAME[c.key]?.[lang] ?? c.key}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">{c.target.how[lang]}</span>
                </td>
                <td className="num py-2.5 text-right">{c.mine.toFixed(1)}</td>
                <td className="num py-2.5 text-right">
                  {c.target.cm.toFixed(1)}
                  {c.target.min ? T.atLeast[lang] : ""}
                </td>
                <td className="py-2.5 pl-4 text-right">
                  <Badge tone={c.verdict === "fits" ? "ok" : "mark"}>
                    {verdict(c.key, c.verdict)}
                    {c.verdict !== "fits" && ` ${Math.abs(c.diff)}`}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  const chips = (
    <>
      {seated.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] text-muted">{T.seated[lang]}</p>
          <div className="flex flex-wrap gap-2">{seated.map(chip)}</div>
        </div>
      )}
      {general.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] text-muted">{T.general[lang]}</p>
          <div className="flex flex-wrap gap-2">{general.map(chip)}</div>
        </div>
      )}
      {Object.keys(picked).length > 0 && (
        <p className="flex flex-wrap items-center gap-3 text-[15px]">
          <span className="text-muted">
            {count(Object.keys(picked).length)[lang]} {T.inOrder[lang]}
          </span>
          <button type="button" className="font-medium underline" onClick={() => document.getElementById("order-title")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            {T.seeOrder[lang]}
          </button>
        </p>
      )}
      {options.some((o) => o.id in picked && o.ask) && (
        <div className="space-y-2 rounded-xl bg-field p-4">
          <p className="text-[13px] text-muted">{T.askNote[lang]}</p>
          {options
            .filter((o) => o.id in picked && o.ask)
            .map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-[15px]">
                <span className="flex-1">{o.ask![lang]}</span>
                <input inputMode="decimal" value={picked[o.id]} onChange={(e) => setPicked({ ...picked, [o.id]: e.target.value })} className="num w-20 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-right" />
                <span className="text-muted">cm</span>
              </label>
            ))}
        </div>
      )}
    </>
  );

  const writing = (
      <div>
        <label htmlFor="say-text" className="sr-only">
          {T.write[lang]}
        </label>
        <textarea
          id="say-text"
          value={text}
          maxLength={MAX_TEXT}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder={T.leadPlaceholder[lang]}
          className="w-full rounded-xl border border-line bg-field p-4 text-base leading-relaxed"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={buttonPrimary} disabled={busy || !text.trim()} onClick={analyse}>
            {busy ? T.reading[lang] : T.makeOrder[lang]}
          </button>
          {error && <span className="text-[15px] text-mark">{ERRORS[error][lang]}</span>}
        </div>
        {found.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[13px] text-muted">{T.found[lang]}</p>
            <ul className="flex flex-wrap gap-2">
              {found.map(({ c, label }, i) => (
                <li key={i} className="rounded-full bg-chalk-soft px-3.5 py-2 text-[15px]">
                  {label}
                  {c.amountCm !== undefined && <span className="num ml-1.5 font-medium">{c.amountCm} cm</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
  );

  // One alteration's do-it-yourself guide: what to have, the steps, the pieces it prints.
  const guideBody = (g: Guide) => (
    <div className="mt-3 space-y-3 text-[15px] leading-relaxed">
      {g.tools.length > 0 && (
        <div>
          <p className="text-[13px] text-muted">{T.tools[lang]}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {g.tools.map((t) => (
              <li key={t.en} className="rounded-full bg-well px-2.5 py-1 text-[13px]">
                {t[lang]}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="text-[13px] text-muted">{T.steps[lang]}</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 marker:text-muted">
          {g.steps.map((s, k) => (
            <li key={k}>{s[lang]}</li>
          ))}
        </ol>
      </div>
      {g.pieces.length > 0 && (
        <p className="text-[13px] text-muted">
          {T.cutPieces[lang]}: {g.pieces.map((p) => `${p.names[lang]} (${cutText(p, lang, true)})`).join(", ")}
        </p>
      )}
      {g.missing && <p className="rounded-lg bg-chalk-soft px-3 py-2 text-[13px]">{g.missing[lang]}</p>}
    </div>
  );

  const whoSwitch = (
    <div className="no-print flex flex-wrap items-center gap-3">
      <span className="text-[15px] text-muted">{T.who[lang]}</span>
      <Segmented
        label={T.who[lang]}
        value={who}
        onChange={setWho}
        options={[
          { value: "tailor", label: T.toTailor[lang] },
          { value: "diy", label: T.diy[lang] },
        ]}
      />
    </div>
  );

  const orderSection = (
    <div className="space-y-4">
    {whoSwitch}
    <section aria-labelledby="order-title" className="print-order overflow-hidden rounded-xl bg-field">
      <div className="flex flex-wrap items-baseline justify-between gap-2 bg-ink px-5 py-4 text-sand">
        <h3 id="order-title" className="font-display text-2xl">
          {(diy ? T.guide : T.order)[lang]}
            <span className="ml-2 font-sans text-[15px]">{GARMENT_NAME[garment][lang]}</span>
          </h3>
        <span className="text-[15px]">{alterations.length > 0 ? count(alterations.length)[lang] : T.empty[lang]}</span>
      </div>
      {alterations.length === 0 ? (
        <p className="px-5 py-8 text-[15px] text-muted">{(diy ? T.emptyDiy : T.leadEmpty)[lang]}</p>
      ) : (
        <ol className="space-y-1 p-1">
          {views && (
            <li className="rounded-lg bg-paper p-4" aria-label={T.flat[lang]}>
              <GarmentFlat views={views} />
            </li>
          )}
          {alterations.map((a, i) => (
            <li key={a.id} className="rounded-lg bg-paper px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="num inline-flex h-6 w-6 shrink-0 translate-y-[-1px] items-center justify-center self-center rounded-full bg-mark text-[13px] font-semibold text-white" aria-label={numbered(i + 1)[lang]}>
                    {i + 1}
                  </span>
                  <span className="text-lg font-semibold">{a.action[lang]}</span>
                  <span className="text-[15px] text-muted">{a.part[lang]}</span>
                </p>
                <p className="num shrink-0 text-right font-display text-3xl leading-none" aria-label={a.amountCm !== undefined ? `${a.amountCm} cm` : T.toMeasureAria[lang]}>
                  {a.amountCm !== undefined ? (
                    <>
                      {a.amountCm}
                      <span className="ml-1 font-sans text-base">cm</span>
                    </>
                  ) : (
                    <span className="font-sans text-[15px] text-muted">{T.toMeasure[lang]}</span>
                  )}
                </p>
              </div>
              {diy ? guideBody(guides[i]) : <p className="mt-1.5 text-[15px] leading-relaxed">{a.instruction[lang]}</p>}
              <p className="mt-2 text-[13px] text-muted">
                {diy && guides[i].tailor && <span className="mr-2 font-medium text-mark">{T.tailorBetter[lang]}</span>}
                {a.from[lang]}
              </p>
            </li>
          ))}
        </ol>
      )}
      {altPattern && altSheet && (
        <div className="mx-1 mb-1 rounded-lg bg-paper p-4">
          <h4 className="text-lg font-semibold">{T.patternTitle[lang]}</h4>
          <p className="mt-1 text-[15px] text-muted">{T.patternSub[lang]}</p>
          <PatternPreview sheet={altSheet} text={0.5} className="mt-4 h-auto w-full rounded-xl bg-field" />
          <button type="button" className={`${buttonPrimary} no-print mt-4`} disabled={pdfBusy} onClick={downloadPdf}>
            {pdfBusy ? T.making[lang] : T.download[lang]}
          </button>
        </div>
      )}
      {alterations.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-2">
          <p className="text-[13px] text-muted">{T.checkFirst[lang]}</p>
          <button type="button" className={`${buttonGhost} no-print`} onClick={() => window.print()}>
            {T.print[lang]}
          </button>
        </div>
      )}
    </section>
    </div>
  );

  return (
    <div className="space-y-10">
      <section aria-labelledby="lead-title" className="space-y-4">
        <div>
          <h3 id="lead-title" className="text-xl font-semibold">
            {T.leadTitle[lang]}
          </h3>
          <p className="mt-1 text-[15px] text-muted">{T.leadSub[lang]}</p>
        </div>
        {writing}
        <details className="group rounded-xl bg-field p-4" open={listOpen} onToggle={(e) => setListOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer select-none text-[15px] font-medium">{T.orPick[lang]}</summary>
          <div className="mt-4 space-y-5">{chips}</div>
        </details>
        <details className="group rounded-xl bg-field p-4">
          <summary className="cursor-pointer select-none text-[15px] font-medium">{T.bodyMore[lang]}</summary>
          <div className="mt-4">{bodySection}</div>
        </details>
      </section>
      {orderSection}
    </div>
  );
}
