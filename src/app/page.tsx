import Link from "next/link";
import { GarmentRow, GradeDemo, HeroReel, type GarmentCard } from "@/components/landing";
import { PatternPreview, PiecesOutline } from "@/components/pattern-preview";
import { PageScript } from "@/components/page-script";
import { PhotoOverlay } from "@/components/photo-overlay";
import type { SampleRun } from "@/lib/client/types";
import { svgPath, type Pt } from "@/lib/geom/point";
import { bounds } from "@/lib/geom/polygon";
import { nest, piecesToCut } from "@/lib/nest/nest";
import { draft } from "@/lib/pattern/draft";
import { EXAMPLES } from "@/lib/pattern/examples";
import { layOut, pagesFor, type Sheet } from "@/lib/pattern/layout";
import { MEASURE_KO } from "@/lib/pattern/measures";
import type { GarmentKind } from "@/lib/pattern/types";
import shorts from "@/lib/sample/shorts-run.json";
import tee from "@/lib/sample/tee-run.json";

// The owner's T-shirt (docs/EXPERIMENTS.md, 11/1): the photo run, and everything drafted from it.
// The neck drops sit under the rib where a photo can't see; those two are the owner's tape values,
// and the tape column of the comparison is the owner's tape measurement of the same shirt.
const TAPE: Record<string, number> = {
  length: 70,
  chest: 56,
  shoulder: 51,
  hem: 55.5,
  sleeve: 23,
  sleeveOpening: 18,
  bicep: 23.5,
  neckWidth: 16,
  armholeDepth: 30,
  shoulderDrop: 6,
};
const TAPE_NECK = { frontNeckDrop: 12, backNeckDrop: 2.5 };
const FABRIC: [number, number] = [150, 100];

const exampleSheet = (g: GarmentKind): Sheet => layOut(draft({ garment: g, measures: EXAMPLES[g].m, fabric: EXAMPLES[g].fabric }));

