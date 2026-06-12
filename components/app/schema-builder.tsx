"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnDef, ColumnType } from "@/lib/types";

const COLUMN_TYPES: Array<{ value: ColumnType; label: string }> = [
  { value: "text", label: "TEXT" },
  { value: "number", label: "NUM" },
  { value: "currency", label: "CUR" },
  { value: "date", label: "DATE" },
  { value: "boolean", label: "BOOL" },
];

interface SchemaBuilderProps {
  columns: ColumnDef[];
  disabled: boolean;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<ColumnDef>) => void;
  onRemove: (id: string) => void;
}

export function SchemaBuilder({
  columns,
  disabled,
  onAdd,
  onUpdate,
  onRemove,
}: SchemaBuilderProps) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="microlabel">
          <span className="text-primary">01</span> / Extraction schema
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground">
          {columns.filter((column) => column.name.trim()).length} FIELDS
        </span>
      </div>

      <div className="flex flex-col divide-y border bg-card/50">
        {columns.map((column) => (
          <div key={column.id} className="group flex flex-col gap-1.5 p-2.5">
            <div className="flex items-center gap-1.5">
              <Input
                value={column.name}
                disabled={disabled}
                placeholder="Field name"
                onChange={(event) =>
                  onUpdate(column.id, { name: event.target.value })
                }
                className="h-7 rounded-none border-0 border-b border-transparent bg-transparent px-1 font-mono text-xs font-medium shadow-none focus-visible:border-primary focus-visible:ring-0 dark:bg-transparent"
              />
              <Select
                value={column.type}
                disabled={disabled}
                onValueChange={(value) =>
                  onUpdate(column.id, { type: value as ColumnType })
                }
              >
                <SelectTrigger
                  size="sm"
                  className="h-6 w-[4.5rem] flex-none rounded-sm border-border/80 bg-secondary/60 px-2 font-mono text-[10px] tracking-wider shadow-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-[5rem] rounded-sm">
                  {COLUMN_TYPES.map((type) => (
                    <SelectItem
                      key={type.value}
                      value={type.value}
                      className="rounded-sm font-mono text-[10px] tracking-wider"
                    >
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                disabled={disabled}
                onClick={() => onRemove(column.id)}
                className="size-6 flex-none rounded-sm text-muted-foreground opacity-0 transition-opacity hover:text-critical group-hover:opacity-100"
                aria-label={`Remove ${column.name || "column"}`}
              >
                <X className="size-3" />
              </Button>
            </div>
            <Input
              value={column.description}
              disabled={disabled}
              placeholder="What should be extracted, in plain language…"
              onChange={(event) =>
                onUpdate(column.id, { description: event.target.value })
              }
              className="h-6 rounded-none border-0 bg-transparent px-1 text-[11px] text-muted-foreground shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={onAdd}
        className="h-7 justify-start gap-2 rounded-sm border-dashed bg-transparent font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-primary"
      >
        <Plus className="size-3" /> Add field
      </Button>
    </section>
  );
}
