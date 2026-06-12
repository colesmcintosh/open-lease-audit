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

/** Extracted fields for one lease, keyed by columnKey(column.name). */
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

export type FindingSeverity = "critical" | "warning" | "info";

export interface Finding {
  title: string;
  severity: FindingSeverity;
  columns: string[];
  leases: string[];
  detail: string;
  recommendation: string;
}

export type AuditStatus = "idle" | "running" | "complete" | "error";

export interface AuditState {
  status: AuditStatus;
  risk: "low" | "elevated" | "high" | null;
  verdict: string;
  findings: Finding[];
  error?: string;
}

export type Phase = "configure" | "extracting" | "auditing" | "complete" | "error";
