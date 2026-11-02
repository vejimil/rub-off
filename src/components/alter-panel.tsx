"use client";

import { useState } from "react";
import { GarmentFlat } from "@/components/garment-flat";
import { useLang } from "@/components/lang";
import { Badge, buttonGhost, buttonPrimary, Segmented } from "@/components/ui";
import { compare, complaintsFor, DIFFICULTY_NAME, fromBody, fromComplaint, guarded, type Alteration, type Complaint } from "@/lib/fit/alter";
import { BODY_HOW, BODY_KEYS, BODY_NAME, targetsFromBody, type BodyFit, type BodyKey } from "@/lib/fit/body";
import { flatFor } from "@/lib/fit/flat";
import { MAX_TEXT, parse, type ReadComplaints } from "@/lib/fit/read-complaint";
import { L } from "@/lib/i18n/lang";
import { REQUIRED } from "@/lib/pattern/draft";
import { MEASURE_NAME } from "@/lib/pattern/measures";
import type { Fabric, GarmentKind } from "@/lib/pattern/types";

const ERRORS = {
  live_disabled: L("지금은 글 읽기를 쉬고 있습니다. 위 목록에서 골라 주십시오.", "Reading written text is paused right now. Please pick from the list above.", "Ahora mismo no se pueden leer textos. Elige de la lista de arriba."),
  visitor_limit: L("오늘 읽을 수 있는 글을 모두 썼습니다. 위 목록에서 골라 주십시오.", "You've used today's text readings. Please pick from the list above.", "Ya has usado las lecturas de texto de hoy. Elige de la lista de arriba."),
  daily_limit: L("오늘 읽을 수 있는 양을 모두 썼습니다. 위 목록에서 골라 주십시오.", "Today's text readings are used up. Please pick from the list above.", "Hoy ya no quedan lecturas de texto. Elige de la lista de arriba."),
  failed: L("글을 읽지 못했습니다. 잠시 후 다시 해 주십시오.", "Couldn't read the text. Please try again in a moment.", "No se pudo leer el texto. Inténtalo de nuevo en un momento."),
  offline: L("서버에 연결하지 못했습니다.", "Couldn't connect.", "No se pudo conectar."),
};

