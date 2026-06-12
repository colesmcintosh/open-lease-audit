"use client";

import { useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentsPanel } from "@/components/app/documents-panel";
import { ExtractionMatrix } from "@/components/app/extraction-matrix";
import { FindingsPanel } from "@/components/app/findings-panel";
import { SchemaBuilder } from "@/components/app/schema-builder";
import { Topbar } from "@/components/app/topbar";
import { WorkflowGraph } from "@/components/app/workflow-graph";
import { useAuditEngine } from "@/hooks/use-audit-engine";
import { cn } from "@/lib/utils";

type Tab = "matrix" | "findings";

export default function Home() {
  const engine = useAuditEngine();
  const [tab, setTab] = useState<Tab>("matrix");

  const fieldCount = engine.columns.filter((column) => column.name.trim()).length;
  const canRun = engine.docs.length > 0 && fieldCount > 0 && !engine.isRunning;
  const hasRun =
    engine.audit.status !== "idle" || Object.keys(engine.extractions).length > 0;

  // Jump to findings the moment the audit stage begins streaming.
  const [prevAuditStatus, setPrevAuditStatus] = useState(engine.audit.status);
  if (engine.audit.status !== prevAuditStatus) {
    setPrevAuditStatus(engine.audit.status);
    if (engine.audit.status === "running") setTab("findings");
  }

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
            <SchemaBuilder
              columns={engine.columns}
              disabled={engine.isRunning}
              onAdd={engine.addColumn}
              onUpdate={engine.updateColumn}
              onRemove={engine.removeColumn}
            />
            <DocumentsPanel
              docs={engine.docs}
              extractions={engine.extractions}
              disabled={engine.isRunning}
              onAddFiles={engine.addFiles}
              onAddDocs={engine.addDocs}
              onRemove={engine.removeDoc}
            />
          </div>

          <div className="flex flex-none flex-col gap-2 border-t bg-background/80 p-4">
            <Button
              disabled={!canRun}
              onClick={() => void engine.run()}
              className="bracket-frame h-10 w-full rounded-sm bg-primary font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-foreground hover:bg-primary/85 disabled:opacity-40"
            >
              <Play className="size-3.5" />
              {engine.isRunning
                ? "Pipeline running…"
                : `Run audit — ${engine.docs.length} docs × ${fieldCount} fields`}
            </Button>
            {hasRun && !engine.isRunning && (
              <Button
                variant="ghost"
                size="sm"
                onClick={engine.reset}
                className="h-7 rounded-sm font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3" /> Clear run
              </Button>
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
              columns={engine.columns}
              extractions={engine.extractions}
              audit={engine.audit}
            />
          </div>

          <div
            className="reveal flex min-h-0 flex-1 flex-col"
            style={{ animationDelay: "180ms" }}
          >
            <div className="flex flex-none items-center gap-0 border-b bg-background/60">
              {(
                [
                  { id: "matrix", label: "Extraction matrix" },
                  { id: "findings", label: "Findings" },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
                    tab === id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground/80"
                  )}
                >
                  {label}
                  {id === "findings" && engine.audit.findings.length > 0 && (
                    <span className="rounded-xs bg-critical/20 px-1.5 font-mono text-[9px] tabular-nums text-critical">
                      {engine.audit.findings.length}
                    </span>
                  )}
                  {tab === id && (
                    <span className="absolute inset-x-0 -bottom-px h-px bg-primary" />
                  )}
                </button>
              ))}
              <div className="ml-auto pr-4">
                <span className="microlabel text-[9px]">
                  {engine.docs.length} docs · {fieldCount} fields
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              {tab === "matrix" ? (
                <ExtractionMatrix
                  docs={engine.docs}
                  columns={engine.columns}
                  extractions={engine.extractions}
                  flaggedCells={engine.flaggedCells}
                />
              ) : (
                <FindingsPanel audit={engine.audit} />
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
