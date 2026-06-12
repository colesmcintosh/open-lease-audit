import { z } from "zod";
import type { ColumnDef } from "./types";

/** Stable machine key for a user-defined column. */
export function columnKey(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field"
  );
}

const TYPE_GUIDANCE: Record<ColumnDef["type"], string> = {
  text: "Return the exact value as a concise string.",
  number: "Return a plain number with no formatting.",
  currency:
    "Return the amount as a plain number in the document's currency, no symbols or separators.",
  date: "Return the date as an ISO 8601 string (YYYY-MM-DD).",
  boolean: "Return true or false.",
};

function valueSchema(column: ColumnDef) {
  switch (column.type) {
    case "number":
    case "currency":
      return z.number();
    case "boolean":
      return z.boolean();
    default:
      return z.string();
  }
}

/**
 * Builds the extraction schema for a user-defined column set. Every field
 * carries provenance: the verbatim clause it came from and a confidence grade.
 */
export function buildExtractionSchema(columns: ColumnDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const column of columns) {
    shape[columnKey(column.name)] = z.object({
      value: valueSchema(column)
        .nullable()
        .describe(
          `${column.name}. ${column.description} ${TYPE_GUIDANCE[column.type]} Use null only if the document genuinely does not specify it.`
        ),
      evidence: z
        .string()
        .nullable()
        .describe(
          "Short verbatim quote from the lease that supports the value, or null if absent."
        ),
      confidence: z
        .enum(["high", "medium", "low"])
        .nullable()
        .describe(
          "high = stated explicitly, medium = derived or paraphrased, low = ambiguous."
        ),
    });
  }
  return z.object(shape);
}

export const auditResultSchema = z.object({
  risk: z
    .enum(["low", "elevated", "high"])
    .describe("Overall portfolio integrity risk."),
  verdict: z
    .string()
    .describe(
      "Two or three sentences summarizing portfolio integrity for an analyst."
    ),
  findings: z.array(
    z.object({
      title: z.string().describe("Short headline for the finding."),
      severity: z.enum(["critical", "warning", "info"]),
      columns: z
        .array(z.string())
        .describe("Exact column names involved, matching the provided schema."),
      leases: z
        .array(z.string())
        .describe("Exact lease file names involved."),
      detail: z
        .string()
        .describe("What is inconsistent or anomalous, citing the values."),
      recommendation: z
        .string()
        .describe("Concrete next step for the analyst."),
    })
  ),
});

export type AuditResultPayload = z.infer<typeof auditResultSchema>;
