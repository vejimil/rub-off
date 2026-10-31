// A size table as Spark copied it, and its cells as numbers. Pure, so the browser can re-parse
// the table after the user corrects a cell.

import { SIZE_KEYS, type SizeKey } from "../rules/fit-tolerance.ts";
import type { SizeTable } from "./decide.ts";

export const COLUMN_MEANINGS = [...SIZE_KEYS, "other"] as const;

export interface ReadTable {
  unit: "cm" | "inch" | "unknown";
  basis: "flat" | "circumference" | "unknown";
  columns: { header: string; meaning: (typeof COLUMN_MEANINGS)[number] }[];
  rows: { label: string; cells: (string | null)[] }[];
}

// The read table as numbers, or the cells that aren't numbers (shown to the user to fix).
export function toSizeTable(r: ReadTable): { table: SizeTable; unreadable: { row: string; header: string; cell: string }[] } {
  const unreadable: { row: string; header: string; cell: string }[] = [];
  const sizes = r.rows.map((row) => {
    const values: Partial<Record<SizeKey, number>> = {};
    r.columns.forEach((col, i) => {
      const cell = row.cells[i];
      if (col.meaning === "other" || cell === null || cell === undefined || cell.trim() === "") return;
      const v = Number(cell.replace(",", ".").trim());
      if (!Number.isFinite(v) || v <= 0) unreadable.push({ row: row.label, header: col.header, cell });
      else values[col.meaning] = v;
    });
    return { label: row.label, values };
  });
  // A unit the table doesn't state: Korean shop tables are in cm.
  return { table: { unit: r.unit === "inch" ? "inch" : "cm", basis: r.basis, sizes }, unreadable };
}