const T = {
  bag: L("가방은 입는 옷이 아니어서 고칠 치수가 없습니다.", "A bag isn't worn, so there are no fit measurements to change.", "Una bolsa no se lleva puesta, así que no hay medidas de ajuste que cambiar."),
  needMeasures: L(
    "먼저 이 옷의 치수가 필요합니다. 옷 사진을 올리거나, 치수 탭에 줄자로 잰 값을 넣어 주십시오. 불편한 점은 지금 골라도 됩니다.",
    "This garment's measurements come first: upload a photo of it, or type tape measurements in the measurements tab. You can already pick what bothers you.",
    "Primero hacen falta las medidas de esta prenda: sube una foto suya o escribe las medidas en la pestaña de medidas. Ya puedes elegir qué te molesta.",
  ),
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
  sayTitle: L("입었을 때 불편한 점", "What bothers you when you wear it", "Qué te molesta al llevarla"),
  saySub: L("해당하는 것을 고르거나, 아래에 말하듯 적어 주십시오.", "Pick what applies, or write it below the way you'd say it.", "Elige lo que corresponda o escríbelo abajo con tus palabras."),
  seated: L("앉아서 입을 때", "When seated", "En posición sentada"),
  general: L("길이와 품", "Length and fit", "Largo y holgura"),
  askNote: L(
    "재 본 길이가 있으면 넣어 주십시오. 모르면 비워 두면 수선집에서 잽니다.",
    "If you've measured it, enter the length. Leave it blank and the tailor will measure it.",
    "Si lo has medido, escribe la medida. Si lo dejas vacío, lo mide el taller.",
  ),
  write: L("직접 적기", "Write it yourself", "Escríbelo tú"),
  placeholder: L(
    "예: 휠체어에 앉으면 바지 뒤가 내려가고, 밑단이 3 cm쯤 짧아져요.",
    "e.g. In my wheelchair the back of my trousers drops, and the hem rides up about 3 cm.",
    "p. ej.: En la silla de ruedas se me baja la parte de atrás del pantalón y el bajo se sube unos 3 cm.",
  ),
  reading: L("읽는 중…", "Reading…", "Leyendo…"),
  find: L("이 글에서 고칠 곳 찾기", "Find what to alter in this text", "Buscar qué arreglar en el texto"),
  found: L("글에서 찾은 것", "Found in your text", "Encontrado en tu texto"),
  notListed: L("목록에 없는 불편함", "Something not on the list", "Algo que no está en la lista"),
  order: L("수선 의뢰서", "Alteration order", "Orden de arreglos"),
  empty: L("아직 비어 있습니다", "Empty so far", "Vacía por ahora"),
  emptyText: L(
    "몸 치수를 넣거나 불편한 점을 고르면, 수선집에 그대로 보여 줄 수 있는 의뢰서가 여기에 만들어집니다.",
    "Enter body measurements or pick what bothers you, and an order you can hand to a tailor as it is appears here.",
    "Escribe las medidas del cuerpo o elige qué te molesta, y aquí aparecerá una orden que puedes llevar tal cual al taller.",
  ),
  flat: L("도식화", "Technical flat", "Dibujo técnico"),
  toMeasure: L("재서 정함", "to measure", "a medir"),
  toMeasureAria: L("수선집에서 재서 정함", "The tailor measures it", "Lo mide el taller"),
  reversible: L("되돌릴 수 있음", "Reversible", "Reversible"),
  checkFirst: L("고치기 전에 옷을 입고 한 번 더 확인하십시오.", "Try the garment on and check once more before altering it.", "Pruébate la prenda y compruébalo otra vez antes de arreglarla."),
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

// Mode 4: fit this garment to its wearer. Tape-measured body sizes become target garment sizes;
// what the wearer says is wrong (picked, or written and sorted by Muse Spark) goes through the
// alteration rules; the result is a work order with a technical flat of the garment, marked.
export function AlterPanel({ garment, fabric, measures, sampleText }: AlterPanelProps) {
  const lang = useLang();
  const [body, setBody] = useState<Partial<Record<BodyKey, string>>>({});
  const [fit, setFit] = useState<BodyFit>("regular");
  const [picked, setPicked] = useState<Record<string, string>>({}); // complaint id → typed cm ("" if none)
  const [text, setText] = useState(sampleText?.text ?? "");
  const [read, setRead] = useState<{ text: string; read: ReadComplaints } | null>(sampleText ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof ERRORS | null>(null);

  const bodyNums = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v as number) && (v as number) > 0)) as Partial<Record<BodyKey, number>>;
  const targets = targetsFromBody(garment, bodyNums, fit, fabric, measures);
  const comparisons = compare(targets, measures, fabric);
  const options = complaintsFor(garment);
  const missing = REQUIRED[garment].filter((k) => !(Number.isFinite(measures[k]) && measures[k] > 0));

  const fromText: Complaint[] = read ? parse(read.read, read.text, garment) : [];
  const alterations: Alteration[] = [
    ...fromBody(garment, comparisons),
    ...Object.entries(picked).map(([id, cm]) => fromComplaint(garment, { id, amountCm: cm ? Number(cm) : undefined })),
    ...fromText.filter((c) => !(c.id in picked)).map((c) => fromComplaint(garment, c)),
  ].map((a) => guarded(a));
  const views = flatFor(garment, measures, fabric, alterations);

  async function analyse() {
    const t = text.trim();
    if (!t) return;
    if (sampleText && t === sampleText.text) return setRead(sampleText);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/complaints", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t, garment }) });
      const b = await res.json();
      if (!res.ok) setError(b.error in ERRORS ? (b.error as keyof typeof ERRORS) : "failed");
      else setRead({ text: t, read: b.read });
    } catch {
      setError("offline");
    } finally {
      setBusy(false);
    }
  }

  if (garment === "eco-bag") return <p className="text-[15px] text-muted">{T.bag[lang]}</p>;

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

  return (
    <div className="space-y-12">
      {missing.length > 0 && <p className="rounded-xl bg-mark-soft p-4 text-[15px]">{T.needMeasures[lang]}</p>}

      {/* The body, against this garment. */}
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

      {/* What the wearer says. */}
      <section aria-labelledby="say-title" className="space-y-5">
        <div>
          <h3 id="say-title" className="text-lg font-semibold">
            {T.sayTitle[lang]}
          </h3>
          <p className="mt-1 text-[15px] text-muted">{T.saySub[lang]}</p>
        </div>
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
        <div>
          <label htmlFor="say-text" className="mb-2 block text-[13px] text-muted">
            {T.write[lang]}
          </label>
          <textarea
            id="say-text"
            value={text}
            maxLength={MAX_TEXT}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={T.placeholder[lang]}
            className="w-full rounded-xl border border-line bg-field p-4 text-[15px] leading-relaxed"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className={buttonPrimary} disabled={busy || !text.trim()} onClick={analyse}>
              {busy ? T.reading[lang] : T.find[lang]}
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
      </section>

      {/* The work order. */}
      <section aria-labelledby="order-title" className="overflow-hidden rounded-xl bg-field">
        <div className="flex flex-wrap items-baseline justify-between gap-2 bg-ink px-5 py-4 text-sand">
          <h3 id="order-title" className="font-display text-2xl">
            {T.order[lang]}
          </h3>
          <span className="text-[15px]">{alterations.length > 0 ? count(alterations.length)[lang] : T.empty[lang]}</span>
        </div>
        {alterations.length === 0 ? (
          <p className="px-5 py-8 text-[15px] text-muted">{T.emptyText[lang]}</p>
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
                <p className="mt-1.5 text-[15px] leading-relaxed">{a.instruction[lang]}</p>
                <p className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={a.difficulty === "hard" ? "mark" : a.difficulty === "medium" ? "warn" : "ok"}>{DIFFICULTY_NAME[a.difficulty][lang]}</Badge>
                  {a.reversible && <Badge tone="chalk">{T.reversible[lang]}</Badge>}
                  <span className="text-[13px] text-muted">{a.from[lang]}</span>
                </p>
              </li>
            ))}
          </ol>
        )}
        {alterations.length > 0 && <p className="px-5 pb-4 pt-2 text-[13px] text-muted">{T.checkFirst[lang]}</p>}
      </section>
    </div>
  );
}
