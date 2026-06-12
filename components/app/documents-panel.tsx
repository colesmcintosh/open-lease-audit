"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, FlaskConical, Loader2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DocStatus, ExtractionState, LeaseDoc } from "@/lib/types";

const STATUS_TONE: Record<DocStatus, string> = {
  idle: "text-muted-foreground/60",
  queued: "text-muted-foreground",
  extracting: "text-primary",
  extracted: "text-ok",
  error: "text-critical",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SAMPLE_FILES = [
  "meridian-acme-hq-suite-400.txt",
  "meridian-acme-warehouse-7.txt",
  "meridian-acme-flex-annex.txt",
];

interface DocumentsPanelProps {
  docs: LeaseDoc[];
  extractions: Record<string, ExtractionState>;
  disabled: boolean;
  onAddFiles: (files: Iterable<File>) => Promise<void>;
  onAddDocs: (docs: LeaseDoc[]) => void;
  onRemove: (id: string) => void;
}

export function DocumentsPanel({
  docs,
  extractions,
  disabled,
  onAddFiles,
  onAddDocs,
  onRemove,
}: DocumentsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingSamples, setIsLoadingSamples] = useState(false);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      void onAddFiles(event.dataTransfer.files);
    },
    [disabled, onAddFiles]
  );

  const loadSamples = useCallback(async () => {
    setIsLoadingSamples(true);
    try {
      const loaded = await Promise.all(
        SAMPLE_FILES.map(async (name, index) => {
          const response = await fetch(`/samples/${name}`);
          const text = await response.text();
          return {
            id: `sample-${index}-${name}`,
            name,
            size: new Blob([text]).size,
            kind: "text" as const,
            data: text,
          };
        })
      );
      onAddDocs(loaded.filter((doc) => !docs.some((d) => d.name === doc.name)));
    } finally {
      setIsLoadingSamples(false);
    }
  }, [docs, onAddDocs]);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="microlabel">
          <span className="text-primary">02</span> / Lease documents
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground">
          {docs.length} DOCS
        </span>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "bracket-frame flex flex-col items-center justify-center gap-2 border border-dashed bg-card/30 px-4 py-6 transition-colors",
          isDragging
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/50 hover:bg-card/60",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <UploadCloud className="size-4 text-primary" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Drop lease files — PDF / TXT / MD
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) {
              void onAddFiles(event.target.files);
              event.target.value = "";
            }
          }}
        />
      </button>

      <Button
        variant="ghost"
        size="sm"
        disabled={disabled || isLoadingSamples}
        onClick={() => void loadSamples()}
        className="h-6 justify-start gap-2 rounded-sm px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-primary"
      >
        {isLoadingSamples ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <FlaskConical className="size-3" />
        )}
        Load sample portfolio
      </Button>

      {docs.length > 0 && (
        <ul className="flex flex-col divide-y border bg-card/50">
          {docs.map((doc) => {
            const state = extractions[doc.id];
            const status: DocStatus = state?.status ?? "idle";
            return (
              <li key={doc.id} className="group flex items-center gap-2 px-2.5 py-2">
                <span className={cn("status-dot", STATUS_TONE[status], status === "extracting" && "animate-status-pulse")} />
                <FileText className="size-3.5 flex-none text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={doc.name}>
                  {doc.name}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  {formatBytes(doc.size)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  onClick={() => onRemove(doc.id)}
                  className="size-5 flex-none rounded-sm text-muted-foreground opacity-0 transition-opacity hover:text-critical group-hover:opacity-100"
                  aria-label={`Remove ${doc.name}`}
                >
                  <X className="size-3" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
