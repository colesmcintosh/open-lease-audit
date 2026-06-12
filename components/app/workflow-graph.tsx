"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Edge as FlowEdge,
  EdgeProps as FlowEdgeProps,
  Node as FlowNode,
  NodeProps as FlowNodeProps,
  ReactFlowInstance,
} from "@xyflow/react";
import { BaseEdge, getBezierPath, useEdgesState, useNodesState } from "@xyflow/react";
import { Canvas } from "@/components/ai-elements/canvas";
import { Controls } from "@/components/ai-elements/controls";
import {
  Node,
  NodeContent,
  NodeDescription,
  NodeHeader,
  NodeTitle,
} from "@/components/ai-elements/node";
import { Panel } from "@/components/ai-elements/panel";
import { columnKey } from "@/lib/audit-schema";
import { cn } from "@/lib/utils";
import type {
  AuditState,
  ColumnDef,
  ExtractionState,
  LeaseDoc,
} from "@/lib/types";

type StageTone = "idle" | "active" | "done" | "error";

const TONE_CLASS: Record<StageTone, string> = {
  idle: "text-muted-foreground/60",
  active: "text-primary animate-status-pulse",
  done: "text-ok",
  error: "text-critical",
};

interface StageNodeData {
  label: string;
  title: string;
  description: string;
  tone: StageTone;
  metric?: string;
  isHead?: boolean;
  isTail?: boolean;
  [key: string]: unknown;
}

function StageNode({ data }: FlowNodeProps) {
  const node = data as StageNodeData;
  return (
    <Node
      handles={{ target: !node.isHead, source: !node.isTail }}
      className={cn(
        "w-52 rounded-sm border-border/80 bg-card/95 transition-colors duration-300",
        node.tone === "active" && "border-primary/60",
        node.tone === "error" && "border-critical/60"
      )}
    >
      <NodeHeader className="flex-row items-center justify-between gap-2 rounded-t-sm bg-secondary/60 px-3 py-2!">
        <span className="microlabel text-[9px]">{node.label}</span>
        <span className={cn("status-dot", TONE_CLASS[node.tone])} />
      </NodeHeader>
      <NodeContent className="flex flex-col gap-1 px-3 py-2.5">
        <NodeTitle className="font-mono text-xs font-semibold tracking-wide">
          {node.title}
        </NodeTitle>
        <NodeDescription className="text-[10px] leading-relaxed">
          {node.description}
        </NodeDescription>
        {node.metric && (
          <span className="mt-1 font-mono text-[10px] tabular-nums text-primary">
            {node.metric}
          </span>
        )}
      </NodeContent>
    </Node>
  );
}

interface DocNodeData {
  name: string;
  tone: StageTone;
  filled: number;
  total: number;
  [key: string]: unknown;
}

function DocNode({ data }: FlowNodeProps) {
  const node = data as DocNodeData;
  const ratio = node.total ? node.filled / node.total : 0;
  return (
    <Node
      handles={{ target: true, source: true }}
      className={cn(
        "w-52 rounded-sm border-border/80 bg-card/95 transition-colors duration-300",
        node.tone === "active" && "border-primary/60",
        node.tone === "error" && "border-critical/60"
      )}
    >
      <NodeContent className="flex flex-col gap-1.5 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={cn("status-dot", TONE_CLASS[node.tone])} />
          <span className="min-w-0 flex-1 truncate font-mono text-[10px]" title={node.name}>
            {node.name}
          </span>
          <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
            {node.filled}/{node.total}
          </span>
        </div>
        <div className="h-0.5 w-full overflow-hidden bg-border">
          <div
            className={cn(
              "h-full transition-[width] duration-500 ease-out",
              node.tone === "error" ? "bg-critical" : "bg-primary",
              node.tone === "active" && "stream-shimmer"
            )}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      </NodeContent>
    </Node>
  );
}

type EdgeState = "idle" | "active" | "done";

interface PipelineEdgeData {
  state: EdgeState;
  /** Which state transition fires the one-time handoff pulse. */
  pulseOn?: EdgeState;
  [key: string]: unknown;
}

const PULSE_DURATION_MS = 1200;

/**
 * One stable edge component for every state, so transitions restyle the path
 * in place instead of remounting (which made animations restart and "jump").
 * Entering the pulse state fires a single dot traversal — a one-time handoff
 * pulse that fades out on arrival — rather than a looping animation.
 */
function PipelineEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: FlowEdgeProps) {
  const edgeData = data as PipelineEdgeData | undefined;
  const state = (edgeData?.state ?? "idle") as EdgeState;
  const pulseOn = (edgeData?.pulseOn ?? "active") as EdgeState;
  const [isPulsing, setIsPulsing] = useState(false);
  const prevStateRef = useRef<EdgeState>("idle");

  useEffect(() => {
    const entered = state === pulseOn && prevStateRef.current !== pulseOn;
    prevStateRef.current = state;
    if (!entered) return;
    setIsPulsing(true);
    const timeout = setTimeout(() => setIsPulsing(false), PULSE_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [state, pulseOn]);

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: state === "idle" ? "oklch(1 0 0 / 18%)" : "var(--primary)",
          strokeDasharray: state === "idle" ? "5, 5" : undefined,
          opacity: state === "done" ? 0.55 : 1,
          transition: "stroke 300ms, opacity 300ms",
        }}
      />
      {isPulsing && (
        <circle fill="var(--primary)" r="4">
          <animateMotion
            dur={`${PULSE_DURATION_MS / 1000}s`}
            path={edgePath}
            repeatCount="1"
            fill="freeze"
          />
          {/* Fade out as the dot arrives so it never sits frozen at the target. */}
          <animate
            attributeName="opacity"
            values="1;1;0"
            keyTimes="0;0.75;1"
            dur={`${PULSE_DURATION_MS / 1000}s`}
            repeatCount="1"
            fill="freeze"
          />
        </circle>
      )}
    </>
  );
}

const nodeTypes = { stage: StageNode, doc: DocNode };
const edgeTypes = { pipeline: PipelineEdge };

const DOC_SPACING = 72;
const COL_X = [0, 300, 600, 900];

interface GraphInputs {
  docs: LeaseDoc[];
  activeColumns: ColumnDef[];
  extractions: Record<string, ExtractionState>;
  audit: AuditState;
}

/** Full graph snapshot: layout from doc list, data/edge state from progress. */
function computeGraph({ docs, activeColumns, extractions, audit }: GraphInputs) {
  const keys = activeColumns.map((column) => columnKey(column.name));
  const docCount = Math.max(docs.length, 1);
  const centerY = ((docCount - 1) * DOC_SPACING) / 2;

  const docTone = (state: ExtractionState | undefined): StageTone =>
    state?.status === "extracting"
      ? "active"
      : state?.status === "extracted"
        ? "done"
        : state?.status === "error"
          ? "error"
          : "idle";

  const nodes: FlowNode[] = [
    {
      id: "schema",
      type: "stage",
      position: { x: COL_X[0], y: centerY - 40 },
      data: {
        label: "STAGE 01",
        title: "SCHEMA",
        description: "User-defined extraction columns",
        tone: activeColumns.length ? "done" : "idle",
        metric: `${activeColumns.length} FIELDS DEFINED`,
        isHead: true,
      } satisfies StageNodeData,
    },
    ...(docs.length
      ? []
      : [
          {
            id: "intake-placeholder",
            type: "stage",
            position: { x: COL_X[1], y: centerY - 40 },
            data: {
              label: "STAGE 02",
              title: "DOCUMENT INTAKE",
              description: "Awaiting lease uploads",
              tone: "idle",
            } satisfies StageNodeData,
          } as FlowNode,
        ]),
    ...docs.map((doc, index) => {
      const state = extractions[doc.id];
      const filled = keys.filter(
        (key) => state?.record[key]?.value !== undefined
      ).length;
      return {
        id: doc.id,
        type: "doc",
        position: { x: COL_X[1], y: index * DOC_SPACING },
        data: {
          name: doc.name,
          tone: docTone(state),
          filled,
          total: keys.length,
        } satisfies DocNodeData,
      };
    }),
    {
      id: "audit",
      type: "stage",
      position: { x: COL_X[2], y: centerY - 40 },
      data: {
        label: "STAGE 03",
        title: "CROSS-LEASE AUDIT",
        description: "Reconciles extracted fields across the portfolio",
        tone:
          audit.status === "running"
            ? "active"
            : audit.status === "complete"
              ? "done"
              : audit.status === "error"
                ? "error"
                : "idle",
        metric:
          audit.status === "idle" ? undefined : `${audit.findings.length} FINDINGS`,
      } satisfies StageNodeData,
    },
    {
      id: "report",
      type: "stage",
      position: { x: COL_X[3], y: centerY - 40 },
      data: {
        label: "STAGE 04",
        title: "INTEGRITY REPORT",
        description: "Severity-ranked mismatch findings",
        tone:
          audit.status === "complete"
            ? audit.findings.some((f) => f.severity === "critical")
              ? "error"
              : "done"
            : audit.status === "running"
              ? "active"
              : "idle",
        metric: audit.risk ? `RISK: ${audit.risk.toUpperCase()}` : undefined,
        isTail: true,
      } satisfies StageNodeData,
    },
  ];

  const edges: FlowEdge[] = [
    ...(docs.length
      ? []
      : [
          {
            id: "schema-intake",
            source: "schema",
            target: "intake-placeholder",
            type: "pipeline",
            data: { state: "idle" } satisfies PipelineEdgeData,
          },
          {
            id: "intake-audit",
            source: "intake-placeholder",
            target: "audit",
            type: "pipeline",
            data: { state: "idle" } satisfies PipelineEdgeData,
          },
        ]),
    ...docs.flatMap((doc) => {
      const tone = docTone(extractions[doc.id]);
      // Inbound animates only while this document is extracting; outbound
      // activates only once extraction completes and its data is handed to
      // the audit stage, settling when the audit finishes.
      const inbound: EdgeState =
        tone === "active" ? "active" : tone === "done" || tone === "error" ? "done" : "idle";
      const outbound: EdgeState =
        tone === "done"
          ? audit.status === "complete" || audit.status === "error"
            ? "done"
            : "active"
          : "idle";
      return [
        {
          id: `schema-${doc.id}`,
          source: "schema",
          target: doc.id,
          type: "pipeline",
          data: { state: inbound } satisfies PipelineEdgeData,
        },
        {
          id: `${doc.id}-audit`,
          source: doc.id,
          target: "audit",
          type: "pipeline",
          data: { state: outbound } satisfies PipelineEdgeData,
        },
      ];
    }),
    {
      id: "audit-report",
      source: "audit",
      target: "report",
      type: "pipeline",
      data: {
        state:
          audit.status === "running"
            ? "active"
            : audit.status === "complete"
              ? "done"
              : "idle",
        // The report receives the result when the audit finishes, so the
        // handoff pulse fires on completion rather than when streaming starts.
        pulseOn: "done",
      } satisfies PipelineEdgeData,
    },
  ];

  return { nodes, edges };
}

