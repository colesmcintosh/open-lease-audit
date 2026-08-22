export type ColumnType = "text" | "number" | "currency" | "date" | "boolean";

export interface ColumnDef {
  id: string;
  name: string;
  description: string;
  type: ColumnType;
}

export type Confidence = "high" | "medium" | "low";

export interface CellValue {
  value: string | number | boolean | null;
  evidence: string | null;
  confidence: Confidence | null;
}

/** Abstracted fields for one lease, keyed by columnKey(column.name). */
export type ExtractionRecord = Record<string, CellValue | undefined>;

export interface LeaseDoc {
  id: string;
  name: string;
  size: number;
  kind: "pdf" | "text";
  /** Base64 for PDFs, raw text otherwise. */
  data: string;
}

export type DocStatus = "idle" | "queued" | "extracting" | "extracted" | "error";

export interface ExtractionState {
  status: DocStatus;
  record: ExtractionRecord;
  error?: string;
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
  columns: string[];
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
  /** Set on abstractors, linking the agent to the lease it was given. */
  leaseId?: string;
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

export type Phase =
  | "configure"
  | "abstracting"
  | "detecting"
  | "gating"
  | "complete"
  | "error";
