"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { columnKey, type AuditResultPayload } from "@/lib/audit-schema";
import { streamPartialObject } from "@/lib/stream-client";
import type {
  AuditState,
  ColumnDef,
  ExtractionRecord,
  ExtractionState,
  Finding,
  LeaseDoc,
  Phase,
} from "@/lib/types";

const EXTRACTION_CONCURRENCY = 3;

export const DEFAULT_COLUMNS: ColumnDef[] = [
  {
    id: "col-tenant",
    name: "Tenant",
    description: "Full legal name of the tenant entity as written in the lease.",
    type: "text",
  },
  {
    id: "col-landlord",
    name: "Landlord",
    description: "Full legal name of the landlord entity as written in the lease.",
    type: "text",
  },
  {
    id: "col-base-rent",
    name: "Monthly Base Rent",
    description: "Initial monthly base rent amount.",
    type: "currency",
  },
  {
    id: "col-start",
    name: "Commencement Date",
    description: "Date the lease term commences.",
    type: "date",
  },
  {
    id: "col-end",
    name: "Expiration Date",
    description: "Date the lease term expires.",
    type: "date",
  },
  {
    id: "col-deposit",
    name: "Security Deposit",
    description: "Security deposit amount held by the landlord.",
    type: "currency",
  },
  {
    id: "col-escalation",
    name: "Annual Escalation %",
    description: "Annual base rent escalation percentage, if any.",
    type: "number",
  },
  {
    id: "col-renewal",
    name: "Renewal Option",
    description: "Whether the tenant holds an option to renew the lease.",
    type: "boolean",
  },
];

const EMPTY_AUDIT: AuditState = {
  status: "idle",
  risk: null,
  verdict: "",
  findings: [],
};

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function fileToDoc(file: File): Promise<LeaseDoc> {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    if (isPdf) {
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve({
          id: newId("doc"),
          name: file.name,
          size: file.size,
          kind: "pdf",
          data: dataUrl.slice(dataUrl.indexOf(",") + 1),
        });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () =>
        resolve({
          id: newId("doc"),
          name: file.name,
          size: file.size,
          kind: "text",
          data: reader.result as string,
        });
      reader.readAsText(file);
    }
  });
}

const SEVERITIES = ["critical", "warning", "info"] as const;
const RISKS = ["low", "elevated", "high"] as const;

/**
 * Coerces a partial streamed audit payload into renderable state. Enum values
 * can arrive as incomplete strings mid-stream (e.g. "warni"), so anything that
 * is not an exact match falls back to a safe default.
 */
function normalizeAudit(partial: Partial<AuditResultPayload>): Omit<AuditState, "status"> {
  const findings: Finding[] = (partial.findings ?? [])
    .filter((finding): finding is NonNullable<typeof finding> => Boolean(finding))
    .map((finding) => ({
      title: finding.title ?? "",
      severity: SEVERITIES.includes(finding.severity as Finding["severity"])
        ? (finding.severity as Finding["severity"])
        : "info",
      columns: (finding.columns ?? []).filter(Boolean) as string[],
      leases: (finding.leases ?? []).filter(Boolean) as string[],
      detail: finding.detail ?? "",
      recommendation: finding.recommendation ?? "",
    }));
  return {
    risk: RISKS.includes(partial.risk as NonNullable<AuditState["risk"]>)
      ? (partial.risk as AuditState["risk"])
      : null,
    verdict: partial.verdict ?? "",
    findings,
  };
}

