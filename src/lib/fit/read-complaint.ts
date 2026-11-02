// What the wearer wrote about their garment ("휠체어에 앉으면 뒤가 내려가고 밑단이 3 cm쯤 짧아요"),
// sorted by Muse Spark into the fixed complaint list. Spark only chooses from the list, copies the
// wearer's words and copies a length they wrote; parse() keeps a length only if that number is
// in the text and a quote only if it is the wearer's words exactly. The rules in alter.ts decide
// what to change.

import { numbersIn } from "../rules/numbers.ts";
import { COMPLAINTS, type Complaint } from "./alter.ts";
import type { GarmentKind } from "../pattern/types.ts";

export interface ReadComplaints {
  items: { complaint: string; side: "left" | "right" | "both" | "none"; amount: string | null; quote: string }[];
}

export const MAX_TEXT = 500;

export const SCHEMA = {
  name: "complaints",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        description: "One item per distinct problem the person describes, in the order they describe them.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["complaint", "side", "amount", "quote"],
          properties: {
            complaint: { type: "string", enum: [...COMPLAINTS.map((c) => c.id), "other"] },
            side: { type: "string", enum: ["left", "right", "both", "none"], description: "The wearer's side, only if they say which; none otherwise." },
            amount: {
              type: ["string", "null"],
              description: "A length in cm the person wrote for this problem, digits exactly as written. null if they did not write one. Never estimate.",
            },
            quote: { type: "string", description: "The person's own words for this problem, copied exactly, as short as possible." },
          },
        },
      },
    },
  },
};

export function prompt(garment: GarmentKind, text: string): string {
  const list = COMPLAINTS.map((c) => `${c.id}: ${c.label.en}`).join("\n");
  return `Someone describes what is wrong with their ${garment} when they wear it. Sort what they say into this list of known problems (id: what a wearer would say):
${list}
other: anything that matches none of these

They may write in any language. Choose the closest id for each problem they describe. Copy their own words for it as the quote. If they wrote a length for it, copy that number as written; otherwise amount is null. Do not estimate or convert any number.

Their words:
"""${text}"""`;
}

// Spark's answer into complaints, checked against the wearer's text.
export function parse(read: ReadComplaints, text: string, garment: GarmentKind): Complaint[] {
  const written = numbersIn(text);
  return read.items.map((it) => {
    const def = COMPLAINTS.find((c) => c.id === it.complaint);
    const id = def && def.garments.includes(garment) ? def.id : "other";
    const n = it.amount === null ? NaN : Number(it.amount.replace(",", ".").replace(/[^\d.]/g, ""));
    const amountCm = Number.isFinite(n) && n > 0 && n < 100 && written.includes(n) && def?.ask ? n : undefined;
    const quote = it.quote && text.includes(it.quote) ? it.quote : undefined;
    return { id, side: it.side === "none" ? undefined : it.side, amountCm, quote };
  });
}
