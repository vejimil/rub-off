import Link from "next/link";
import { notFound } from "next/navigation";
import { GarmentFlat } from "@/components/garment-flat";
import { GarmentToPattern } from "@/components/garment-to-pattern";
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
import { layOut, pagesFor } from "@/lib/pattern/layout";
import { MEASURE_NAME } from "@/lib/pattern/measures";
import type { GarmentKind } from "@/lib/pattern/types";
import { fromComplaint, guarded } from "@/lib/fit/alter";
import { flatFor } from "@/lib/fit/flat";
import { parse } from "@/lib/fit/read-complaint";
import { isLang, L, type Lang, type Local } from "@/lib/i18n/lang";
import { GARMENT_NAME } from "@/lib/i18n/names";
import { GRADE_STEP } from "@/lib/rules/grading";
import { COMPLAINT_EXAMPLE } from "@/lib/sample/complaints";
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

// The page's words. Headlines stay short in every language: two lines at most.
const T = {
  heroLeft: L("내 옷을", "Your garment,", "Tu prenda,"),
  heroRight: L("패턴과 수선으로", "into pattern and alterations", "en patrón y arreglos"),
  heroSentence: L(
    "옷을 A4 용지와 함께 바닥에 펴고 위에서 한 장 찍으면, 인쇄해 바로 자를 수 있는 패턴과 수선집에 보여 줄 의뢰서가 나옵니다.",
    "Lay a garment flat with an A4 sheet and take one photo from above. You get a pattern you can print and cut, and an alteration order to hand to a tailor.",
    "Extiende una prenda con una hoja A4 y hazle una foto desde arriba. Obtienes un patrón para imprimir y cortar, y una orden de arreglos para llevar al taller.",
  ),
  photoAlt: L("A4 용지를 올려 바닥에 편 티셔츠", "A T-shirt laid flat with an A4 sheet on it", "Una camiseta extendida con una hoja A4 encima"),
  framePhoto: L("A4 용지를 올리고 위에서 찍은 티셔츠", "The T-shirt with an A4 sheet, shot from above", "La camiseta con una hoja A4, fotografiada desde arriba"),
  tapeTitle: L("자로 쟀을 때와 거의 같습니다", "Close to measuring by hand", "Casi como medir a mano"),
  tapeNote: L(
    "어깨 솔기가 잘 안 보여 어깨점은 사진에서 직접 찍었습니다. 앞목깊이처럼 사진에 보이지 않는 곳은 자로 잰 값을 씁니다.",
    "The shoulder seams were hard to see, so the shoulder points were tapped on the photo. What a photo can't see, like the front neck drop, is measured by hand.",
    "Las costuras del hombro se veían poco, así que los puntos del hombro se marcaron a mano en la foto. Lo que la foto no ve, como la profundidad del escote, se mide a mano.",
  ),
  tapeCaption: L("티셔츠 단면: 자로 잰 값과 사진으로 잰 값", "T-shirt, flat: measured by hand and from the photo", "Camiseta, en plano: medida a mano y en la foto"),
  colFlat: L("단면", "Flat", "En plano"),
  colHand: L("자로", "By hand", "A mano"),
  colPhoto: L("사진으로", "From the photo", "En la foto"),
  colDiff: L("차이", "Difference", "Diferencia"),
  garmentsTitle: L("옷과 소품 열세 가지", "Thirteen things to sew", "Trece cosas para coser"),
  garmentsSub: L(
    "고르면 그 옷으로 바로 시작합니다. 내 옷 사진으로 재거나, 사진이 없으면 보통 치수로 먼저 그려 볼 수 있습니다.",
    "Pick one to start with it: measure your own garment from a photo, or, without one, draft it from typical measurements first.",
    "Elige una para empezar con ella: mide tu prenda con una foto o, sin foto, trázala primero con medidas típicas.",
  ),
  garmentsRow: L("옷과 소품 열세 가지, 옆으로 넘기기", "Thirteen things to sew, scroll sideways", "Trece cosas para coser, desliza hacia el lado"),
  startWith: L("이 옷으로 시작", "Start with this", "Empezar con esta"),
  outputsTitle: L("사진 한 장으로 해결", "One photo does it", "Con una sola foto"),
  outputsSub: L(
    "사진에 안 보이는 곳은 직접 측정으로 표시합니다.",
    "Where the photo can't see, the value is marked for the tape.",
    "Donde la foto no llega, el valor queda marcado para la cinta.",
  ),
  sizeTableAlt: L("직접 만든 예시 실측표", "A sample size chart, self-made", "Una tabla de medidas de ejemplo, hecha a mano"),
  alterTitle: L("불편한 점을 수선으로", "Complaints into alterations", "De la molestia al arreglo"),
  alterP1: L(
    "입을 사람이 불편한 점을 고르거나 적으면, 어디를 몇 cm 고칠지 도식화에 표시합니다. 수선집에 그대로 보여 주면 되고, 직접 고친다면 순서와 실제 크기 수선 패턴도 받을 수 있습니다.",
    "The person who wears it picks or writes what bothers them. Where to alter, and by how many centimetres, is marked on a technical drawing. Show it to a tailor as it is, or do it yourself with the steps and an actual-size alteration pattern.",
    "Quien lleva la prenda elige o escribe lo que le molesta. Dónde arreglar, y cuántos centímetros, queda marcado en un dibujo técnico. Llévaselo así a la modista, o hazlo tú con los pasos y un patrón de arreglos a tamaño real.",
  ),
  alterP2: L(
    "줄자로 잰 몸 치수를 넣으면 옷과 비교해 줄이거나 늘릴 곳도 찾아 줍니다.",
    "Add body measurements taken with a tape and it also finds where to take in or let out.",
    "Añade medidas del cuerpo tomadas con cinta y también encuentra dónde meter o sacar.",
  ),
  quoteBy: L(
    "휠체어를 타는 사람이 고무줄 바지를 입고 불편했던 점을 적은 글 (예시)",
    "What a wheelchair user wrote about elastic-waist trousers (an example)",
    "Lo que escribió una persona en silla de ruedas sobre su pantalón de cintura elástica (un ejemplo)",
  ),
  order: L("수선 의뢰서", "Alteration order", "Orden de arreglos"),
  measureLater: L("재서 정함", "to be measured", "por medir"),
  orderFoot: (n: number) =>
    L(
      `고무줄 바지, 고칠 곳 ${n}군데. 빗금은 덧대는 천, 겹빗금은 덜어 내는 천, 붉은 점선은 새로 박거나 트는 곳입니다. 고치기 전에 입어 보고 확인하십시오.`,
      `Elastic-waist trousers, ${n} changes. Hatching is fabric added, cross-hatching is fabric taken away, red dashes are new seams or openings. Try it on and check before altering.`,
      `Pantalón de cintura elástica, ${n} cambios. El rayado es tela que se añade, el cuadriculado es tela que se quita, la línea roja discontinua es una costura o abertura nueva. Pruébatelo y comprueba antes de arreglar.`,
    ),
  alterMine: L("내 옷 찍어서 고치기", "Photograph your garment and fix it", "Fotografía tu prenda y arréglala"),
  alterExample: L("예시로 해 보기", "Try an example", "Prueba un ejemplo"),
  gradeTitle: L("다른 사이즈로 만들기", "Make it in another size", "Hazlo en otra talla"),
  gradeSub: L(
    "위에서 사진으로 잰 그 티셔츠입니다. 사이즈를 고르면 치수가 바뀌고, 패턴을 처음부터 다시 그립니다.",
    "The same T-shirt measured from the photo above. Pick a size: the measurements change and the pattern is drafted again from scratch.",
    "La misma camiseta medida en la foto de arriba. Elige una talla: las medidas cambian y el patrón se vuelve a trazar desde cero.",
  ),
  howTitle: L("찍는 법", "How to shoot", "Cómo hacer la foto"),
  ctaLine: L("옷 사진 한 장과 A4 용지 한 장이면 됩니다.", "One photo of the garment and one A4 sheet.", "Una foto de la prenda y una hoja A4."),
  ctaWord: L("만들기", "Make", "Crear"),
  footMake: L("패턴 만들기", "Make a pattern", "Crear patrón"),
  footExamples: L("예시 보기", "Examples", "Ejemplos"),
  footAlter: L("수선하기", "Alterations", "Arreglos"),
  footHow: L("찍는 법", "How to shoot", "Cómo hacer la foto"),
  builtTitle: L("만든 방법", "How it's made", "Cómo está hecho"),
  built: L(
    "Meta의 SAM 3.1이 사진에서 옷과 A4 용지를 찾고, Muse Spark가 소매가 접혔는지 보고 실측표와 불편한 점을 적은 글을 읽습니다.",
    "Meta's SAM 3.1 finds the garment and the A4 sheet in the photo; Muse Spark checks whether a sleeve is folded and reads a shop's size chart and what the wearer wrote.",
    "SAM 3.1 de Meta encuentra la prenda y la hoja A4 en la foto; Muse Spark mira si una manga está doblada y lee la tabla de medidas de una tienda y lo que escribió quien la lleva.",
  ),
  beforeCutTitle: L("재단 전에", "Before you cut", "Antes de cortar"),
  beforeCut: L("인쇄한 10 cm 사각형을 자로 재고, ±가 큰 값은 줄자로 확인하십시오.", "Measure the printed 10 cm square with a ruler, and check any value with a large ± with a tape.", "Mide con una regla el cuadrado de 10 cm impreso y comprueba con cinta los valores con un ± grande."),
  owner: L("사진 속 옷은 제 옷이고, 실측표는 제가 만든 예시입니다.", "The garments are my own; the size chart is one I made.", "Las prendas son mías; la tabla de medidas la hice yo."),
  top: L("맨 위로", "Back to top", "Volver arriba"),
  cutAlt: L("원단 위 재단 배치", "Pattern pieces placed on the fabric", "Piezas del patrón colocadas en la tela"),
};

