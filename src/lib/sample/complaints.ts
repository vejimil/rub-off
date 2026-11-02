// The example text about elastic-waist trousers, written in each language and read once by Muse
// Spark (`npm run alter -- "<text>" --garment=pants --yes --save=...`). The work order on each
// page comes from its own language's reading.

import type { ReadComplaints } from "../fit/read-complaint.ts";
import type { Lang } from "../i18n/lang.ts";
import ko from "./complaint-pants.json" with { type: "json" };
import en from "./complaint-pants.en.json" with { type: "json" };
import es from "./complaint-pants.es.json" with { type: "json" };

export const COMPLAINT_EXAMPLE: Record<Lang, { text: string; read: ReadComplaints }> = {
  ko: { text: ko.text, read: ko.read as ReadComplaints },
  en: { text: en.text, read: en.read as ReadComplaints },
  es: { text: es.text, read: es.read as ReadComplaints },
};
