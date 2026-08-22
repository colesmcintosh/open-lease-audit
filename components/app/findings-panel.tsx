"use client";

import { Coins, Gavel, Quote, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AuditState, ExposureKind, FindingSeverity } from "@/lib/types";

const SEVERITY_META: Record<
  FindingSeverity,
  { tone: string; rail: string; label: string }
> = {
  critical: { tone: "text-critical", rail: "bg-critical", label: "CRITICAL" },
  major: { tone: "text-warn", rail: "bg-warn", label: "MAJOR" },
};

const EXPOSURE_META: Record<
  ExposureKind,
  { icon: typeof Coins; label: string }
> = {
  monetary: { icon: Coins, label: "Monetary loss" },
  litigation: { icon: Gavel, label: "Litigation risk" },
  both: { icon: ShieldAlert, label: "Loss + litigation" },
};

const RISK_TONE = {
  contained: "text-ok border-ok/40",
  elevated: "text-warn border-warn/40",
  severe: "text-critical border-critical/40",
} as const;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function FindingsPanel({ audit }: { audit: AuditState }) {
  if (audit.status === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
        <div className="bracket-frame border border-dashed px-6 py-4">
          <p className="microlabel">No audit on record</p>
        </div>
        <p className="max-w-sm text-center text-[11px] text-muted-foreground">
          Run the pipeline. Detector agents sweep the portfolio, a materiality
          gate throws out everything that would not cost you money or land you
          in court, and only what survives appears here.
        </p>
      </div>
    );
  }

  if (audit.status === "error" && !audit.findings.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="bracket-frame max-w-md border border-critical/40 bg-critical/10 px-5 py-4">
          <p className="microlabel mb-1 text-critical">Audit fault</p>
          <p className="text-[11px] leading-relaxed text-foreground/80">{audit.error}</p>
        </div>
      </div>
    );
  }

  const suppressed = audit.dismissals.length;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="bracket-frame flex flex-col gap-2 border bg-card/60 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="microlabel text-[9px]">Portfolio verdict</span>
          <div className="flex items-center gap-2">
            {audit.totalExposureUsd != null && (
              <span className="border border-critical/40 px-2 py-0.5 font-mono text-[9px] tabular-nums text-critical">
                {usd.format(audit.totalExposureUsd)} at risk
              </span>
            )}
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
        </div>
        {audit.verdict ? (
          <p className="text-xs leading-relaxed text-foreground/90">{audit.verdict}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="stream-shimmer h-3 w-full rounded-xs" />
            <div className="stream-shimmer h-3 w-2/3 rounded-xs" />
          </div>
        )}
        {suppressed > 0 && (
          <p className="border-t pt-2 font-mono text-[10px] text-muted-foreground">
            {suppressed} lesser issue{suppressed === 1 ? "" : "s"} withheld by the
            materiality gate — nothing below the loss threshold is shown.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {audit.findings.map((finding, index) => {
          const meta = SEVERITY_META[finding.severity] ?? SEVERITY_META.major;
          const exposure = EXPOSURE_META[finding.exposure] ?? EXPOSURE_META.monetary;
          const ExposureIcon = exposure.icon;
          return (
            <article
              key={finding.id}
              className="reveal relative flex gap-0 border bg-card/60"
              style={{ animationDelay: `${Math.min(index * 60, 300)}ms` }}
            >
              <div className={cn("w-0.5 flex-none", meta.rail)} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5">
                <div className="flex items-center gap-2">
                  <ExposureIcon className={cn("size-3.5 flex-none", meta.tone)} />
                  <span className={cn("font-mono text-[9px] tracking-[0.16em]", meta.tone)}>
                    {meta.label}
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground/70">
                    {exposure.label.toUpperCase()}
                  </span>
                  {finding.exposureUsd != null && (
                    <span className="font-mono text-[10px] tabular-nums text-foreground/80">
                      ≈ {usd.format(finding.exposureUsd)}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[9px] text-muted-foreground/60">
                    {finding.id}
                  </span>
                </div>

                <h3 className="text-xs font-semibold">{finding.title}</h3>

                {finding.detail && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {finding.detail}
                  </p>
                )}

                {finding.evidence.length > 0 && (
                  <div className="flex flex-col gap-1 pt-0.5">
                    {finding.evidence.map((quote, quoteIndex) => (
                      <p
                        key={quoteIndex}
                        className="flex gap-1.5 border-l border-border pl-2 font-mono text-[10px] leading-relaxed text-foreground/70"
                      >
                        <Quote className="mt-0.5 size-2.5 flex-none text-muted-foreground/50" />
                        <span>{quote}</span>
                      </p>
                    ))}
                  </div>
                )}

                {finding.leases.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    {finding.leases.map((lease) => (
                      <Badge
                        key={lease}
                        variant="outline"
                        className="rounded-xs px-1.5 py-0 font-mono text-[9px] text-foreground/70"
                      >
                        {lease.split("/").pop()}
                      </Badge>
                    ))}
                  </div>
                )}

                {finding.recommendation && (
                  <p className="border-l border-primary/40 pl-2 text-[11px] leading-relaxed text-foreground/80">
                    <span className="microlabel mr-1.5 text-[9px] text-primary">Action</span>
                    {finding.recommendation}
                  </p>
                )}

                {finding.raisedBy && (
                  <span className="font-mono text-[9px] text-muted-foreground/50">
                    raised by {finding.raisedBy} · confirmed by materiality-gate
                  </span>
                )}
              </div>
            </article>
          );
        })}

        {audit.status === "running" && (
          <div className="flex items-center gap-2 px-1 py-2">
            <span className="status-dot animate-status-pulse text-primary" />
            <span className="microlabel text-[9px]">
              {audit.candidates.length
                ? `${audit.candidates.length} candidate${audit.candidates.length === 1 ? "" : "s"} under review`
                : "Detectors sweeping the portfolio…"}
            </span>
          </div>
        )}

        {audit.status === "complete" && audit.findings.length === 0 && (
          <div className="bracket-frame border border-ok/30 bg-ok/5 px-4 py-3">
            <p className="font-mono text-[11px] text-ok">
              No major exposure found. Nothing in this portfolio clears the loss
              or litigation threshold.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
