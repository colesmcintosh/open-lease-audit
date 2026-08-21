import type { CellValue, ColumnDef, ColumnType, Confidence } from "./types";

/** Stable machine key for a user-defined column. */
export function columnKey(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field"
  );
}

export const TYPE_GUIDANCE: Record<ColumnType, string> = {
  text: "exact value, concise",
  number: "plain number, no formatting",
  currency: "plain number in the document's currency, no symbols or separators",
  date: "ISO 8601 (YYYY-MM-DD)",
  boolean: "true or false",
};

const NULLISH = new Set([
  "",
  "null",
  "n/a",
  "na",
  "none",
  "not specified",
  "unspecified",
  "not stated",
]);

/**
 * Agents report every field as a string. This coerces to the column's declared
 * type where it can, and falls back to the raw string rather than dropping a
 * value the model did find — an unparseable value is still evidence.
 */
export function coerceValue(
  raw: string | null | undefined,
  type: ColumnType
): CellValue["value"] {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (NULLISH.has(trimmed.toLowerCase())) return null;

  switch (type) {
    case "number":
    case "currency": {
      const numeric = Number(trimmed.replace(/[$,\s%]/g, ""));
      return Number.isFinite(numeric) ? numeric : trimmed;
    }
    case "boolean": {
      if (/^(true|yes|y)$/i.test(trimmed)) return true;
      if (/^(false|no|n)$/i.test(trimmed)) return false;
      return trimmed;
    }
    default:
      return trimmed;
  }
}

const CONFIDENCES: Confidence[] = ["high", "medium", "low"];

export function coerceConfidence(raw: string | null | undefined): Confidence | null {
  const value = raw?.trim().toLowerCase();
  return CONFIDENCES.find((level) => level === value) ?? null;
}

/** Resolves an agent-reported column label back to a defined column. */
export function findColumn(
  columns: ColumnDef[],
  label: string
): ColumnDef | undefined {
  const key = columnKey(label);
  return columns.find(
    (column) => columnKey(column.name) === key || column.name === label
  );
}
