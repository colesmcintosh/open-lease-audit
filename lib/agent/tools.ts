import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { coerceConfidence, coerceValue, columnKey, findColumn } from "@/lib/columns";
import type { CellValue, ColumnDef, ExposureKind, FindingSeverity } from "@/lib/types";
import type { EventBus } from "./bus";
import type { Workspace } from "./workspace";

export const AUDIT_SERVER = "audit";

/** Fully-qualified names, for allowlisting and per-agent tool grants. */
export const AUDIT_TOOLS = {
  recordAbstract: `mcp__${AUDIT_SERVER}__record_abstract`,
  reportCandidate: `mcp__${AUDIT_SERVER}__report_candidate`,
  publishFinding: `mcp__${AUDIT_SERVER}__publish_finding`,
  dismissCandidate: `mcp__${AUDIT_SERVER}__dismiss_candidate`,
  publishSummary: `mcp__${AUDIT_SERVER}__publish_summary`,
} as const;

const EXPOSURE = z.enum(["monetary", "litigation", "both"]);

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function nextId(prefix: string, counter: { n: number }) {
  counter.n += 1;
  return `${prefix}-${String(counter.n).padStart(3, "0")}`;
}

/**
 * The agents' only structured output channel. Everything the console renders
 * arrives through one of these calls — prose in an agent's final message is
 * never parsed, so a finding that was not published simply does not exist.
 *
 * Handlers also persist their payload into the workspace, which is how a later
 * stage reads an earlier one's work: the materiality gate reads
 * `candidates/*.json` off disk rather than through the orchestrator's context.
 */
