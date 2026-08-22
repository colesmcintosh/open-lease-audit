"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { columnKey } from "@/lib/columns";
import { cn } from "@/lib/utils";
import type {
  CellValue,
  ColumnDef,
  ExtractionState,
  FindingSeverity,
  LeaseDoc,
} from "@/lib/types";

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const CONFIDENCE_TONE = {
  high: "text-ok",
  medium: "text-warn",
  low: "text-critical",
} as const;

const FLAG_RING: Record<FindingSeverity, string> = {
  critical: "shadow-[inset_0_0_0_1px_var(--critical)] bg-critical/10",
  major: "shadow-[inset_0_0_0_1px_var(--warn)] bg-warn/10",
};

function formatValue(cell: CellValue, type: ColumnDef["type"]) {
  if (cell.value === null) {
    return <span className="text-muted-foreground/50">∅ not specified</span>;
  }
  switch (type) {
    case "currency":
      return typeof cell.value === "number"
        ? currencyFormat.format(cell.value)
        : String(cell.value);
    case "number":
      return typeof cell.value === "number"
        ? cell.value.toLocaleString("en-US")
        : String(cell.value);
    case "boolean":
      return (
        <span className={cell.value ? "text-ok" : "text-muted-foreground"}>
          {cell.value ? "TRUE" : "FALSE"}
        </span>
      );
    default:
      return String(cell.value);
  }
}

function MatrixCell({
  cell,
  type,
  isStreaming,
  flag,
}: {
  cell: CellValue | undefined;
  type: ColumnDef["type"];
  isStreaming: boolean;
  flag?: FindingSeverity;
}) {
  if (!cell || cell.value === undefined) {
    return (
      <td className="border-b border-l px-3 py-2">
        {isStreaming ? (
          <div className="stream-shimmer h-3 w-16 rounded-xs" />
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground/30">—</span>
        )}
      </td>
    );
  }

  const content = (
    <span className="inline-flex max-w-full items-center gap-1.5">
      {cell.confidence && (
        <span
          className={cn(
            "size-1 flex-none rounded-full bg-current",
            CONFIDENCE_TONE[cell.confidence]
          )}
        />
      )}
      <span className="truncate font-mono text-[11px] tabular-nums">
        {formatValue(cell, type)}
      </span>
    </span>
  );

  return (
    <td
      className={cn(
        "max-w-48 border-b border-l px-3 py-2 transition-colors",
        flag && FLAG_RING[flag]
      )}
    >
      {cell.evidence ? (
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="max-w-72 rounded-sm border bg-popover text-popover-foreground"
          >
            <p className="microlabel mb-1 text-[9px] text-primary">Source clause</p>
            <p className="text-[11px] leading-relaxed">“{cell.evidence}”</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        content
      )}
    </td>
  );
}

interface ExtractionMatrixProps {
  docs: LeaseDoc[];
  columns: ColumnDef[];
  extractions: Record<string, ExtractionState>;
  flaggedCells: Map<string, FindingSeverity>;
}

export function ExtractionMatrix({
  docs,
  columns,
  extractions,
  flaggedCells,
}: ExtractionMatrixProps) {
  const activeColumns = columns.filter((column) => column.name.trim());

  if (!docs.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8">
        <div className="bracket-frame border border-dashed px-6 py-4">
          <p className="microlabel">Awaiting documents</p>
        </div>
        <p className="max-w-sm text-center text-[11px] text-muted-foreground">
          Upload lease files or load the sample portfolio. Abstracted fields
          stream into this matrix as each agent reports.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-10">
          <tr className="bg-background">
            <th className="sticky left-0 z-20 border-b bg-background px-3 py-2">
              <span className="microlabel text-[9px]">Lease</span>
            </th>
            {activeColumns.map((column) => (
              <th key={column.id} className="min-w-32 border-b border-l bg-background px-3 py-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="microlabel text-[9px] text-foreground/80">
                    {column.name}
                  </span>
                  <span className="font-mono text-[8px] uppercase text-primary/60">
                    {column.type}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => {
            const state = extractions[doc.id];
            const isStreaming =
              state?.status === "extracting" || state?.status === "queued";
            return (
              <tr key={doc.id} className="group hover:bg-accent/30">
                <td className="sticky left-0 z-10 max-w-52 border-b bg-background px-3 py-2 group-hover:bg-accent/30">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "status-dot",
                        state?.status === "extracting" && "animate-status-pulse text-primary",
                        state?.status === "extracted" && "text-ok",
                        state?.status === "error" && "text-critical",
                        (!state || state.status === "queued" || state.status === "idle") &&
                          "text-muted-foreground/50"
                      )}
                    />
                    <span className="truncate font-mono text-[11px]" title={doc.name}>
                      {doc.name}
                    </span>
                  </div>
                  {state?.status === "error" && (
                    <p className="mt-1 truncate text-[10px] text-critical" title={state.error}>
                      {state.error}
                    </p>
                  )}
                </td>
                {activeColumns.map((column) => {
                  const key = columnKey(column.name);
                  return (
                    <MatrixCell
                      key={column.id}
                      cell={state?.record[key]}
                      type={column.type}
                      isStreaming={Boolean(isStreaming)}
                      flag={flaggedCells.get(`${doc.name}::${key}`)}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
