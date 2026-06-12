"use client";

import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AuditState, FindingSeverity } from "@/lib/types";

const SEVERITY_META: Record<
  FindingSeverity,
  { icon: typeof Info; tone: string; rail: string; label: string }
> = {
  critical: {
    icon: ShieldAlert,
    tone: "text-critical",
    rail: "bg-critical",
    label: "CRITICAL",
  },
  warning: {
    icon: AlertTriangle,
    tone: "text-warn",
    rail: "bg-warn",
    label: "WARNING",
  },
  info: { icon: Info, tone: "text-primary", rail: "bg-primary", label: "INFO" },
};

const RISK_TONE = {
  low: "text-ok border-ok/40",
  elevated: "text-warn border-warn/40",
  high: "text-critical border-critical/40",
} as const;

export function FindingsPanel({ audit }: { audit: AuditState }) {
  if (audit.status === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
        <div className="bracket-frame border border-dashed px-6 py-4">
          <p className="microlabel">No audit on record</p>
        </div>
        <p className="max-w-sm text-center text-[11px] text-muted-foreground">
          Run the pipeline to reconcile extracted fields across leases. Findings
          stream in here, ranked by severity.
        </p>
      </div>
    );
  }

  if (audit.status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="bracket-frame max-w-md border border-critical/40 bg-critical/10 px-5 py-4">
          <p className="microlabel mb-1 text-critical">Audit fault</p>
          <p className="text-[11px] leading-relaxed text-foreground/80">
            {audit.error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="bracket-frame flex flex-col gap-2 border bg-card/60 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="microlabel text-[9px]">Auditor verdict</span>
          {audit.risk ? (
            <span
              className={cn(
                "border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em]",
                RISK_TONE[audit.risk]
              )}
            >
              Risk: {audit.risk}
            </span>
          ) : (
            <div className="stream-shimmer h-4 w-20 rounded-xs" />
          )}
        </div>
        {audit.verdict ? (
          <p className="text-xs leading-relaxed text-foreground/90">
            {audit.verdict}
            {audit.status === "running" && (
              <span className="ml-0.5 inline-block h-3 w-1.5 animate-status-pulse bg-primary align-middle" />
            )}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="stream-shimmer h-3 w-full rounded-xs" />
            <div className="stream-shimmer h-3 w-2/3 rounded-xs" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {audit.findings.map((finding, index) => {
          const meta = SEVERITY_META[finding.severity] ?? SEVERITY_META.info;
          const Icon = meta.icon;
          return (
            <article
              key={`${finding.title}-${index}`}
              className="reveal relative flex gap-0 border bg-card/60"
              style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}
            >
              <div className={cn("w-0.5 flex-none", meta.rail)} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
                <div className="flex items-center gap-2">
                  <Icon className={cn("size-3.5 flex-none", meta.tone)} />
                  <span className={cn("font-mono text-[9px] tracking-[0.16em]", meta.tone)}>
                    {meta.label}
                  </span>
                  <span className="ml-auto font-mono text-[9px] text-muted-foreground/60">
                    F-{String(index + 1).padStart(3, "0")}
                  </span>
                </div>
                <h3 className="text-xs font-semibold">{finding.title}</h3>
                {finding.detail && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {finding.detail}
                  </p>
                )}
                {(finding.leases.length > 0 || finding.columns.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    {finding.leases.map((lease) => (
                      <Badge
                        key={lease}
                        variant="outline"
                        className="rounded-xs px-1.5 py-0 font-mono text-[9px] text-foreground/70"
                      >
                        {lease}
                      </Badge>
                    ))}
                    {finding.columns.map((column) => (
                      <Badge
                        key={column}
                        variant="outline"
                        className="rounded-xs border-primary/30 px-1.5 py-0 font-mono text-[9px] text-primary/80"
                      >
                        {column}
                      </Badge>
                    ))}
                  </div>
                )}
                {finding.recommendation && (
                  <p className="border-l border-primary/40 pl-2 text-[11px] leading-relaxed text-foreground/80">
                    <span className="microlabel mr-1.5 text-[9px] text-primary">
                      Action
                    </span>
                    {finding.recommendation}
                  </p>
                )}
              </div>
            </article>
          );
        })}

        {audit.status === "running" && (
          <div className="flex items-center gap-2 px-1 py-2">
            <span className="status-dot animate-status-pulse text-primary" />
            <span className="microlabel text-[9px]">
              Reconciling portfolio…
            </span>
          </div>
        )}

        {audit.status === "complete" && audit.findings.length === 0 && (
          <div className="bracket-frame border border-ok/30 bg-ok/5 px-4 py-3">
            <p className="font-mono text-[11px] text-ok">
              No mismatches detected across the portfolio.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