const OUTPUTS = {
  alter: { name: L("수선 의뢰서", "Alteration order", "Orden de arreglos"), text: L("불편한 점을 적으면 어디를 몇 cm 고칠지 도식화에 표시합니다. 직접 고칠 순서와 패턴도 나옵니다.", "Write what bothers you; where to alter and by how much is marked on a drawing, with steps and a pattern if you do it yourself.", "Escribe lo que te molesta; dónde arreglar y cuánto queda marcado en un dibujo, con los pasos y un patrón si lo haces tú.") },
  pdf: { name: L("패턴 PDF", "Pattern PDF", "Patrón en PDF"), text: L("솔기마다 길이를 적어 A4로 나눠 인쇄합니다. 10 cm 사각형으로 배율을 확인합니다.", "Every seam labelled with its length, printed across A4 pages. A 10 cm square checks the scale.", "Cada costura con su largo, impreso en hojas A4. Un cuadrado de 10 cm comprueba la escala.") },
  grade: { name: L("그레이딩", "Grading", "Escalado"), text: L("한두 치수 크게, 또는 작게. 아래에서 바로 바꿔 볼 수 있습니다.", "One or two sizes up or down. Try it right below.", "Una o dos tallas más o menos. Pruébalo justo abajo.") },
  size: { name: L("사이즈", "Size", "Talla"), text: L("쇼핑몰 실측표 스크린샷을 읽어, 내 옷과 핏이 같은 사이즈를 골라 줍니다.", "Reads a shop's size chart from a screenshot and picks the size that fits like your garment.", "Lee la tabla de medidas de una tienda desde una captura y elige la talla que queda como tu prenda.") },
  cut: { name: L("원단 배치", "Cutting layout", "Colocación en la tela"), text: L("갖고 있는 원단 크기를 넣으면, 식서 방향을 지켜 조각이 다 들어가는지 배치해 봅니다.", "Enter the fabric you have and see whether the pieces fit, on grain.", "Indica la tela que tienes y mira si las piezas caben, al hilo.") },
};