export function useAuditEngine() {
  const [columns, setColumns] = useState<ColumnDef[]>(DEFAULT_COLUMNS);
  const [docs, setDocs] = useState<LeaseDoc[]>([]);
  const [extractions, setExtractions] = useState<Record<string, ExtractionState>>({});
  const [audit, setAudit] = useState<AuditState>(EMPTY_AUDIT);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const addColumn = useCallback(() => {
    setColumns((prev) => [
      ...prev,
      { id: newId("col"), name: "", description: "", type: "text" },
    ]);
  }, []);

  const updateColumn = useCallback((id: string, patch: Partial<ColumnDef>) => {
    setColumns((prev) =>
      prev.map((column) => (column.id === id ? { ...column, ...patch } : column))
    );
  }, []);

  const removeColumn = useCallback((id: string) => {
    setColumns((prev) => prev.filter((column) => column.id !== id));
  }, []);

  const addFiles = useCallback(async (files: Iterable<File>) => {
    const incoming = await Promise.all(Array.from(files).map(fileToDoc));
    setDocs((prev) => [...prev, ...incoming]);
  }, []);

  const addDocs = useCallback((incoming: LeaseDoc[]) => {
    setDocs((prev) => [...prev, ...incoming]);
  }, []);

  const removeDoc = useCallback((id: string) => {
    setDocs((prev) => prev.filter((doc) => doc.id !== id));
    setExtractions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setExtractions({});
    setAudit(EMPTY_AUDIT);
    setIsRunning(false);
  }, []);

  const run = useCallback(async () => {
    const activeColumns = columns.filter((column) => column.name.trim());
    if (!docs.length || !activeColumns.length || isRunning) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setAudit(EMPTY_AUDIT);
    setExtractions(
      Object.fromEntries(
        docs.map((doc) => [doc.id, { status: "queued", record: {} }])
      )
    );

    const results = new Map<string, ExtractionRecord>();
    const queue = [...docs];

    const worker = async () => {
      while (queue.length) {
        const doc = queue.shift();
        if (!doc) return;
        setExtractions((prev) => ({
          ...prev,
          [doc.id]: { status: "extracting", record: {} },
        }));
        try {
          const record = await streamPartialObject<ExtractionRecord>({
            url: "/api/extract",
            body: {
              columns: activeColumns,
              doc: { name: doc.name, kind: doc.kind, data: doc.data },
            },
            signal: controller.signal,
            onPartial: (partial) =>
              setExtractions((prev) => ({
                ...prev,
                [doc.id]: { status: "extracting", record: partial },
              })),
          });
          results.set(doc.id, record);
          setExtractions((prev) => ({
            ...prev,
            [doc.id]: { status: "extracted", record },
          }));
        } catch (error) {
          if (controller.signal.aborted) return;
          setExtractions((prev) => ({
            ...prev,
            [doc.id]: {
              status: "error",
              record: prev[doc.id]?.record ?? {},
              error: error instanceof Error ? error.message : "Extraction failed",
            },
          }));
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(EXTRACTION_CONCURRENCY, docs.length) },
        worker
      )
    );

    if (controller.signal.aborted) return;

    if (results.size < 1) {
      setAudit({
        ...EMPTY_AUDIT,
        status: "error",
        error: "No leases were extracted successfully.",
      });
      setIsRunning(false);
      return;
    }

    setAudit({ ...EMPTY_AUDIT, status: "running" });
    try {
      const rows = docs
        .filter((doc) => results.has(doc.id))
        .map((doc) => ({ lease: doc.name, fields: results.get(doc.id) }));
      const final = await streamPartialObject<Partial<AuditResultPayload>>({
        url: "/api/audit",
        body: { columns: activeColumns, rows },
        signal: controller.signal,
        onPartial: (partial) =>
          setAudit({ status: "running", ...normalizeAudit(partial) }),
      });
      setAudit({ status: "complete", ...normalizeAudit(final) });
    } catch (error) {
      if (!controller.signal.aborted) {
        setAudit({
          ...EMPTY_AUDIT,
          status: "error",
          error: error instanceof Error ? error.message : "Audit failed",
        });
      }
    } finally {
      setIsRunning(false);
    }
  }, [columns, docs, isRunning]);

  const phase: Phase = useMemo(() => {
    if (audit.status === "error") return "error";
    if (audit.status === "complete") return "complete";
    if (audit.status === "running") return "auditing";
    if (Object.values(extractions).some((e) => e.status === "extracting" || e.status === "queued"))
      return "extracting";
    return "configure";
  }, [audit.status, extractions]);

  /** Cells flagged by audit findings, as "leaseName::columnKey". */
  const flaggedCells = useMemo(() => {
    const flagged = new Map<string, Finding["severity"]>();
    const rank = { info: 0, warning: 1, critical: 2 };
    for (const finding of audit.findings) {
      for (const lease of finding.leases) {
        for (const column of finding.columns) {
          const key = `${lease}::${columnKey(column)}`;
          const existing = flagged.get(key);
          if (!existing || rank[finding.severity] > rank[existing]) {
            flagged.set(key, finding.severity);
          }
        }
      }
    }
    return flagged;
  }, [audit.findings]);

  return {
    columns,
    docs,
    extractions,
    audit,
    phase,
    isRunning,
    flaggedCells,
    addColumn,
    updateColumn,
    removeColumn,
    addFiles,
    addDocs,
    removeDoc,
    reset,
    run,
  };
}

export type AuditEngine = ReturnType<typeof useAuditEngine>;
