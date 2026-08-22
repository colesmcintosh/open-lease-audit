"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_BUDGET_USD,
  MIN_BUDGET_USD,
  suggestedBudget,
} from "@/lib/budget";
import { cn } from "@/lib/utils";

interface BudgetControlProps {
  budgetUsd: number;
  leaseCount: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

/**
 * A run that hits its ceiling dies mid-pipeline — usually after the detectors
 * have spent the money but before the gate publishes anything — so the control
 * shows what this portfolio is likely to need rather than leaving the user to
 * discover the limit by hitting it.
 */
export function BudgetControl({
  budgetUsd,
  leaseCount,
  disabled,
  onChange,
}: BudgetControlProps) {
  const suggested = suggestedBudget(leaseCount);
  const isTight = leaseCount > 0 && budgetUsd < suggested;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="microlabel flex-1 text-[9px]">Run budget</span>
        {isTight && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(suggested)}
            className="font-mono text-[9px] uppercase tracking-[0.12em] text-warn hover:text-warn/80 disabled:opacity-40"
          >
            Suggest ${suggested}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          disabled={disabled || budgetUsd <= MIN_BUDGET_USD}
          onClick={() => onChange(budgetUsd - 1)}
          className="size-7 flex-none rounded-sm"
          aria-label="Decrease budget"
        >
          <Minus className="size-3" />
        </Button>

        <label className="relative flex flex-1 items-center">
          <span className="pointer-events-none absolute left-2.5 font-mono text-[11px] text-muted-foreground">
            $
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_BUDGET_USD}
            max={MAX_BUDGET_USD}
            value={budgetUsd}
            disabled={disabled}
            onChange={(event) => onChange(event.target.valueAsNumber)}
            aria-label="Run budget in US dollars"
            className={cn(
              "h-7 w-full rounded-sm border bg-background pl-5 pr-2 text-center font-mono text-[11px] tabular-nums outline-none transition-colors",
              "focus-visible:border-primary/60 disabled:opacity-50",
              isTight ? "border-warn/50 text-warn" : "border-input text-foreground"
            )}
          />
        </label>

        <Button
          variant="outline"
          size="icon"
          disabled={disabled || budgetUsd >= MAX_BUDGET_USD}
          onClick={() => onChange(budgetUsd + 1)}
          className="size-7 flex-none rounded-sm"
          aria-label="Increase budget"
        >
          <Plus className="size-3" />
        </Button>
      </div>

      <p className="font-mono text-[9px] leading-relaxed text-muted-foreground/70">
        {isTight
          ? `${leaseCount} ${leaseCount === 1 ? "lease" : "leases"} usually needs about $${suggested}. A run that stops short publishes nothing.`
          : "Hard ceiling. The agents stop the moment they reach it."}
      </p>
    </div>
  );
}