const CARDS: Record<string, Local> = {
  "t-shirt": L("앞판·뒤판은 골선, 소매 2장. 사진에서 단면 10곳을 잽니다.", "Front and back on the fold, two sleeves. Ten flat measurements from the photo.", "Delantero y espalda al doblez, dos mangas. Diez medidas en plano desde la foto."),
  shorts: L("앞판·뒤판 2장씩, 고무줄 허리. 허리·엉덩이·밑위를 잽니다.", "Two fronts and two backs, elastic waist. Measures the waist, hip and rise.", "Dos delanteros y dos traseros, cintura elástica. Mide cintura, cadera y tiro."),
  shirt: L("앞판 2장, 뒤판 골선, 소매, 칼라, 커프스.", "Two fronts, back on the fold, sleeves, collar, cuffs.", "Dos delanteros, espalda al doblez, mangas, cuello, puños."),
  hoodie: L("지퍼 앞판 2장, 두 쪽 모자, 밑단·소매 시보리.", "Two zip fronts, a two-piece hood, rib bands at the hem and cuffs.", "Dos delanteros con cremallera, capucha de dos piezas, canalé en el bajo y los puños."),
  skirt: L("총장과 밑단단면, 두 값이면 그립니다.", "Two values are enough: length and hem width.", "Bastan dos valores: largo y ancho del bajo."),
  "eco-bag": L("몸판 골선 1장과 손잡이 2장, 바닥 모서리는 접어 박기.", "One body on the fold and two handles; box the bottom corners.", "Un cuerpo al doblez y dos asas; esquinas del fondo cosidas en caja."),
  "long-sleeve": L("티셔츠와 같은 조각에 긴 소매. 소매길이와 소매단면을 잽니다.", "The T-shirt's pieces with long sleeves. Measures the sleeve length and opening.", "Las piezas de la camiseta con manga larga. Mide el largo y la boca de manga."),
  sweatshirt: L("앞판·뒤판 골선, 소매 2장, 밑단·소매·목 시보리.", "Front and back on the fold, two sleeves, rib at the hem, cuffs and neck.", "Delantero y espalda al doblez, dos mangas, canalé en el bajo, los puños y el cuello."),
  dress: L("티셔츠 몸판을 무릎까지. 목둘레 바이어스 길이도 계산합니다.", "A T-shirt body down to the knee; works out the neck binding's length too.", "Un cuerpo de camiseta hasta la rodilla; calcula también el largo del bies del escote."),
  "a-line-skirt": L("허리단과 옆 지퍼. 허리·총장·밑단 세 값이면 그립니다.", "A waistband and a side zip. Three values: waist, length and hem.", "Cinturilla y cremallera lateral. Tres valores: cintura, largo y bajo."),
  apron: L("몸판 골선 1장, 목끈과 허리끈. 가슴판 너비까지 사진에서 잽니다.", "One body on the fold, a neck strap and ties. The bib width comes from the photo too.", "Un cuerpo al doblez, tira del cuello y cintas. Hasta el ancho del peto sale de la foto."),
  cushion: L("앞판 1장, 겹쳐 여미는 뒤판 2장. 가로·세로만 잽니다.", "One front and two overlapping backs. Only width and height.", "Un delantero y dos espaldas solapadas. Solo ancho y alto."),
  pouch: L("겉감·안감 2장씩. 맞는 지퍼 길이를 알려 줍니다.", "Two outer and two lining pieces; tells you what zip length to buy.", "Dos piezas de exterior y dos de forro; te dice qué largo de cremallera comprar."),
};

