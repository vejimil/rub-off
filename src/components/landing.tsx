"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useLang } from "@/components/lang";
import { PatternPreview } from "@/components/pattern-preview";
import { L, type Local } from "@/lib/i18n/lang";
import { draft } from "@/lib/pattern/draft";
import { layOut } from "@/lib/pattern/layout";
import { MEASURE_NAME } from "@/lib/pattern/measures";
import { grade } from "@/lib/rules/grading";

const T = {
  make: L("패턴 만들기", "Make a pattern", "Crea un patrón"),
  prev: L("이전 옷", "Previous garment", "Prenda anterior"),
  next: L("다음 옷", "Next garment", "Prenda siguiente"),
  sizes: L("사이즈", "Size", "Talla"),
  mine: L("내 옷", "Mine", "La mía"),
  thisSize: L("이 사이즈", "This size", "Esta talla"),
  flat: L("단면", "Flat", "En plano"),
};
const STEP_LABEL: Record<number, Local> = {
  [-2]: L("두 치수 작게", "Two sizes down", "Dos tallas menos"),
  [-1]: L("한 치수 작게", "One size down", "Una talla menos"),
  0: L("내 옷", "My garment", "Mi prenda"),
  1: L("한 치수 크게", "One size up", "Una talla más"),
  2: L("두 치수 크게", "Two sizes up", "Dos tallas más"),
};

export interface Frame {
  node: ReactNode;
  caption: string;
}

