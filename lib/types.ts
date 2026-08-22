export interface LeaseDoc {
  id: string;
  name: string;
  size: number;
  kind: "pdf" | "text";
  /** Base64 for PDFs, raw text otherwise. */
  data: string;
}

/**
 * How a finding hurts. The console only ever shows findings that carry one of
 * these — an issue with no loss mechanism is not a finding.
 */
export type ExposureKind = "monetary" | "litigation" | "both";

/**
 * Two tiers, both major. `critical` is live or large; `major` is real but
 * bounded. There is deliberately no "info" tier.
 */
export type FindingSeverity = "critical" | "major";

export interface Finding {
  id: string;
  title: string;
  severity: FindingSeverity;
  exposure: ExposureKind;
  /** Best-effort dollar exposure, null when the auditor could not bound it. */
  exposureUsd: number | null;
  leases: string[];
  detail: string;
  /** Verbatim clauses the finding rests on, each attributed to a lease. */
  evidence: string[];
  recommendation: string;
  /** Which detector raised it, before the materiality gate confirmed it. */
  raisedBy: string;
}

/** A detector's unconfirmed report, before the materiality gate rules on it. */
export interface Candidate {
  id: string;
  title: string;
  leases: string[];
  detail: string;
  raisedBy: string;
}

/** A candidate the gate refused to surface, and why. */
export interface Dismissal {
  title: string;
  reason: string;
}

export type PortfolioRisk = "contained" | "elevated" | "severe";

export type AgentStatus = "pending" | "running" | "done" | "error";

/** One agent or subagent in the run, tracked from the SDK message stream. */
export interface AgentRun {
  id: string;
  /** Subagent type, or "lead" for the orchestrator. */
  type: string;
  label: string;
  status: AgentStatus;
  /** Most recent tool call, rendered as a one-line trace. */
  activity: string;
  toolCalls: number;
}

export type AuditStatus = "idle" | "running" | "complete" | "error";

export interface AuditState {
  status: AuditStatus;
  risk: PortfolioRisk | null;
  verdict: string;
  totalExposureUsd: number | null;
  findings: Finding[];
  candidates: Candidate[];
  dismissals: Dismissal[];
  costUsd: number | null;
  error?: string;
}

export type Phase = "configure" | "detecting" | "gating" | "complete" | "error";