export function createAuditTools({
  workspace,
  columns,
  bus,
}: {
  workspace: Workspace;
  columns: ColumnDef[];
  bus: EventBus;
}) {
  const candidateCounter = { n: 0 };
  const findingCounter = { n: 0 };

  const resolveLease = (label: string) => {
    const needle = label.trim().toLowerCase();
    const base = path.basename(needle);
    return workspace.leases.find((lease) => {
      const rel = lease.relPath.toLowerCase();
      return (
        rel === needle ||
        path.basename(rel) === base ||
        lease.doc.name.toLowerCase() === needle ||
        lease.doc.name.toLowerCase() === base
      );
    });
  };

  const recordAbstract = tool(
    "record_abstract",
    "Report the abstracted schema fields for exactly one lease. Call this once, after reading the whole document. Every non-null value must carry a verbatim supporting quote.",
    {
      lease: z
        .string()
        .describe("Lease file path as listed in SCHEMA.md, e.g. leases/hq-suite-400.txt"),
      fields: z
        .array(
          z.object({
            column: z.string().describe("Exact column name from SCHEMA.md."),
            value: z
              .string()
              .nullable()
              .describe(
                "The value as written in the lease, formatted per the column's Format column. null if the lease does not specify it."
              ),
            evidence: z
              .string()
              .nullable()
              .describe("Short verbatim quote supporting the value, or null."),
            confidence: z
              .enum(["high", "medium", "low"])
              .nullable()
              .describe("high = stated explicitly, medium = derived, low = ambiguous."),
          })
        )
        .describe("One entry per column in SCHEMA.md. Do not omit columns."),
    },
    async ({ lease, fields }) => {
      const match = resolveLease(lease);
      if (!match) {
        return ok(
          `No lease named "${lease}". Known leases: ${workspace.leases
            .map((entry) => entry.relPath)
            .join(", ")}`
        );
      }

      const record: Record<string, CellValue> = {};
      const unknown: string[] = [];
      for (const field of fields) {
        const column = findColumn(columns, field.column);
        if (!column) {
          unknown.push(field.column);
          continue;
        }
        record[columnKey(column.name)] = {
          value: coerceValue(field.value, column.type),
          evidence: field.evidence?.trim() || null,
          confidence: coerceConfidence(field.confidence),
        };
      }

      bus.push({ type: "abstract", leaseId: match.doc.id, fields: record });
      await writeFile(
        path.join(workspace.abstractsDir, `${path.basename(match.relPath)}.json`),
        JSON.stringify({ lease: match.relPath, fields: record }, null, 2),
        "utf8"
      );

      const recorded = Object.keys(record).length;
      return ok(
        unknown.length
          ? `Recorded ${recorded} field(s) for ${match.relPath}. Ignored unknown columns: ${unknown.join(", ")}. Use the exact names from SCHEMA.md.`
          : `Recorded ${recorded} field(s) for ${match.relPath}.`
      );
    }
  );

  const reportCandidate = tool(
    "report_candidate",
    "Report ONE candidate defect for the materiality gate to rule on. Only report something that would cost the portfolio owner money or expose them to a lawsuit. A candidate is not a finding — the gate decides what reaches the user.",
    {
      detector: z.string().describe("Your own agent name, e.g. rent-and-charges-auditor."),
      title: z.string().describe("Short headline naming the defect, not the topic."),
      leases: z.array(z.string()).describe("Exact lease file paths involved."),
      columns: z
        .array(z.string())
        .describe("Exact schema column names involved, empty if none apply."),
      detail: z
        .string()
        .describe("What is wrong, citing the specific values and clauses that conflict."),
      lossMechanism: z
        .string()
        .describe(
          "The causal chain to money or a lawsuit: what happens, to whom, and how it costs them. If you cannot write this, do not report the candidate."
        ),
      evidence: z
        .array(z.string())
        .describe("Verbatim quotes, each prefixed with the lease file path."),
      exposure: EXPOSURE,
      estimatedExposureUsd: z
        .number()
        .nullable()
        .describe("Best-effort dollar exposure, or null if it cannot be bounded."),
    },
    async (input) => {
      const id = nextId("cand", candidateCounter);
      bus.push({
        type: "candidate",
        candidate: {
          id,
          title: input.title,
          leases: input.leases,
          detail: input.detail,
          raisedBy: input.detector,
        },
      });
      await writeFile(
        path.join(workspace.candidatesDir, `${id}.json`),
        JSON.stringify({ id, ...input }, null, 2),
        "utf8"
      );
      return ok(`Filed ${id}. The materiality gate will verify it independently.`);
    }
  );

  const publishFinding = tool(
    "publish_finding",
    "Surface ONE confirmed major finding to the portfolio owner. Only the materiality gate may call this, and only after independently verifying the evidence against the lease text.",
    {
      title: z.string().describe("Short headline naming the defect."),
      severity: z
        .enum(["critical", "major"])
        .describe(
          "critical = live or large exposure needing action now; major = real but bounded."
        ),
      exposure: EXPOSURE,
      estimatedExposureUsd: z
        .number()
        .nullable()
        .describe("Best-effort dollar exposure, or null if it cannot be bounded."),
      leases: z.array(z.string()).describe("Exact lease file paths involved."),
      columns: z.array(z.string()).describe("Exact schema column names involved."),
      detail: z
        .string()
        .describe("What is wrong and why it costs money or invites litigation."),
      evidence: z
        .array(z.string())
        .describe(
          "Verbatim quotes you re-read in the source documents, each prefixed with its lease file path."
        ),
      recommendation: z.string().describe("The concrete next step, specific enough to act on."),
      raisedBy: z.string().describe("Which detector originally reported this."),
    },
    async (input) => {
      const id = nextId("F", findingCounter);
      bus.push({
        type: "finding",
        finding: {
          id,
          title: input.title,
          severity: input.severity as FindingSeverity,
          exposure: input.exposure as ExposureKind,
          exposureUsd: input.estimatedExposureUsd,
          leases: input.leases,
          columns: input.columns,
          detail: input.detail,
          evidence: input.evidence,
          recommendation: input.recommendation,
          raisedBy: input.raisedBy,
        },
      });
      return ok(`Published ${id}.`);
    }
  );

  const dismissCandidate = tool(
    "dismiss_candidate",
    "Record that a candidate failed the materiality bar and will not be shown. Call this for every candidate you do not publish.",
    {
      title: z.string().describe("The candidate's title."),
      reason: z
        .string()
        .describe(
          "Why it fails: no loss mechanism, unsupported by the text, duplicate of a published finding, or immaterial."
        ),
    },
    async ({ title, reason }) => {
      bus.push({ type: "dismissal", dismissal: { title, reason } });
      return ok(`Dismissed "${title}".`);
    }
  );

  const publishSummary = tool(
    "publish_summary",
    "Close the audit with the portfolio verdict. Call this exactly once, last.",
    {
      risk: z
        .enum(["contained", "elevated", "severe"])
        .describe(
          "contained = nothing major survived the gate; elevated = major findings, none imminent; severe = at least one critical finding."
        ),
      verdict: z
        .string()
        .describe(
          "Two or three sentences an owner can act on. Lead with the money. Say plainly if nothing major was found."
        ),
      totalExposureUsd: z
        .number()
        .nullable()
        .describe("Sum of the published findings' bounded exposures, or null."),
    },
    async ({ risk, verdict, totalExposureUsd }) => {
      bus.push({ type: "summary", risk, verdict, totalExposureUsd });
      return ok("Audit closed.");
    }
  );

  return createSdkMcpServer({
    name: AUDIT_SERVER,
    version: "1.0.0",
    instructions:
      "Structured reporting channel for the lease audit. Findings only reach the user through these tools.",
    alwaysLoad: true,
    tools: [
      recordAbstract,
      reportCandidate,
      publishFinding,
      dismissCandidate,
      publishSummary,
    ],
  });
}
