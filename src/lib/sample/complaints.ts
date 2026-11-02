// Example texts about what bothers a wearer, written in each language and read once by Muse Spark
// (`npm run alter -- "<text>" --garment=<kind> --lang=<lang> --yes --save=...`). The work order on
// each page comes from its own language's reading. The trousers text is the wheelchair example; the
// T-shirt and shorts texts go with the owner's photographed garments.

import type { ReadComplaints } from "../fit/read-complaint.ts";
import type { Lang } from "../i18n/lang.ts";
import ko from "./complaint-pants.json" with { type: "json" };
import en from "./complaint-pants.en.json" with { type: "json" };
import es from "./complaint-pants.es.json" with { type: "json" };
import teeKo from "./complaint-tee.json" with { type: "json" };
import teeEn from "./complaint-tee.en.json" with { type: "json" };
import teeEs from "./complaint-tee.es.json" with { type: "json" };
import shortsKo from "./complaint-shorts.json" with { type: "json" };
import shortsEn from "./complaint-shorts.en.json" with { type: "json" };
import shortsEs from "./complaint-shorts.es.json" with { type: "json" };

type Saved = { text: string; read: unknown };
type Example = Record<Lang, { text: string; read: ReadComplaints }>;
const example = (k: Saved, e: Saved, s: Saved): Example => ({
  ko: { text: k.text, read: k.read as ReadComplaints },
  en: { text: e.text, read: e.read as ReadComplaints },
  es: { text: s.text, read: s.read as ReadComplaints },
});

export const COMPLAINT_EXAMPLE = example(ko, en, es);
export const TEE_COMPLAINT = example(teeKo, teeEn, teeEs);
export const SHORTS_COMPLAINT = example(shortsKo, shortsEn, shortsEs);
