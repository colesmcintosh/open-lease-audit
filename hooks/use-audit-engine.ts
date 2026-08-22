"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { AuditEvent } from "@/lib/audit-events";
import { clampBudget, DEFAULT_BUDGET_USD } from "@/lib/budget";
import { CONNECTORS, type ConnectorConfig } from "@/lib/connectors";
import { consumeAuditStream } from "@/lib/event-stream";
import type { AgentRun, AuditState, LeaseDoc, Phase } from "@/lib/types";

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
  const [docs, setDocs] = useState<LeaseDoc[]>([]);
  const [budgetUsd, setBudget] = useState(DEFAULT_BUDGET_USD);
  const [connectors, setConnectors] = useState<ConnectorConfig[]>([]);
  const [agents, setAgents] = useState<AgentRun[]>([]);
  const [leadNote, setLeadNote] = useState("");
  const [audit, setAudit] = useState<AuditState>(EMPTY_AUDIT);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const setBudgetUsd = useCallback((value: number) => {
    setBudget(clampBudget(value, DEFAULT_BUDGET_USD));
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
          },
        ]);
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
        break;
    }
  }, []);

  const run = useCallback(async () => {
    if (!docs.length || isRunning) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setLeadNote("");
    setAgents([LEAD_AGENT]);
    setAudit({ ...EMPTY_AUDIT, status: "running" });

    try {
      await consumeAuditStream({
        url: "/api/audit",
        body: { docs, connectors, budgetUsd },
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
  }, [applyEvent, budgetUsd, connectors, docs, isRunning]);

  const phase: Phase = useMemo(() => {
    if (audit.status === "error") return "error";
    if (audit.status === "complete") return "complete";
    if (audit.status !== "running") return "configure";
    const running = agents.filter((agent) => agent.status === "running");
    if (running.some((agent) => agent.type === "materiality-gate")) return "gating";
    return audit.findings.length ? "gating" : "detecting";
  }, [agents, audit.findings.length, audit.status]);

  return {
    docs,
    budgetUsd,
    connectors,
    connectorCatalog: CONNECTORS,
    agents,
    leadNote,
    audit,
    phase,
    isRunning,
    setBudgetUsd,
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
