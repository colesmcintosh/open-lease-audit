import { streamObject } from "ai";
import { auditResultSchema } from "@/lib/audit-schema";
import { gatewayCredentialsError } from "@/lib/gateway";
import type { CellValue, ColumnDef } from "@/lib/types";

export const maxDuration = 300;

const MODEL = process.env.OPEN_LEASE_AUDIT_MODEL ?? "anthropic/claude-sonnet-4-6";

const SYSTEM = `You are a portfolio integrity auditor for commercial real estate.
You receive structured fields extracted from multiple lease documents and you find
real problems: cross-document inconsistencies (same party spelled differently,
conflicting terms, mismatched deposits or escalations), internal contradictions,
suspicious gaps, and values that deviate from the rest of the portfolio without
explanation. Only report findings that are genuinely supported by the data — no
filler. Order findings by severity, critical first. Reference leases by their exact
file names and columns by their exact column names.`;

interface AuditRequest {
  columns: ColumnDef[];
  rows: Array<{
    lease: string;
    fields: Record<string, CellValue | undefined>;
  }>;
}

export async function POST(req: Request) {
  const credentialsError = gatewayCredentialsError();
  if (credentialsError) return credentialsError;

  const { columns, rows } = (await req.json()) as AuditRequest;

  if (!columns?.length || !rows?.length) {
    return new Response("Missing columns or extracted rows.", { status: 400 });
  }

  const prompt = [
    "Column definitions:",
    JSON.stringify(
      columns.map(({ name, description, type }) => ({ name, description, type })),
      null,
      2
    ),
    "",
    `Extracted data for ${rows.length} lease(s):`,
    JSON.stringify(rows, null, 2),
    "",
    "Audit this portfolio for mismatches, contradictions, and anomalies.",
  ].join("\n");

  const result = streamObject({
    model: MODEL,
    schema: auditResultSchema,
    system: SYSTEM,
    prompt,
  });

  return result.toTextStreamResponse();
}
