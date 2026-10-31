// A shop's measurement table (실측표) read from a screenshot by Muse Spark. Spark copies the cells
// and says what each column means, choosing from a fixed list; it never computes or converts a
// number. The result is shown back to the user as a table to confirm or correct before any
// decision uses it, because OCR can misread a digit.

import { image, sparkJson, text } from "../meta/spark.ts";
import { COLUMN_MEANINGS, type ReadTable } from "./table.ts";

export type { ReadTable };

const SCHEMA = {
  name: "size_table",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["unit", "basis", "columns", "rows"],
    properties: {
      unit: { type: "string", enum: ["cm", "inch", "unknown"] },
      basis: {
        type: "string",
        enum: ["flat", "circumference", "unknown"],
        description: "flat if the table says 단면 or half / flat width, circumference if it says 둘레 or around. unknown if it does not say.",
      },
      columns: {
        type: "array",
        description: "Measurement columns, left to right, excluding the size label column.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["header", "meaning"],
          properties: {
            header: { type: "string", description: "The header text exactly as printed." },
            meaning: { type: "string", enum: COLUMN_MEANINGS },
          },
        },
      },
      rows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "cells"],
          properties: {
            label: { type: "string", description: "The size label exactly as printed (S, M, 95, FREE...)." },
            cells: {
              type: "array",
              description: "One per column, the number exactly as printed, digits and decimal point only. null for an empty cell.",
              items: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
};

const PROMPT = `This image is a clothing shop's size table (measurements per size).
Copy it. For each measurement column, give the header exactly as printed and choose what it measures:
chest = 가슴 (armpit to armpit), length = 총장 (total length), shoulder = 어깨, sleeve = 소매 길이, hem = 밑단 (of a top),
waist = 허리, hip = 엉덩이, thigh = 허벅지, frontRise = 밑위, outseam = 바지 총장, legOpening = 밑단 (of trousers), other = anything else.
Copy every number exactly as printed. Do not convert units, do not double or halve, do not compute anything.`;

export async function readSizeTable(png: Buffer, mime: "image/png" | "image/jpeg" | "image/webp"): Promise<ReadTable> {
  return sparkJson<ReadTable>([text(PROMPT), image(png, mime)], SCHEMA);
}
