"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { AuditEvent } from "@/lib/audit-events";
import { columnKey } from "@/lib/columns";
import { CONNECTORS, type ConnectorConfig } from "@/lib/connectors";
import { consumeAuditStream } from "@/lib/event-stream";
import type {
  AgentRun,
  AuditState,
  ColumnDef,
  ExtractionState,
  Finding,
  LeaseDoc,
  Phase,
} from "@/lib/types";

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
  totalExposureUsd: null,
  findings: [],
  candidates: [],
  dismissals: [],
  costUsd: null,
};

const LEAD_AGENT: AgentRun = {
  id: "lead",
  type: "lead",
  label: "Lead auditor",
  status: "running",
  activity: "Planning the pipeline",
  toolCalls: 0,
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

export function useAuditEngine() {
  const [columns, setColumns] = useState<ColumnDef[]>(DEFAULT_COLUMNS);
  const [docs, setDocs] = useState<LeaseDoc[]>([]);
  const [connectors, setConnectors] = useState<ConnectorConfig[]>([]);
  const [extractions, setExtractions] = useState<Record<string, ExtractionState>>({});
  const [agents, setAgents] = useState<AgentRun[]>([]);
  const [leadNote, setLeadNote] = useState("");
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

  /** Connector credentials live in memory only — they are never persisted. */
  const connectConnector = useCallback((config: ConnectorConfig) => {
    setConnectors((prev) => [
      ...prev.filter((entry) => entry.id !== config.id),
      config,
    ]);
  }, []);

  const disconnectConnector = useCallback((id: string) => {
    setConnectors((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setExtractions({});
    setAgents([]);
    setLeadNote("");
    setAudit(EMPTY_AUDIT);
    setIsRunning(false);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAgents((prev) =>
      prev.map((agent) =>
        agent.status === "running" ? { ...agent, status: "done" } : agent
      )
    );
    setAudit((prev) => (prev.status === "running" ? { ...prev, status: "complete" } : prev));
    setIsRunning(false);
  }, []);

  const applyEvent = useCallback((event: AuditEvent) => {
    switch (event.type) {
      case "run_started":
        setExtractions(
          Object.fromEntries(
            event.leases.map((lease) => [lease.id, { status: "queued", record: {} }])
          )
        );
        setAgents([LEAD_AGENT]);
        break;

      case "agent_started":
        setAgents((prev) => [
          ...prev.filter((agent) => agent.id !== event.id),
          {
            id: event.id,
            type: event.agent,
            label: event.label,
            status: "running",
            activity: "Reading the brief",
            toolCalls: 0,
            ...(event.leaseId ? { leaseId: event.leaseId } : {}),
          },
        ]);
        if (event.leaseId) {
          setExtractions((prev) => ({
            ...prev,
            [event.leaseId!]: {
              status: "extracting",
              record: prev[event.leaseId!]?.record ?? {},
            },
          }));
        }
        break;

      case "agent_activity":
        setAgents((prev) =>
          prev.map((agent) =>
            agent.id === event.id
              ? { ...agent, activity: event.activity, toolCalls: agent.toolCalls + 1 }
              : agent
          )
        );
        break;

      case "agent_finished":
        setAgents((prev) =>
          prev.map((agent) =>
            agent.id === event.id
              ? { ...agent, status: event.status, activity: "Reported" }
              : agent
          )
        );
        break;

      case "lead_note":
        setLeadNote(event.text);
        setAgents((prev) =>
          prev.map((agent) =>
            agent.id === "lead" ? { ...agent, activity: event.text } : agent
          )
        );
        break;

      case "abstract":
        setExtractions((prev) => ({
          ...prev,
          [event.leaseId]: { status: "extracted", record: event.fields },
        }));
        break;

      case "candidate":
        setAudit((prev) => ({
          ...prev,
          status: "running",
          candidates: [...prev.candidates, event.candidate],
        }));
        break;

      case "finding":
        setAudit((prev) => ({
          ...prev,
          status: "running",
          findings: [...prev.findings, event.finding],
        }));
        break;

      case "dismissal":
        setAudit((prev) => ({
          ...prev,
          dismissals: [...prev.dismissals, event.dismissal],
        }));
        break;

      case "summary":
        setAudit((prev) => ({
          ...prev,
          risk: event.risk,
          verdict: event.verdict,
          totalExposureUsd: event.totalExposureUsd,
        }));
        break;

      case "error":
        setAudit((prev) => ({ ...prev, status: "error", error: event.message }));
        break;

      case "done":
        setAudit((prev) => ({
          ...prev,
          status: prev.status === "error" ? "error" : "complete",
          costUsd: event.costUsd,
        }));
        setAgents((prev) =>
          prev.map((agent) =>
            agent.status === "running" ? { ...agent, status: "done" } : agent
          )
        );
        // Any lease no agent ever reported on stays honest about that.
        setExtractions((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([id, state]) =>
              state.status === "extracted"
                ? [id, state]
                : [
                    id,
                    {
                      ...state,
                      status: "error",
                      error: "No abstract was reported for this lease.",
                    },
                  ]
            )
          )
        );
        break;
    }
  }, []);

  const run = useCallback(async () => {
    const activeColumns = columns.filter((column) => column.name.trim());
    if (!docs.length || !activeColumns.length || isRunning) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setLeadNote("");
    setAgents([LEAD_AGENT]);
    setAudit({ ...EMPTY_AUDIT, status: "running" });
    setExtractions(
      Object.fromEntries(docs.map((doc) => [doc.id, { status: "queued", record: {} }]))
    );

    try {
      await consumeAuditStream({
        url: "/api/audit",
        body: { columns: activeColumns, docs, connectors },
        signal: controller.signal,
        onEvent: applyEvent,
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setAudit((prev) => ({
          ...prev,
          status: "error",
          error: error instanceof Error ? error.message : "The audit failed.",
        }));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsRunning(false);
    }
  }, [applyEvent, columns, connectors, docs, isRunning]);

  const phase: Phase = useMemo(() => {
    if (audit.status === "error") return "error";
    if (audit.status === "complete") return "complete";
    if (audit.status !== "running") return "configure";
    const running = agents.filter((agent) => agent.status === "running");
    if (running.some((agent) => agent.type === "materiality-gate")) return "gating";
    if (running.some((agent) => agent.type.endsWith("-auditor") || agent.type.endsWith("-reconciler")))
      return "detecting";
    if (running.some((agent) => agent.type === "lease-abstractor")) return "abstracting";
    return audit.findings.length || audit.candidates.length ? "gating" : "abstracting";
  }, [agents, audit.candidates.length, audit.findings.length, audit.status]);

  /** Cells a published finding touches, as "leaseName::columnKey". */
  const flaggedCells = useMemo(() => {
    const flagged = new Map<string, Finding["severity"]>();
    const byPath = new Map<string, string>();
    for (const doc of docs) {
      byPath.set(doc.name.toLowerCase(), doc.name);
    }
    const resolveLease = (label: string) => {
      const base = label.split("/").pop()?.toLowerCase() ?? label.toLowerCase();
      return (
        byPath.get(label.toLowerCase()) ??
        docs.find((doc) => {
          const name = doc.name.toLowerCase();
          return name === base || base.startsWith(name.replace(/\.[^.]+$/, ""));
        })?.name ??
        docs.find((doc) => base.includes(doc.name.toLowerCase().replace(/\.[^.]+$/, "")))
          ?.name
      );
    };

    for (const finding of audit.findings) {
      for (const rawLease of finding.leases) {
        const lease = resolveLease(rawLease);
        if (!lease) continue;
        for (const column of finding.columns) {
          const key = `${lease}::${columnKey(column)}`;
          if (finding.severity === "critical" || !flagged.has(key)) {
            flagged.set(key, finding.severity);
          }
        }
      }
    }
    return flagged;
  }, [audit.findings, docs]);

  return {
    columns,
    docs,
    connectors,
    connectorCatalog: CONNECTORS,
    extractions,
    agents,
    leadNote,
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
    connectConnector,
    disconnectConnector,
    reset,
    stop,
    run,
  };
}

export type AuditEngine = ReturnType<typeof useAuditEngine>;