// The hero: a sentence split by a column of frames. The two halves stay put while the frames
// (photo, measured, pattern) scroll up past them with the page: plain scrolling, nothing scripted.
export function HeroReel({ left, right, sentence, frames }: { left: string; right: string; sentence: string; frames: Frame[] }) {
  const lang = useLang();
  return (
    <section aria-labelledby="hero-title" className="relative">
      {/* The held layer lives in a box as tall as the section, so it lets go when the section ends. */}
      <div className="pointer-events-none z-10 px-5 pt-8 sm:px-10 lg:absolute lg:inset-0 lg:p-0">
        <div className="lg:sticky lg:top-12 lg:h-[calc(100svh-3rem)]">
          <h1
            id="hero-title"
            className={`pointer-events-auto font-display leading-[1.02] tracking-[-0.02em] lg:absolute lg:inset-x-16 lg:top-1/2 lg:flex lg:-translate-y-1/2 lg:justify-between ${lang === "ko" ? "text-[11vw] sm:text-[8vw] lg:text-[clamp(32px,3.2vw,50px)]" : "text-[9vw] sm:text-[6.5vw] lg:text-[clamp(26px,2.4vw,38px)]"}`}
          >
            <span className="block">{left}</span>
            <span className="block text-right">{right}</span>
          </h1>
          <div className="pointer-events-auto mt-8 max-w-md lg:absolute lg:bottom-12 lg:left-16 lg:mt-0 lg:max-w-[min(22vw,340px)]">
            <p className="text-lg leading-relaxed">{sentence}</p>
            <Link href={`/${lang}/make`} className="press mt-6 inline-flex rounded-[4px] bg-ink px-6 py-3 font-medium text-sand hover:bg-ink-strong">
              {T.make[lang]}
            </Link>
          </div>
        </div>
      </div>
      <div className="mt-12 space-y-8 px-5 pb-24 sm:px-10 lg:mx-auto lg:mt-0 lg:w-[calc((100svh-3rem-104px)*0.8)] lg:space-y-14 lg:px-0 lg:pb-14 lg:pt-[52px]">
        {frames.map((f) => (
          <figure key={f.caption} className="flex aspect-[5/6] flex-col overflow-hidden rounded-[4px] bg-sand lg:aspect-auto lg:h-[calc(100svh-3rem-104px)]">
            <div className="relative min-h-0 flex-1 overflow-hidden">{f.node}</div>
            <figcaption className="bg-ink px-4 py-2.5 text-[15px] text-sand">{f.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export interface GarmentCard {
  name: string;
  text: string;
  picture: ReactNode;
  tone: string;
}

// The six garments in a row of their own: it scrolls sideways (trackpad, shift + wheel, a swipe, the
// arrow buttons or the keyboard) and never takes over the page's vertical scroll.
export function GarmentRow({ heading, sub, cards, rowLabel }: { heading: string; sub: string; cards: GarmentCard[]; rowLabel: string }) {
  const lang = useLang();
  const row = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<"start" | "middle" | "end">("start");
  const onScroll = () => {
    const el = row.current;
    if (!el) return;
    setEdge(el.scrollLeft < 8 ? "start" : el.scrollLeft > el.scrollWidth - el.clientWidth - 8 ? "end" : "middle");
  };
  const page = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: "smooth" });
  const arrow = "press flex h-11 w-11 items-center justify-center rounded-full border border-sand/40 hover:border-sand disabled:opacity-30";
  return (
    <section aria-labelledby="garments-title" className="bg-ink py-28 text-sand lg:py-40">
      <div className="grid gap-6 px-5 sm:grid-cols-12 sm:items-end sm:gap-x-12 sm:px-10 lg:px-16">
        <h2 id="garments-title" className="font-display text-[9vw] leading-none tracking-[-0.02em] sm:col-span-5 sm:text-[8vw] lg:text-[clamp(32px,3.2vw,50px)]">
          {heading}
        </h2>
        <p className="max-w-xl text-lg leading-relaxed sm:col-span-5">{sub}</p>
        <div className="hidden justify-end gap-3 sm:col-span-2 sm:flex">
          <button type="button" aria-label={T.prev[lang]} onClick={() => page(-1)} disabled={edge === "start"} className={arrow}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M11 3 L5 9 L11 15" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
          <button type="button" aria-label={T.next[lang]} onClick={() => page(1)} disabled={edge === "end"} className={arrow}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M7 3 L13 9 L7 15" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
      </div>
      <div
        ref={row}
        onScroll={onScroll}
        tabIndex={0}
        role="region"
        aria-label={rowLabel}
        className="row-scroll mx-5 mt-14 flex snap-x snap-mandatory gap-6 overflow-x-auto overscroll-x-contain scroll-smooth pb-6 sm:mx-10 lg:mx-16 lg:gap-8"
      >
        {cards.map((c) => (
          <article key={c.name} className="flex w-[78vw] shrink-0 snap-start flex-col overflow-hidden text-ink sm:w-[360px] lg:w-[400px]">
            <div className="relative aspect-[4/3] bg-sand">{c.picture}</div>
            <div className="flex flex-1 flex-col gap-3 p-6" style={{ background: c.tone }}>
              <h3 className="font-display text-[32px] leading-none">{c.name}</h3>
              <p className="text-lg leading-snug">{c.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// The one live thing: step the owner's T-shirt a size down or up and watch the pattern redraw.
export function GradeDemo({ measures, note }: { measures: Record<string, number>; note: string }) {
  const lang = useLang();
  const [steps, setSteps] = useState(0);
  const graded = useMemo(() => grade("t-shirt", measures, steps) as Record<string, number>, [measures, steps]);
  const sheet = useMemo(() => layOut(draft({ garment: "t-shirt", measures: graded, fabric: "knit" })), [graded]);
  const shown = ["chest", "length", "shoulder", "sleeve", "hem", "armholeDepth"];
  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
      <div className="lg:col-span-8">
        <PatternPreview sheet={sheet} dims />
      </div>
      <div className="lg:col-span-4">
        <div role="radiogroup" aria-label={T.sizes[lang]} className="grid grid-cols-5 gap-1 rounded-[4px] bg-sand-2 p-1">
          {[-2, -1, 0, 1, 2].map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={v === steps}
              aria-label={STEP_LABEL[v][lang]}
              onClick={() => setSteps(v)}
              className={`press num rounded-[3px] py-3 text-lg font-medium ${v === steps ? "bg-ink text-sand" : "hover:bg-sand-3"}`}
            >
              {v === 0 ? T.mine[lang] : v > 0 ? `+${v}` : `−${-v}`}
            </button>
          ))}
        </div>
        <p className="mt-4 text-lg">{STEP_LABEL[steps][lang]}</p>
        <table className="mt-4 w-full text-lg">
          <thead>
            <tr className="text-left text-[15px] text-muted">
              <th className="pb-2 font-normal">{T.flat[lang]}</th>
              <th className="pb-2 text-right font-normal">{T.mine[lang]}</th>
              <th className="pb-2 text-right font-normal">{T.thisSize[lang]}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((k) => (
              <tr key={k} /* taste-skill-ignore: rule between table rows */ className="border-t border-sand-3">
                <td className="py-2">{MEASURE_NAME[k][lang]}</td>
                <td className="num py-2 text-right text-muted">{measures[k].toFixed(1)}</td>
                <td className="num py-2 text-right font-medium">{graded[k].toFixed(1)} cm</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-lg">{note}</p>
      </div>
    </div>
  );
}
