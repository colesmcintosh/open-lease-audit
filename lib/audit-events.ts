import type {
  AgentStatus,
  Candidate,
  Dismissal,
  Finding,
  PortfolioRisk,
} from "./types";

/**
 * Wire protocol between the agent run and the console. One JSON object per
 * line (NDJSON) so the client can render each event the moment it lands.
 */
export type AuditEvent =
  | { type: "run_started"; leases: Array<{ id: string; relPath: string }> }
  | { type: "agent_started"; id: string; agent: string; label: string }
  | { type: "agent_activity"; id: string; activity: string }
  | { type: "agent_finished"; id: string; status: Extract<AgentStatus, "done" | "error"> }
  | { type: "lead_note"; text: string }
  | { type: "candidate"; candidate: Candidate }
  | { type: "finding"; finding: Finding }
  | { type: "dismissal"; dismissal: Dismissal }
  | {
      type: "summary";
      risk: PortfolioRisk;
      verdict: string;
      totalExposureUsd: number | null;
    }
  | { type: "error"; message: string }
  | { type: "done"; costUsd: number | null; durationMs: number };

export function encodeEvent(event: AuditEvent): string {
  return `${JSON.stringify(event)}\n`;
}