interface WorkflowGraphProps {
  docs: LeaseDoc[];
  columns: ColumnDef[];
  extractions: Record<string, ExtractionState>;
  audit: AuditState;
}

export function WorkflowGraph({
  docs,
  columns,
  extractions,
  audit,
}: WorkflowGraphProps) {
  const instanceRef = useRef<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);

  const activeColumns = useMemo(
    () => columns.filter((column) => column.name.trim()),
    [columns]
  );

  const graph = useMemo(
    () => computeGraph({ docs, activeColumns, extractions, audit }),
    [docs, activeColumns, extractions, audit]
  );

  const structureKey = docs.map((doc) => doc.id).join("|");
  const prevStructureRef = useRef<string | null>(null);

  useEffect(() => {
    const structureChanged = prevStructureRef.current !== structureKey;
    prevStructureRef.current = structureKey;

    if (structureChanged) {
      // Layout pass: documents were added or removed. Rebuild positions
      // and refit the viewport.
      setNodes(graph.nodes);
      setEdges(graph.edges);
      const id = requestAnimationFrame(() => {
        void instanceRef.current?.fitView({ duration: 350, padding: 0.18 });
      });
      return () => cancelAnimationFrame(id);
    }

    // Data pass: streaming progress only mutates node data and edge state,
    // never positions — nodes stay put (and stay draggable) mid-run.
    const freshNodes = new Map(graph.nodes.map((node) => [node.id, node]));
    setNodes((prev) =>
      prev.map((node) => {
        const fresh = freshNodes.get(node.id);
        return fresh ? { ...node, data: fresh.data } : node;
      })
    );
    const freshEdges = new Map(graph.edges.map((edge) => [edge.id, edge]));
    setEdges((prev) =>
      prev.map((edge) => {
        const fresh = freshEdges.get(edge.id);
        return fresh ? { ...edge, data: fresh.data } : edge;
      })
    );
  }, [graph, structureKey, setNodes, setEdges]);

  return (
    <Canvas
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onInit={(instance) => {
        instanceRef.current = instance;
      }}
      nodesConnectable={false}
      nodesDraggable
      proOptions={{ hideAttribution: true }}
      minZoom={0.4}
      maxZoom={1.5}
    >
      <Panel position="top-left" className="m-3 border-border/80 bg-card/90 px-2.5 py-1.5">
        <span className="microlabel text-[9px]">Audit pipeline</span>
      </Panel>
      <Controls showInteractive={false} />
    </Canvas>
  );
}
