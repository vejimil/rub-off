import Link from "next/link";

const STEPS = [
  ["사진 한 장", "옷을 A4 용지 옆에 펴놓고 위에서 찍습니다."],
  ["SAM 3.1", "옷, 소매, A4를 분리합니다."],
  ["기하로 cm", "A4로 원근을 보정하고 측정점마다 ±를 붙입니다. 잴 수 없으면 재지 않습니다."],
  ["패턴", "시접·식서·너치·골선이 들어간 1:1 A4 분할 PDF. 다른 사이즈로 그레이딩."],
  ["사이즈 결정", "Muse Spark가 쇼핑몰 실측표를 옮겨 적고, 코드가 내 옷과 비교합니다."],
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="text-sm uppercase tracking-widest text-muted">Rub-Off</p>
      <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-tight">아끼는 옷 한 벌을 사진 한 장으로 인쇄용 봉제 패턴으로</h1>
      <p className="mt-4 text-lg text-muted">
        봉제인이 손으로 1~2시간 걸려 하는 &lsquo;옷 본뜨기(rub-off)&rsquo;를 사진에서 합니다. 같은 사진으로 쇼핑몰 실측표에서 맞는 사이즈도 고릅니다.
      </p>
      <p className="mt-1 text-sm text-muted">Photograph a garment next to an A4 sheet; get a printable sewing pattern and a size decision.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/sample" className="rounded-md bg-ink px-5 py-3 text-paper">
          샘플 보기
        </Link>
        <Link href="/make" className="rounded-md border border-ink px-5 py-3">
          내 옷 사진으로 시작
        </Link>
      </div>
      <ol className="mt-12 space-y-4">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="flex gap-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card text-sm font-semibold ring-1 ring-line">{i + 1}</span>
            <div>
              <p className="font-semibold">{t}</p>
              <p className="text-sm text-muted">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-12 text-sm text-muted">패턴과 사이즈의 모든 숫자는 사진의 기하와 규칙표에서 나옵니다. 언어 모델이 숫자를 만들지 않습니다. 재단 전에 확인하십시오.</p>
    </main>
  );
}