export default function Home() {
  const run = tee as unknown as SampleRun;
  const shortsRun = shorts as unknown as SampleRun;
  const measured = run.run.measured.values as Record<string, { cm: number; plusMinusCm: number }>;
  const measures = {
    ...Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, Math.round(v.cm * 10) / 10])),
    ...TAPE_NECK,
  };
  const pattern = draft({ garment: "t-shirt", measures, fabric: "knit" });
  const sheet = layOut(pattern);
  const [cols, rows] = pagesFor(sheet.width, sheet.height);
  const fabric: Pt[] = [
    [0, 0],
    [FABRIC[0], 0],
    [FABRIC[0], FABRIC[1]],
    [0, FABRIC[1]],
  ];
  const cut = nest(piecesToCut(pattern), [fabric], {});
  const compare = Object.keys(TAPE)
    .filter((k) => measured[k])
    .map((k) => ({
      key: k,
      tape: TAPE[k],
      photo: measured[k].cm,
      pm: measured[k].plusMinusCm,
    }));
  const inside = compare.filter((c) => Math.abs(c.photo - c.tape) <= c.pm + 0.05).length;
  const pct = (k: string) => {
    const c = compare.find((x) => x.key === k)!;
    const v = ((c.photo - c.tape) / c.tape) * 100;
    return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;
  };

  const frames = [
    {
      // eslint-disable-next-line @next/next/no-img-element -- committed sample photo, shown as is
      node: <img src={run.photo.src} alt="A4 용지를 올려 바닥에 편 티셔츠" width={run.photo.width} height={run.photo.height} className="h-full w-full object-contain" />,
      caption: "A4 용지를 올리고 위에서 찍은 티셔츠",
    },
    {
      node: (
        <div className="flex h-full items-center justify-center">
          <div className="aspect-[3/4] h-full max-w-full">
            <PhotoOverlay photo={run.photo} run={run.run} className="w-full bg-sand" />
          </div>
        </div>
      ),
      caption: `윤곽에서 잰 단면 ${compare.length}곳, 값마다 ±`,
    },
    {
      node: (
        <div className="absolute inset-0 flex items-center bg-paper p-4">
          <PatternPreview sheet={sheet} className="h-auto w-full" />
        </div>
      ),
      caption: `1:1 패턴, A4 ${cols * rows}장에 나눠 인쇄`,
    },
  ];

  const tones = ["#d9cbb0", "#cfbf9f", "#dccfb6", "#d3c4a6", "#d8caae", "#cebd9c"];
  const cover = (src: string, alt: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- committed sample photos
    <img src={src} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
  );
  const drawing = (g: GarmentKind) => (
    <div className="absolute inset-0 p-6">
      <PiecesOutline sheet={exampleSheet(g)} />
    </div>
  );
  const cards: GarmentCard[] = [
    {
      name: "티셔츠",
      text: "앞판·뒤판은 골선, 소매 2장. 사진에서 단면 10곳을 잽니다.",
      picture: cover(run.photo.src, "A4 용지를 올려 편 티셔츠"),
      tone: tones[0],
    },
    {
      name: "반바지",
      text: "앞판·뒤판 2장씩, 고무줄 허리. 허리·엉덩이·밑위를 잽니다.",
      picture: cover(shortsRun.photo.src, "A4 용지 옆에 편 반바지"),
      tone: tones[1],
    },
    {
      name: "셔츠",
      text: "앞판 2장, 뒤판 골선, 소매, 칼라, 커프스.",
      picture: drawing("shirt"),
      tone: tones[2],
    },
    {
      name: "후드 집업",
      text: "지퍼 앞판 2장, 두 쪽 모자, 밑단·소매 시보리.",
      picture: drawing("hoodie"),
      tone: tones[3],
    },
    {
      name: "고무줄 스커트",
      text: "총장과 밑단단면, 두 값이면 그립니다.",
      picture: drawing("skirt"),
      tone: tones[4],
    },
    {
      name: "에코백",
      text: "몸판 골선 1장과 손잡이 2장, 바닥 모서리는 접어 박기.",
      picture: drawing("eco-bag"),
      tone: tones[5],
    },
  ];

  const outputs = [
    {
      name: "패턴 PDF",
      text: "A4로 나눠 인쇄하고, 10 cm 사각형으로 배율을 확인합니다.",
      bg: "bg-paper text-ink",
      pic: <PatternPreview sheet={sheet} className="h-auto w-full" />,
    },
    {
      name: "그레이딩",
      text: "한두 치수 크게, 작게. 아래에서 바로 바꿔 볼 수 있습니다.",
      bg: "bg-sand-3 text-ink",
      pic: <PiecesOutline sheet={sheet} className="h-auto w-full" />,
    },
    {
      name: "사이즈",
      text: "쇼핑몰 실측표를 Muse Spark가 읽고, 내 옷과 같은 핏인 사이즈를 고릅니다.",
      bg: "bg-ink text-sand",
      // eslint-disable-next-line @next/next/no-img-element -- self-made sample size table
      pic: <img src="/samples/size-table.png" alt="직접 만든 예시 실측표" loading="lazy" className="h-auto w-full rounded-[2px]" />,
    },
    {
      name: "원단 배치",
      text: "가진 원단 크기를 넣으면 식서를 지켜 조각이 들어가는지 봅니다.",
      bg: "bg-muted text-sand",
      pic: <CutLayout fabric={fabric} placed={cut.placed} light />,
    },
  ];

  const steps = [
    {
      verb: "펴고",
      text: "바닥에 옷을 펴고 손바닥으로 주름만 폅니다. 소매와 다리는 몸판에서 떨어뜨립니다.",
      pic: cover(shortsRun.photo.src, "바닥에 편 반바지와 A4 용지"),
    },
    {
      verb: "올리고",
      text: "A4 용지를 옷 위나 옆에 둡니다. 네 모서리가 다 보이면 비스듬히 찍은 원근까지 펴서 잽니다.",
      // eslint-disable-next-line @next/next/no-img-element -- committed sample photo
      pic: <img src={run.photo.src} alt="티셔츠 위의 A4 용지" loading="lazy" className="h-full w-full object-cover object-[50%_75%]" />,
    },
    {
      verb: "찍고",
      text: "폰을 바닥과 평행하게 들고 옷 전체가 들어오게 한 장. 뒷면도 찍으면 서로 모자란 값을 채웁니다.",
      pic: (
        <div className="flex h-full items-center">
          <PhotoOverlay photo={run.photo} run={run.run} className="w-full" />
        </div>
      ),
    },
  ];

  return (
    <main className="flex-1">
      {/* Mounted with the page, so it touches the page's elements only after they have hydrated. */}
      <PageScript />
      <HeroReel
        left="펴 놓은 옷을"
        right="1:1 패턴으로"
        sentence="옷을 A4 용지와 함께 바닥에 펴고 위에서 한 장 찍으면, 인쇄해 바로 자를 수 있는 패턴과 맞는 사이즈, 원단 배치가 나옵니다."
        frames={frames}
      />

      {/* Proof: the photo values against the tape. */}
      <section aria-labelledby="tape-title">
        <div className="grid gap-10 px-5 py-32 sm:px-10 lg:px-16 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-8 lg:py-48">
          <div className="lg:col-span-5" data-reveal>
            <h2 id="tape-title" className="font-display text-[9vw] leading-[1.05] tracking-[-0.02em] sm:text-[8vw] lg:text-[clamp(32px,3.2vw,50px)]">
              줄자로 다시 쟀습니다
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed">
              티셔츠 앞면 사진 한 장에서 잰 값입니다. 같은 옷을 줄자로 잰 {compare.length}곳 중 {inside}곳이 사진이 붙인 ± 안에 들었습니다. 가슴단면 {pct("chest")}, 밑단단면 {pct("hem")}, 소매단면{" "}
              {pct("sleeveOpening")}.
            </p>
            <p className="mt-4 max-w-md text-lg">어깨점은 솔기가 잘 안 보여 사진에서 두 번 눌러 찍었습니다. 앞목깊이처럼 사진에 안 보이는 값은 재지 않고 줄자 값을 받습니다.</p>
          </div>
          <div className="lg:col-span-7" data-reveal style={{ ["--d" as string]: 1 }}>
            <table className="w-full text-lg">
              <caption className="sr-only">티셔츠 단면: 줄자 값과 사진 값</caption>
              <thead>
                <tr className="text-left text-[15px] text-muted">
                  <th className="pb-4 font-normal">단면</th>
                  <th className="pb-4 text-right font-normal">줄자</th>
                  <th className="pb-4 text-right font-normal">사진</th>
                  <th className="pb-4 text-right font-normal">차이</th>
                </tr>
              </thead>
              <tbody>
                {compare.map((c) => {
                  const d = c.photo - c.tape;
                  return (
                    <tr key={c.key} /* taste-skill-ignore: rule between table rows */ className="border-t border-sand-3">
                      <td className="py-3.5">{MEASURE_KO[c.key]}</td>
                      <td className="num py-3.5 text-right">{c.tape.toFixed(1)}</td>
                      <td className="num py-3.5 text-right">
                        {c.photo.toFixed(1)} <span className="text-muted">± {c.pm.toFixed(1)}</span>
                      </td>
                      <td className="num py-3.5 text-right">
                        {d >= 0 ? "+" : "−"}
                        {Math.abs(d).toFixed(1)} cm
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <GarmentRow heading="여섯 가지 옷" sub="티셔츠와 반바지는 실제로 찍어 잰 옷, 나머지는 보통 치수로 그린 조각입니다. 옆으로 넘겨 보세요." cards={cards} />

      {/* What comes out: four results. */}
      <section aria-labelledby="outputs-title" className="bg-sand-2 px-5 py-32 sm:px-10 lg:px-16 lg:py-48">
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-8">
          <h2 id="outputs-title" className="font-display text-[9vw] leading-[1.05] tracking-[-0.02em] sm:text-[8vw] lg:col-span-6 lg:text-[clamp(32px,3.2vw,50px)]" data-reveal>
            사진 한 장에서 네 가지
          </h2>
          <p className="max-w-lg text-lg leading-relaxed lg:col-span-5 lg:col-start-8 lg:self-end" data-reveal style={{ ["--d" as string]: 1 }}>
            AI는 사진에서 옷과 A4 용지를 찾는 데만 쓰고, 치수는 그 윤곽을 직접 재서 냅니다. 사진으로 잴 수 없는 곳은 숫자를 지어내지 않고 줄자로 재 달라고 알려 드립니다.
          </p>
        </div>
        <div className="mt-24 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {outputs.map((c, i) => (
            <article key={c.name} data-reveal style={{ ["--d" as string]: i }} className={`flex flex-col rounded-[4px] p-7 ${c.bg}`}>
              <h3 className="font-display text-[32px] leading-none">{c.name}</h3>
              <div className="order-first mb-6 flex aspect-[4/3] items-center">{c.pic}</div>
              <p className="mt-3 text-lg leading-snug">{c.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* The live thing. */}
      <section aria-labelledby="grade-title" className="px-5 py-32 sm:px-10 lg:px-16 lg:py-48">
        <div className="mb-16 grid gap-6 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-8">
          <h2 id="grade-title" className="font-display text-[9vw] leading-[1.05] tracking-[-0.02em] sm:text-[8vw] lg:col-span-7 lg:text-[clamp(32px,3.2vw,50px)]" data-reveal>
            한 치수 크게 그려 보기
          </h2>
          <p className="max-w-lg text-lg leading-relaxed lg:col-span-5 lg:self-end" data-reveal style={{ ["--d" as string]: 1 }}>
            사진으로 잰 그 티셔츠입니다. 치수를 고르면 잰 값을 옮기고 패턴을 처음부터 다시 그립니다.
          </p>
        </div>
        <div data-reveal style={{ ["--d" as string]: 2 }}>
          <GradeDemo measures={measures} />
        </div>
      </section>

      {/* How to shoot: one verb at a time. */}
      <section id="how" aria-labelledby="how-title" className="bg-paper px-5 py-32 sm:px-10 lg:px-16 lg:py-48">
        <h2 id="how-title" className="font-display text-[9vw] leading-[1.05] tracking-[-0.02em] sm:text-[8vw] lg:text-[clamp(32px,3.2vw,50px)]" data-reveal>
          찍는 법
        </h2>
        {steps.map((s, i) => (
          <div key={s.verb} className="mt-24 grid items-center gap-10 sm:grid-cols-12 sm:gap-x-12 lg:mt-36">
            <h3 className={`font-display text-[18vw] leading-[0.9] tracking-[-0.03em] sm:text-[9vw] ${i % 2 ? "sm:order-2 sm:col-span-6 sm:col-start-7 sm:text-right" : "sm:col-span-6"}`} data-reveal>
              {s.verb}
            </h3>
            <div className={`grid gap-6 lg:grid-cols-2 lg:items-end ${i % 2 ? "sm:order-1 sm:col-span-6" : "sm:col-span-6"}`} data-reveal style={{ ["--d" as string]: 1 }}>
              <div className="relative aspect-[4/5] overflow-hidden rounded-[4px] bg-well">{s.pic}</div>
              <p className="text-lg leading-relaxed">{s.text}</p>
            </div>
          </div>
        ))}
      </section>

      {/* The call: the whole band is the link. */}
      <Link
        href="/make"
        className="group relative flex h-[46svh] flex-col justify-between bg-ink px-5 py-6 text-sand transition-colors duration-150 hover:bg-sand-3 hover:text-ink focus-visible:bg-sand-3 focus-visible:text-ink sm:px-10 lg:px-16 lg:h-[60svh]"
      >
        <span className="max-w-sm self-end text-lg leading-snug sm:text-right">옷 사진 한 장과 A4 용지 한 장이면 됩니다. 사진을 올리면 바로 잽니다.</span>
        <span className="flex items-end gap-[2vw]">
          <span className="font-display text-[20vw] leading-[0.8] tracking-[-0.04em] sm:text-[15vw]">만들기</span>
          <svg
            viewBox="0 0 48 48"
            aria-hidden
            className="mb-[1vw] h-[6vw] w-[6vw] shrink-0 lg:h-[4.5vw] lg:w-[4.5vw] transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1"
          >
            <path d="M12 36 L36 12 M16 12 H36 V32" fill="none" stroke="currentColor" strokeWidth="3" />
          </svg>
        </span>
      </Link>

      <footer className="overflow-hidden bg-sand-2 px-5 pb-8 pt-16 sm:px-10 lg:px-16">
        <p className="font-display text-[20vw] leading-[0.8] tracking-[-0.04em] sm:text-[15vw]" aria-hidden>
          Rub-Off
        </p>
        <div className="mt-16 grid gap-12 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-8">
          <ul className="space-y-2 font-display text-[32px] lg:col-span-5">
            <li>
              <Link href="/make" className="link">
                패턴 만들기
              </Link>
            </li>
            <li>
              <Link href="/sample" className="link">
                샘플 보기
              </Link>
            </li>
            <li>
              <Link href="/#how" className="link">
                찍는 법
              </Link>
            </li>
          </ul>
          <div className="grid gap-8 text-[15px] sm:grid-cols-2 lg:col-span-7">
            <div>
              <p className="font-medium">만든 방법</p>
              <p className="mt-2">Meta SAM 3.1이 옷과 A4를 나누고, Muse Spark가 접힌 소매와 실측표를 읽습니다. 숫자는 사진의 기하와 규칙표에서 나옵니다.</p>
            </div>
            <div>
              <p className="font-medium">재단 전에</p>
              <p className="mt-2">인쇄한 10 cm 사각형을 자로 재고, ±가 큰 값은 줄자로 확인하십시오.</p>
            </div>
          </div>
        </div>
        <div className="mt-24 flex items-center justify-between gap-6 text-[15px]">
          <span>사진 속 옷과 실측표는 만든 사람의 것입니다.</span>
          <a href="#hero-title" className="link">
            맨 위로
          </a>
        </div>
      </footer>
    </main>
  );
}

// Pieces placed on a fabric rectangle (cm), drawn in the page's ink (or in sand on a dark card).
function CutLayout({ fabric, placed, light = false }: { fabric: Pt[]; placed: { piece: { id: string }; outline: Pt[] }[]; light?: boolean }) {
  const b = bounds(fabric);
  return (
    <svg viewBox={`${b.minX - 2} ${b.minY - 2} ${b.maxX - b.minX + 4} ${b.maxY - b.minY + 4}`} className="h-auto w-full" role="img" aria-label="원단 위 재단 배치">
      <path d={svgPath(fabric, true)} fill={light ? "rgba(230,219,199,0.15)" : "var(--sand)"} stroke={light ? "var(--sand)" : "var(--ink)"} strokeWidth={0.6} />
      {placed.map((p, i) => (
        <path key={`${p.piece.id}-${i}`} d={svgPath(p.outline, true)} fill={light ? "rgba(230,219,199,0.35)" : "rgba(6,43,138,0.12)"} stroke={light ? "var(--sand)" : "var(--ink)"} strokeWidth={0.5} />
      ))}
    </svg>
  );
}
