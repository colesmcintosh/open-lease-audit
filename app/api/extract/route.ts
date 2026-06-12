import { streamObject, type UserModelMessage } from "ai";
import { buildExtractionSchema, columnKey } from "@/lib/audit-schema";
import { gatewayCredentialsError } from "@/lib/gateway";
import type { ColumnDef, LeaseDoc } from "@/lib/types";

export const maxDuration = 300;

const MODEL = process.env.OPEN_LEASE_AUDIT_MODEL ?? "anthropic/claude-sonnet-4-6";

const SYSTEM = `You are a senior commercial lease abstraction analyst. You read lease
agreements and extract structured fields with absolute fidelity to the source text.
Never invent values. If a field is not specified in the document, return null for it.
Always include a short verbatim supporting quote as evidence for any non-null value.`;

interface ExtractRequest {
  columns: ColumnDef[];
  doc: Pick<LeaseDoc, "name" | "kind" | "data">;
}

export async function POST(req: Request) {
  const credentialsError = gatewayCredentialsError();
  if (credentialsError) return credentialsError;

  const { columns, doc } = (await req.json()) as ExtractRequest;

  if (!columns?.length || !doc?.data) {
    return new Response("Missing columns or document.", { status: 400 });
  }

  const fieldBrief = columns
    .map(
      (column) =>
        `- ${columnKey(column.name)} ("${column.name}", type: ${column.type}): ${column.description}`
    )
    .join("\n");

  const instructions = `Extract the following fields from the lease document "${doc.name}":\n\n${fieldBrief}`;

  const message: UserModelMessage = {
    role: "user",
    content:
      doc.kind === "pdf"
        ? [
            { type: "text", text: instructions },
            { type: "file", data: doc.data, mediaType: "application/pdf" },
          ]
        : [
            { type: "text", text: instructions },
            { type: "text", text: `--- DOCUMENT: ${doc.name} ---\n\n${doc.data}` },
          ],
  };

  const result = streamObject({
    model: MODEL,
    schema: buildExtractionSchema(columns),
    system: SYSTEM,
    messages: [message],
  });

  return result.toTextStreamResponse();
}
