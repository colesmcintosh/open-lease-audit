"use client";

import { Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BudgetControl } from "@/components/app/budget-control";
import { ConnectionsPanel } from "@/components/app/connections-panel";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { FindingsPanel } from "@/components/app/findings-panel";
import { Topbar } from "@/components/app/topbar";
import { WorkflowGraph } from "@/components/app/workflow-graph";
import { useAuditEngine } from "@/hooks/use-audit-engine";

export default function Home() {
  const engine = useAuditEngine();

  const canRun = engine.docs.length > 0 && !engine.isRunning;
  const hasRun = engine.audit.status !== "idle";

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Topbar phase={engine.phase} />

      <main className="flex min-h-0 flex-1">
        {/* Control rail */}
        <aside
          className="reveal flex w-[340px] flex-none flex-col border-r bg-background/60"
          style={{ animationDelay: "60ms" }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
            <DocumentsPanel
              docs={engine.docs}
              disabled={engine.isRunning}
              onAddFiles={engine.addFiles}
              onAddDocs={engine.addDocs}
              onRemove={engine.removeDoc}
            />
            <ConnectionsPanel
              catalog={engine.connectorCatalog}
              connectors={engine.connectors}
              disabled={engine.isRunning}
              onConnect={engine.connectConnector}
              onDisconnect={engine.disconnectConnector}
            />
          </div>

          <div className="flex flex-none flex-col gap-3 border-t bg-background/80 p-4">
            <BudgetControl
              budgetUsd={engine.budgetUsd}
              leaseCount={engine.docs.length}
              disabled={engine.isRunning}
              onChange={engine.setBudgetUsd}
            />
            <Button
              disabled={!canRun}
              onClick={() => void engine.run()}
              className="bracket-frame h-10 w-full rounded-sm bg-primary font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-foreground hover:bg-primary/85 disabled:opacity-40"
            >
              <Play className="size-3.5" />
              {engine.isRunning
                ? "Agents running…"
                : `Run audit — ${engine.docs.length} ${engine.docs.length === 1 ? "lease" : "leases"}`}
            </Button>
            {engine.isRunning ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={engine.stop}
                className="h-7 rounded-sm font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-critical"
              >
                <Square className="size-3" /> Stop run
              </Button>
            ) : (
              hasRun && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={engine.reset}
                  className="h-7 rounded-sm font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-3" /> Clear run
                </Button>
              )
            )}
          </div>
        </aside>

        {/* Operations area */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div
            className="reveal relative h-[42%] min-h-56 flex-none border-b"
            style={{ animationDelay: "120ms" }}
          >
            <WorkflowGraph
              docs={engine.docs}
              agents={engine.agents}
              audit={engine.audit}
            />
          </div>

          <div
            className="reveal flex min-h-0 flex-1 flex-col"
            style={{ animationDelay: "180ms" }}
          >
            <div className="flex flex-none items-center gap-2 border-b bg-background/60 px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
                Findings
              </span>
              {engine.audit.findings.length > 0 && (
                <span className="rounded-xs bg-critical/20 px-1.5 font-mono text-[9px] tabular-nums text-critical">
                  {engine.audit.findings.length}
                </span>
              )}
              <div className="ml-auto flex items-center gap-3">
                {engine.audit.dismissals.length > 0 && (
                  <span className="microlabel text-[9px] text-muted-foreground/70">
                    {engine.audit.dismissals.length} suppressed
                  </span>
                )}
                {engine.audit.costUsd != null && (
                  <span className="microlabel text-[9px] tabular-nums">
                    ${engine.audit.costUsd.toFixed(2)}
                  </span>
                )}
                <span className="microlabel text-[9px]">
                  {engine.docs.length} {engine.docs.length === 1 ? "lease" : "leases"}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <FindingsPanel audit={engine.audit} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
