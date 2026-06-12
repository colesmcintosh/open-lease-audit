"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Phase } from "@/lib/types";

const PHASE_LABEL: Record<Phase, { label: string; tone: string; pulse: boolean }> = {
  configure: { label: "Standing by", tone: "text-muted-foreground", pulse: false },
  extracting: { label: "Extracting", tone: "text-primary", pulse: true },
  auditing: { label: "Auditing", tone: "text-warn", pulse: true },
  complete: { label: "Audit complete", tone: "text-ok", pulse: false },
  error: { label: "Fault", tone: "text-critical", pulse: false },
};

function UtcClock() {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const tick = () =>
      setNow(new Date().toISOString().slice(11, 19));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="font-mono text-xs tabular-nums text-muted-foreground" suppressHydrationWarning>
      {now ?? "--:--:--"} UTC
    </span>
  );
}

export function Topbar({ phase }: { phase: Phase }) {
  const status = PHASE_LABEL[phase];

  return (
    <header className="reveal flex h-12 flex-none items-center gap-4 border-b bg-background/80 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="bracket-frame flex size-6 items-center justify-center border border-primary/40">
          <div className="size-2 rotate-45 bg-primary" />
        </div>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-semibold tracking-[0.22em] text-foreground">
            OPEN LEASE AUDIT
          </span>
          <span className="microlabel hidden sm:inline">
            Portfolio integrity console
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-5">
        <div className={cn("flex items-center gap-2", status.tone)}>
          <span className={cn("status-dot", status.pulse && "animate-status-pulse")} />
          <span className="font-mono text-[11px] uppercase tracking-[0.14em]">
            {status.label}
          </span>
        </div>
        <div className="hidden h-4 w-px bg-border md:block" />
        <span className="microlabel hidden md:inline">claude-sonnet-4-6</span>
        <div className="hidden h-4 w-px bg-border md:block" />
        <UtcClock />
      </div>
    </header>
  );
}
