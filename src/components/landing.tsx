"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PatternPreview } from "@/components/pattern-preview";
import { draft } from "@/lib/pattern/draft";
import { layOut } from "@/lib/pattern/layout";
import { MEASURE_KO } from "@/lib/pattern/measures";
import { grade, GRADE_STEP } from "@/lib/rules/grading";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Progress 0..1 of a tall wrapper scrolling past its sticky stage, written straight to one element.
function useStageProgress(onProgress: (p: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onProgress);
  useEffect(() => {
    cb.current = onProgress;
  });
  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const total = el.offsetHeight - window.innerHeight;
        cb.current(total > 0 ? Math.min(1, Math.max(0, -el.getBoundingClientRect().top / total)) : 0);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return ref;
}

// Each step holds still for the middle half of its share of the scroll, then moves on.
const held = (p: number, steps: number) => {
  const s = p * (steps - 1);
  const i = Math.min(steps - 2, Math.floor(s));
  const t = Math.min(1, Math.max(0, (s - i - 0.25) / 0.5));
  return i + t * t * (3 - 2 * t);
};

export interface Frame {
  node: ReactNode;
  caption: string;
}

// The hero: a sentence split by a frame. The two halves hold their place while the frame in the
// middle steps through the garment's run: photo, measured, pattern, laid on fabric.
export function HeroReel({ left, right, sentence, frames }: { left: string; right: string; sentence: string; frames: Frame[] }) {
  const reel = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const wrap = useStageProgress((p) => {
    const el = reel.current;
    if (!el || window.innerWidth < 1024) return;
    const f = held(p, frames.length);
    const pitch = (el.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
    el.style.transform = `translateY(${-f * (pitch + 16)}px)`;
    setStep(Math.round(f));
  });
  return (
    <section ref={wrap} aria-labelledby="hero-title" className="relative lg:h-[200svh]">
      <div className="flex flex-col px-4 pb-16 pt-6 sm:px-8 lg:sticky lg:top-12 lg:block lg:h-[calc(100svh-3rem)] lg:overflow-hidden lg:p-0">
        <h1
          id="hero-title"
          className="font-display text-[11vw] leading-[1.02] tracking-[-0.02em] sm:text-[8vw] lg:absolute lg:inset-x-8 lg:top-1/2 lg:z-10 lg:flex lg:-translate-y-1/2 lg:justify-between lg:text-[clamp(36px,3.6vw,56px)]"
        >
          <span className="block">{left}</span>
          <span className="block text-right">{right}</span>
        </h1>
        {/* The reel: centred column, the frames before and after showing as slivers. */}
        <div className="order-3 mt-10 lg:absolute lg:inset-x-0 lg:top-10 lg:mx-auto lg:mt-0 lg:w-[calc((100svh-3rem-80px-32px)*0.83)]">
          <div ref={reel} className="space-y-4 will-change-transform">
            {frames.map((f, i) => (
              <figure
                key={f.caption}
                className={`relative flex aspect-[5/6] flex-col overflow-hidden rounded-[4px] bg-sand lg:h-[calc(100svh-3rem-80px-32px)] lg:aspect-auto ${i > 0 ? "hidden lg:flex" : ""}`}
              >
                <div className="relative min-h-0 flex-1 overflow-hidden">{f.node}</div>
                <figcaption className="order-first flex items-center justify-between gap-4 bg-ink px-4 py-2.5 text-[15px] text-sand lg:order-none">
                  <span>{f.caption}</span>
                  <span className="num hidden shrink-0 opacity-80 lg:inline">
                    {i + 1} / {frames.length}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
        <div className="order-2 mt-6 max-w-md lg:absolute lg:bottom-8 lg:left-8 lg:mt-0 lg:max-w-[min(30vw,380px)]">
          <p className="text-lg leading-relaxed">{sentence}</p>
          <Link href="/make" className="press mt-5 inline-flex rounded-[4px] bg-ink px-6 py-3 font-medium text-sand hover:bg-ink-strong">
            패턴 만들기
          </Link>
        </div>
        <p className="sr-only" aria-live="polite">
          {frames[step]?.caption}
        </p>
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

// Cards crossing a held photograph: the six garments travel right to left over the 1763 plate of
// a tailor's pieces laid flat, while the page scrolls.
export function GarmentRun({ heading, sub, lead, cards }: { heading: string; sub: string; lead: ReactNode; cards: GarmentCard[] }) {
  const track = useRef<HTMLDivElement>(null);
  const wrap = useStageProgress((p) => {
    const el = track.current;
    if (!el || window.innerWidth < 1024 || reduced()) {
      if (el) el.style.transform = "";
      return;
    }
    const travel = el.scrollWidth - (el.parentElement?.clientWidth ?? window.innerWidth);
    el.style.transform = `translateX(${-p * travel}px)`;
  });
  return (
    <section ref={wrap} aria-labelledby="garments-title" className="relative bg-ink text-sand lg:h-[180svh]">
      <div className="relative overflow-hidden lg:sticky lg:top-12 lg:h-[calc(100svh-3rem)]">
        <div className="relative px-4 pt-16 sm:px-8 lg:pt-10">
          <h2 id="garments-title" className="font-display text-[9vw] leading-none tracking-[-0.02em] lg:text-[clamp(36px,3.6vw,56px)]">
            {heading}
          </h2>
          <p className="mt-3 max-w-xl text-lg">{sub}</p>
        </div>
        <div className="relative mt-8 lg:absolute lg:inset-x-8 lg:bottom-[max(32px,6svh)] lg:mt-0 lg:overflow-hidden">
          <div ref={track} className="flex flex-col gap-6 px-4 pb-16 sm:px-8 lg:flex-row lg:gap-8 lg:p-0 lg:will-change-transform">
            {lead}
            {cards.map((c) => (
              <article key={c.name} className="flex shrink-0 flex-col overflow-hidden text-ink lg:h-[min(500px,60svh)] lg:w-[min(460px,32vw)]">
                <div className="relative aspect-[4/3] bg-sand lg:aspect-auto lg:min-h-0 lg:flex-1">{c.picture}</div>
                <div className="flex flex-col gap-3 p-6" style={{ background: c.tone }}>
                  <h3 className="shrink-0 font-display text-[32px] leading-none">{c.name}</h3>
                  <p className="text-lg leading-snug">{c.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// The one live thing: step the owner's T-shirt a size down or up and watch the pattern redraw.
export function GradeDemo({ measures }: { measures: Record<string, number> }) {
  const [steps, setSteps] = useState(0);
  const graded = useMemo(() => grade("t-shirt", measures, steps) as Record<string, number>, [measures, steps]);
  const sheet = useMemo(() => layOut(draft({ garment: "t-shirt", measures: graded, fabric: "knit" })), [graded]);
  const inc = GRADE_STEP["t-shirt"] as Record<string, number>;
  const shown = ["chest", "length", "shoulder", "sleeve", "hem", "armholeDepth"];
  const labels: Record<number, string> = {
    [-2]: "두 치수 작게",
    [-1]: "한 치수 작게",
    0: "내 옷",
    1: "한 치수 크게",
    2: "두 치수 크게",
  };
  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
      <div className="lg:col-span-8">
        <PatternPreview sheet={sheet} />
      </div>
      <div className="lg:col-span-4">
        <div role="radiogroup" aria-label="사이즈" className="grid grid-cols-5 gap-1 rounded-[4px] bg-sand-2 p-1">
          {[-2, -1, 0, 1, 2].map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={v === steps}
              aria-label={labels[v]}
              onClick={() => setSteps(v)}
              className={`press num rounded-[3px] py-3 text-lg font-medium ${v === steps ? "bg-ink text-sand" : "hover:bg-sand-3"}`}
            >
              {v === 0 ? "내 옷" : v > 0 ? `+${v}` : `−${-v}`}
            </button>
          ))}
        </div>
        <p className="mt-4 text-lg">{labels[steps]}</p>
        <table className="mt-4 w-full text-lg">
          <thead>
            <tr className="text-left text-[15px] text-muted">
              <th className="pb-2 font-normal">단면</th>
              <th className="pb-2 text-right font-normal">내 옷</th>
              <th className="pb-2 text-right font-normal">이 사이즈</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((k) => (
              <tr key={k} /* taste-skill-ignore: rule between table rows */ className="border-t border-sand-3">
                <td className="py-2">{MEASURE_KO[k]}</td>
                <td className="num py-2 text-right text-muted">{measures[k].toFixed(1)}</td>
                <td className="num py-2 text-right font-medium">{graded[k].toFixed(1)} cm</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-lg">
          한 치수에 가슴단면 {inc.chest}, 총장 {inc.length}, 소매길이 {inc.sleeve} cm씩. 기성복에서 흔한 간격이고, 소매산은 바뀐 진동둘레에 다시 맞춰 그립니다.
        </p>
      </div>
    </div>
  );
}