const STEPS = [
  {
    verb: L("펴고", "Lay", "Extiende"),
    text: L("바닥에 옷을 펴고 손바닥으로 주름만 폅니다. 소매와 다리는 몸판에서 떨어뜨립니다.", "Lay the garment on the floor and smooth out the wrinkles with your palm. Keep sleeves and legs apart from the body.", "Extiende la prenda en el suelo y alisa las arrugas con la mano. Separa mangas y piernas del cuerpo."),
    alt: L("바닥에 편 반바지와 A4 용지", "Shorts laid flat with an A4 sheet", "Pantalón corto extendido con una hoja A4"),
  },
  {
    verb: L("올리고", "Place", "Coloca"),
    text: L("A4 용지를 옷 위나 옆에 둡니다. 네 모서리가 다 보이면 비스듬히 찍어도 반듯하게 펴서 잽니다.", "Put an A4 sheet on or beside the garment. With all four corners in view, even a slanted shot is straightened out before measuring.", "Pon una hoja A4 encima o al lado de la prenda. Con las cuatro esquinas a la vista, incluso una foto inclinada se endereza antes de medir."),
    alt: L("티셔츠 위의 A4 용지", "An A4 sheet on the T-shirt", "Una hoja A4 sobre la camiseta"),
  },
  {
    verb: L("찍고", "Shoot", "Dispara"),
    text: L("폰을 바닥과 평행하게 들고 옷 전체가 들어오게 한 장. 뒷면도 찍으면 서로 모자란 값을 채웁니다.", "Hold the phone parallel to the floor and get the whole garment in one shot. A photo of the back fills in what the front misses.", "Sostén el móvil paralelo al suelo y saca la prenda entera en una foto. Una foto de la espalda completa lo que falta en la del delantero."),
  },
];

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang: raw } = await params;
  if (!isLang(raw)) notFound();
  const lang: Lang = raw;
  const big = lang === "ko"; // the Korean display face sets short words; Latin words run longer
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
  const widest = [...compare].sort((a, b) => Math.abs(b.photo - b.tape) - Math.abs(a.photo - a.tape))[0];
  const off = Math.abs(widest.photo - widest.tape).toFixed(1);
  const all = inside === compare.length;
  const tapeText = L(
    `같은 티셔츠를 사진 한 장으로 잰 값과 자로 잰 값입니다. ${all ? `${compare.length}곳 모두` : `${compare.length}곳 중 ${inside}곳이`} 사진으로 잰 값의 오차(±) 안에 들었고, 가장 큰 차이는 ${MEASURE_NAME[widest.key].ko} ${off} cm입니다.`,
    `The same T-shirt, measured from one photo and by hand. ${all ? `All ${compare.length}` : `${inside} of ${compare.length}`} values fell within the ± the photo gave them; the largest gap was the ${MEASURE_NAME[widest.key].en.toLowerCase()}, ${off} cm.`,
    `La misma camiseta, medida con una foto y a mano. ${all ? `Las ${compare.length}` : `${inside} de ${compare.length}`} medidas quedaron dentro del ± que dio la foto; la mayor diferencia fue ${MEASURE_NAME[widest.key].es.toLowerCase()}, ${off} cm.`,
  );
  const inc = GRADE_STEP["t-shirt"] as Record<string, number>;
  const gradeNote = L(
    `한 치수에 가슴단면 ${inc.chest}, 총장 ${inc.length}, 소매길이 ${inc.sleeve} cm씩. 기성복에서 흔한 간격이고, 소매산은 바뀐 진동둘레에 다시 맞춰 그립니다.`,
    `Each size moves the chest by ${inc.chest}, the length by ${inc.length} and the sleeve by ${inc.sleeve} cm (flat), a common ready-to-wear step; the sleeve cap is redrawn to the new armhole.`,
    `Cada talla mueve el pecho ${inc.chest}, el largo ${inc.length} y la manga ${inc.sleeve} cm (en plano), un paso habitual en confección; la copa de la manga se vuelve a trazar para la nueva sisa.`,
  );

  const frames = [
    {
      // eslint-disable-next-line @next/next/no-img-element -- committed sample photo, shown as is
      node: <img src={run.photo.src} alt={T.photoAlt[lang]} width={run.photo.width} height={run.photo.height} className="h-full w-full object-contain" />,
      caption: T.framePhoto[lang],
    },
    {
      node: (
        <div className="flex h-full items-center justify-center">
          <div className="aspect-[3/4] h-full max-w-full">
            <PhotoOverlay photo={run.photo} run={run.run} className="w-full bg-sand" />
          </div>
        </div>
      ),
      caption: L(`윤곽에서 잰 단면 ${compare.length}곳과 오차(±)`, `${compare.length} flat measurements from the outline, each with a ±`, `${compare.length} medidas en plano del contorno, cada una con su ±`)[lang],
    },
    {
      node: (
        <div className="absolute inset-0 flex items-center bg-paper p-4">
          <PatternPreview sheet={sheet} dims className="h-auto w-full" />
        </div>
      ),
      caption: L(`1:1 패턴, 솔기마다 길이 표시, A4 ${cols * rows}장`, `1:1 pattern, every seam's length, ${cols * rows} A4 pages`, `Patrón 1:1, el largo de cada costura, ${cols * rows} hojas A4`)[lang],
    },
  ];

  const tones = ["#d9cbb0", "#cfbf9f", "#dccfb6", "#d3c4a6", "#d8caae", "#cebd9c"];
  const cover = (src: string, alt: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- committed sample photos
    <img src={src} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
  );
  const drawing = (g: GarmentKind) => (
    <div className="absolute inset-0 p-6">
      <GarmentToPattern garment={g} />
    </div>
  );
  const cards: GarmentCard[] = [
    { name: GARMENT_NAME["t-shirt"][lang], text: CARDS["t-shirt"][lang], picture: drawing("t-shirt"), tone: tones[0], href: `/${lang}/make?garment=t-shirt` },
    { name: GARMENT_NAME.pants[lang], text: CARDS.shorts[lang], picture: drawing("pants"), tone: tones[1], href: `/${lang}/make?garment=pants` },
    ...(["long-sleeve", "sweatshirt", "dress", "shirt", "hoodie", "skirt", "a-line-skirt", "eco-bag", "apron", "cushion", "pouch"] as const).map((g, i) => ({
      name: GARMENT_NAME[g][lang],
      text: CARDS[g][lang],
      picture: drawing(g),
      tone: tones[(i + 2) % tones.length],
      href: `/${lang}/make?garment=${g}`,
    })),
  ];

  // A wheelchair user's words about elastic-waist trousers (an example text, read once by Spark and
  // saved), and the work order the alteration rules make from it.
  const example = COMPLAINT_EXAMPLE[lang];
  const words = example.text;
  const order = parse(example.read, words, "pants").map((c) => guarded(fromComplaint("pants", c)));
  const orderFlat = flatFor("pants", EXAMPLES.pants.m as unknown as Record<string, number>, EXAMPLES.pants.fabric, order);

  const outputs = [
    { name: OUTPUTS.alter.name[lang], text: OUTPUTS.alter.text[lang], bg: "bg-field text-ink", pic: <div className="absolute inset-0 p-3 [&_svg]:h-full [&_svg]:w-full">{orderFlat && <GarmentFlat views={orderFlat} />}</div> },
    { name: OUTPUTS.pdf.name[lang], text: OUTPUTS.pdf.text[lang], bg: "bg-paper text-ink", pic: <PatternPreview sheet={sheet} className="absolute inset-0 h-full w-full" /> },
    { name: OUTPUTS.grade.name[lang], text: OUTPUTS.grade.text[lang], bg: "bg-sand-3 text-ink", pic: <PiecesOutline sheet={sheet} className="absolute inset-0 h-full w-full" /> },
    {
      name: OUTPUTS.size.name[lang],
      text: OUTPUTS.size.text[lang],
      bg: "bg-ink text-sand",
      // eslint-disable-next-line @next/next/no-img-element -- self-made sample size table
      pic: <img src="/samples/size-table.png" alt={T.sizeTableAlt[lang]} loading="lazy" className="absolute inset-0 h-full w-full object-contain" />,
    },
    { name: OUTPUTS.cut.name[lang], text: OUTPUTS.cut.text[lang], bg: "bg-muted text-sand", pic: <CutLayout fabric={fabric} placed={cut.placed} label={T.cutAlt[lang]} light className="absolute inset-0 h-full w-full" /> },
  ];

  const steps = [
    { ...STEPS[0], pic: cover(shortsRun.photo.src, STEPS[0].alt![lang]) },
    {
      ...STEPS[1],
      // eslint-disable-next-line @next/next/no-img-element -- committed sample photo
      pic: <img src={run.photo.src} alt={STEPS[1].alt![lang]} loading="lazy" className="h-full w-full object-cover object-[50%_75%]" />,
    },
    {
      ...STEPS[2],
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
        left={T.heroLeft[lang]}
        right={T.heroRight[lang]}
        sentence={T.heroSentence[lang]}
        frames={frames}
      />

      {/* Fit it to the wearer: their words become a work order on a technical flat. */}
      <section id="alter" aria-labelledby="alter-title" className="bg-ink px-5 py-32 text-sand sm:px-10 lg:px-16 lg:py-48">
        <div className="grid gap-16 lg:grid-cols-12 lg:gap-x-12">
          <div className="lg:col-span-4">
            <h2 id="alter-title" className="font-display text-[9vw] leading-[1.05] tracking-[-0.02em] sm:text-[8vw] lg:text-[clamp(32px,3.2vw,50px)]" data-reveal>
              {T.alterTitle[lang]}
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed" data-reveal style={{ ["--d" as string]: 1 }}>
              {T.alterP1[lang]}
            </p>
            <p className="mt-4 max-w-md text-lg leading-relaxed" data-reveal style={{ ["--d" as string]: 1 }}>
              {T.alterP2[lang]}
            </p>
            <blockquote className="mt-12 rounded-[4px] bg-sand px-6 py-5 text-lg leading-relaxed text-ink" data-reveal style={{ ["--d" as string]: 2 }}>
              <p>&ldquo;{words}&rdquo;</p>
              <footer className="mt-3 text-[15px] text-muted">{T.quoteBy[lang]}</footer>
            </blockquote>
          </div>
          <div className="lg:col-span-8" data-reveal style={{ ["--d" as string]: 1 }}>
            <div className="rounded-[4px] bg-sand p-2 text-ink">
              <h3 className={`px-4 pb-5 pt-4 font-display leading-none lg:px-6 lg:pt-6 ${big ? "text-[32px]" : "text-[24px]"}`}>{T.order[lang]}</h3>
              {orderFlat && (
                <div className="rounded-[2px] bg-field px-4 py-6 lg:px-8">
                  <GarmentFlat views={orderFlat} />
                </div>
              )}
              <ol className="mt-1 grid gap-1 lg:grid-cols-2">
                {order.map((a, i) => (
                  <li key={a.id} className="rounded-[2px] bg-sand-2 px-4 py-5 lg:px-6">
                    <div className="flex items-start justify-between gap-6">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="num inline-flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full bg-mark text-[15px] font-semibold text-white" aria-label={L(`${i + 1}번`, `Number ${i + 1}`, `Número ${i + 1}`)[lang]}>
                          {i + 1}
                        </span>
                        <span className="text-lg font-semibold">{a.action[lang]}</span>
                      </p>
                      <p className="num shrink-0 font-display text-[32px] leading-none">{a.amountCm !== undefined ? `${a.amountCm} cm` : <span className="font-sans text-[15px] text-muted">{T.measureLater[lang]}</span>}</p>
                    </div>
                    <p className="mt-2 text-[15px] leading-relaxed">{a.instruction[lang]}</p>
                  </li>
                ))}
              </ol>
              <p className="px-4 pb-3 pt-4 text-[15px] lg:px-6">{T.orderFoot(order.length)[lang]}</p>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href={`/${lang}/alter`} className="press inline-flex rounded-[4px] bg-sand px-6 py-3 font-medium text-ink hover:bg-sand-3">
                {T.alterMine[lang]}
              </Link>
              <Link href={`/${lang}/sample?s=pants`} className="link text-[15px]">
                {T.alterExample[lang]}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Proof: the photo values against the tape. */}
      <section aria-labelledby="tape-title">
        <div className="grid gap-10 px-5 py-32 sm:px-10 lg:px-16 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-8 lg:py-48">
          <div className="lg:col-span-5" data-reveal>
            <h2 id="tape-title" className="font-display text-[9vw] leading-[1.05] tracking-[-0.02em] sm:text-[8vw] lg:text-[clamp(32px,3.2vw,50px)]">
              {T.tapeTitle[lang]}
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed">{tapeText[lang]}</p>
            <p className="mt-4 max-w-md text-lg">{T.tapeNote[lang]}</p>
          </div>
          <div className="lg:col-span-7" data-reveal style={{ ["--d" as string]: 1 }}>
            <table className="w-full text-lg">
              <caption className="sr-only">{T.tapeCaption[lang]}</caption>
              <thead>
                <tr className="text-left text-[15px] text-muted">
                  <th className="pb-4 font-normal">{T.colFlat[lang]}</th>
                  <th className="pb-4 text-right font-normal">{T.colHand[lang]}</th>
                  <th className="pb-4 text-right font-normal">{T.colPhoto[lang]}</th>
                  <th className="pb-4 text-right font-normal">{T.colDiff[lang]}</th>
                </tr>
              </thead>
              <tbody>
                {compare.map((c) => {
                  const d = c.photo - c.tape;
                  return (
                    <tr key={c.key} /* taste-skill-ignore: rule between table rows */ className="border-t border-sand-3">
                      <td className="py-3.5">{MEASURE_NAME[c.key][lang]}</td>
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

      <GarmentRow heading={T.garmentsTitle[lang]} sub={T.garmentsSub[lang]} rowLabel={T.garmentsRow[lang]} cta={T.startWith[lang]} cards={cards} />

      {/* What comes out: five results. */}
      <section aria-labelledby="outputs-title" className="bg-sand-2 px-5 py-32 sm:px-10 lg:px-16 lg:py-48">
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-8">
          <h2 id="outputs-title" className="font-display text-[9vw] leading-[1.05] tracking-[-0.02em] sm:text-[8vw] lg:col-span-6 lg:text-[clamp(32px,3.2vw,50px)]" data-reveal>
            {T.outputsTitle[lang]}
          </h2>
          <p className="max-w-lg text-lg leading-relaxed lg:col-span-5 lg:col-start-8 lg:self-end" data-reveal style={{ ["--d" as string]: 1 }}>
            {T.outputsSub[lang]}
          </p>
        </div>
        <div className="mt-24 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8 xl:grid-cols-5">
          {outputs.map((c, i) => (
            <article key={c.name} data-reveal style={{ ["--d" as string]: i }} className={`flex flex-col rounded-[4px] p-7 ${c.bg}`}>
              <h3 className={`font-display leading-none ${big ? "text-[32px]" : "text-[22px]"}`}>{c.name}</h3>
              <div className="relative order-first mb-6 aspect-[4/3]">{c.pic}</div>
              <p className="mt-3 text-lg leading-snug">{c.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* The live thing. */}
      <section aria-labelledby="grade-title" className="px-5 py-32 sm:px-10 lg:px-16 lg:py-48">
        <div className="mb-16 grid gap-6 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-8">
          <h2 id="grade-title" className="font-display text-[9vw] leading-[1.05] tracking-[-0.02em] sm:text-[8vw] lg:col-span-7 lg:text-[clamp(32px,3.2vw,50px)]" data-reveal>
            {T.gradeTitle[lang]}
          </h2>
          <p className="max-w-lg text-lg leading-relaxed lg:col-span-5 lg:self-end" data-reveal style={{ ["--d" as string]: 1 }}>
            {T.gradeSub[lang]}
          </p>
        </div>
        <div data-reveal style={{ ["--d" as string]: 2 }}>
          <GradeDemo measures={measures} note={gradeNote[lang]} />
        </div>
      </section>

      {/* How to shoot: one verb at a time. */}
      <section id="how" aria-labelledby="how-title" className="bg-paper px-5 py-32 sm:px-10 lg:px-16 lg:py-48">
        <h2 id="how-title" className="font-display text-[9vw] leading-[1.05] tracking-[-0.02em] sm:text-[8vw] lg:text-[clamp(32px,3.2vw,50px)]" data-reveal>
          {T.howTitle[lang]}
        </h2>
        {steps.map((s, i) => (
          <div key={s.verb.en} className="mt-24 grid items-center gap-10 sm:grid-cols-12 sm:gap-x-12 lg:mt-36">
            <h3
              className={`font-display leading-[0.9] tracking-[-0.03em] ${big ? "text-[18vw] sm:text-[9vw]" : "text-[11vw] sm:text-[5vw]"} ${i % 2 ? "sm:order-2 sm:col-span-6 sm:col-start-7 sm:text-right" : "sm:col-span-6"}`}
              data-reveal
            >
              {s.verb[lang]}
            </h3>
            <div className={`grid gap-6 lg:grid-cols-2 lg:items-end ${i % 2 ? "sm:order-1 sm:col-span-6" : "sm:col-span-6"}`} data-reveal style={{ ["--d" as string]: 1 }}>
              <div className="relative aspect-[4/5] overflow-hidden rounded-[4px] bg-well">{s.pic}</div>
              <p className="text-lg leading-relaxed">{s.text[lang]}</p>
            </div>
          </div>
        ))}
      </section>

      {/* The call: the whole band is the link. */}
      <Link
        href={`/${lang}/make`}
        className="group relative flex h-[46svh] flex-col justify-between bg-ink px-5 py-6 text-sand transition-colors duration-150 hover:bg-sand-3 hover:text-ink focus-visible:bg-sand-3 focus-visible:text-ink sm:px-10 lg:px-16 lg:h-[60svh]"
      >
        <span className="max-w-sm self-end text-lg leading-snug sm:text-right">{T.ctaLine[lang]}</span>
        <span className="flex items-end gap-[2vw]">
          <span className={`font-display leading-[0.8] tracking-[-0.04em] ${big ? "text-[20vw] sm:text-[15vw]" : "text-[17vw] sm:text-[12vw]"}`}>{T.ctaWord[lang]}</span>
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
        <p className={`font-display leading-[0.8] tracking-[-0.04em] ${big ? "text-[20vw] sm:text-[15vw]" : "text-[15vw] sm:text-[11vw]"}`} aria-hidden>
          Rub-Off
        </p>
        <div className="mt-16 grid gap-12 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-8">
          <ul className={`space-y-2 font-display lg:col-span-5 ${big ? "text-[32px]" : "text-[22px]"}`}>
            <li>
              <Link href={`/${lang}/make`} className="link">
                {T.footMake[lang]}
              </Link>
            </li>
            <li>
              <Link href={`/${lang}/alter`} className="link">
                {T.footAlter[lang]}
              </Link>
            </li>
            <li>
              <Link href={`/${lang}/sample`} className="link">
                {T.footExamples[lang]}
              </Link>
            </li>
            <li>
              <Link href={`/${lang}#how`} className="link">
                {T.footHow[lang]}
              </Link>
            </li>
          </ul>
          <div className="grid gap-8 text-[15px] sm:grid-cols-2 lg:col-span-7">
            <div>
              <p className="font-medium">{T.builtTitle[lang]}</p>
              <p className="mt-2">{T.built[lang]}</p>
            </div>
            <div>
              <p className="font-medium">{T.beforeCutTitle[lang]}</p>
              <p className="mt-2">{T.beforeCut[lang]}</p>
            </div>
          </div>
        </div>
        <div className="mt-24 flex items-center justify-between gap-6 text-[15px]">
          <span>{T.owner[lang]}</span>
          <a href="#hero-title" className="link">
            {T.top[lang]}
          </a>
        </div>
      </footer>
    </main>
  );
}

// Pieces placed on a fabric rectangle (cm), drawn in the page's ink (or in sand on a dark card).
function CutLayout({ fabric, placed, label, light = false, className = "h-auto w-full" }: { fabric: Pt[]; placed: { piece: { id: string }; outline: Pt[] }[]; label: string; light?: boolean; className?: string }) {
  const b = bounds(fabric);
  return (
    <svg viewBox={`${b.minX - 2} ${b.minY - 2} ${b.maxX - b.minX + 4} ${b.maxY - b.minY + 4}`} className={className} role="img" aria-label={label}>
      <path d={svgPath(fabric, true)} fill={light ? "rgba(230,219,199,0.15)" : "var(--sand)"} stroke={light ? "var(--sand)" : "var(--ink)"} strokeWidth={0.6} />
      {placed.map((p, i) => (
        <path key={`${p.piece.id}-${i}`} d={svgPath(p.outline, true)} fill={light ? "rgba(230,219,199,0.35)" : "rgba(6,43,138,0.12)"} stroke={light ? "var(--sand)" : "var(--ink)"} strokeWidth={0.5} />
      ))}
    </svg>
  );
}
