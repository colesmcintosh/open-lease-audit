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
import { cn } from "@/lib/utils";
import type { AgentRun, AgentStatus, AuditState, LeaseDoc } from "@/lib/types";

/** Mirrors lib/agent/subagents.ts — the roster is fixed, so the console can
 *  render the whole constellation before a single agent has started. */
const DETECTORS = [
  { type: "rent-and-charges-auditor", title: "RENT & CHARGES", beat: "Rent, escalations, deposits, pass-throughs" },
  { type: "liability-and-covenant-auditor", title: "LIABILITY & COVENANTS", beat: "Indemnity, insurance, assignment, default" },
  { type: "critical-date-auditor", title: "CRITICAL DATES", beat: "Terms, options, notice windows, auto-renewal" },
  { type: "portfolio-reconciler", title: "RECONCILIATION", beat: "Contradictions across documents" },
] as const;

const GATE = "materiality-gate";

const TONE_CLASS: Record<AgentStatus, string> = {
  pending: "text-muted-foreground/50",
  running: "text-primary animate-status-pulse",
  done: "text-ok",
  error: "text-critical",
};

interface AgentNodeData {
  label: string;
  title: string;
  description: string;
  status: AgentStatus;
  metric?: string;
  isHead?: boolean;
  isTail?: boolean;
  [key: string]: unknown;
}

function AgentNode({ data }: FlowNodeProps) {
  const node = data as AgentNodeData;
  return (
    <Node
      handles={{ target: !node.isHead, source: !node.isTail }}
      className={cn(
        "w-56 rounded-sm border-border/80 bg-card/95 transition-colors duration-300",
        node.status === "running" && "border-primary/60",
        node.status === "error" && "border-critical/60"
      )}
    >
      <NodeHeader className="flex-row items-center justify-between gap-2 rounded-t-sm bg-secondary/60 px-3 py-2!">
        <span className="microlabel text-[9px]">{node.label}</span>
        <span className={cn("status-dot", TONE_CLASS[node.status])} />
      </NodeHeader>
      <NodeContent className="flex flex-col gap-1 px-3 py-2.5">
        <NodeTitle className="font-mono text-xs font-semibold tracking-wide">
          {node.title}
        </NodeTitle>
        <NodeDescription className="truncate text-[10px] leading-relaxed" title={node.description}>
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
  size: string;
  /** Reflects the detector stage, since no agent owns a single lease. */
  isBeingRead: boolean;
  [key: string]: unknown;
}

function DocNode({ data }: FlowNodeProps) {
  const node = data as DocNodeData;
  return (
    <Node
      handles={{ target: true, source: true }}
      className={cn(
        "w-56 rounded-sm border-border/80 bg-card/95 transition-colors duration-300",
        node.isBeingRead && "border-primary/60"
      )}
    >
      <NodeContent className="flex items-center gap-2 px-3 py-2">
        <span
          className={cn(
            "status-dot",
            node.isBeingRead
              ? "text-primary animate-status-pulse"
              : "text-muted-foreground/50"
          )}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[10px]" title={node.name}>
          {node.name}
        </span>
        <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
          {node.size}
        </span>
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

const nodeTypes = { agent: AgentNode, doc: DocNode };
const edgeTypes = { pipeline: PipelineEdge };

const ROW_SPACING = 84;
const COL_X = [0, 300, 620, 940, 1240];

interface GraphInputs {
  docs: LeaseDoc[];
  agents: AgentRun[];
  audit: AuditState;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function edgeState(status: AgentStatus): EdgeState {
  if (status === "running") return "active";
  return status === "pending" ? "idle" : "done";
}

/**
 * Full graph snapshot. Layout comes from the document list and the fixed agent
 * roster; every tone, metric, and edge state comes from live run state, so a
 * data update never moves a node the user has dragged.
 */
function computeGraph({ docs, agents, audit }: GraphInputs) {
  const byType = new Map<string, AgentRun>();
  for (const agent of agents) byType.set(agent.type, agent);

  const lead = agents.find((agent) => agent.id === "lead");
  const gate = byType.get(GATE);
  const detectorsRunning = DETECTORS.some(
    (detector) => byType.get(detector.type)?.status === "running"
  );
  const rows = Math.max(docs.length, DETECTORS.length, 1);
  const centerY = ((rows - 1) * ROW_SPACING) / 2;

  const nodes: FlowNode[] = [
    {
      id: "lead",
      type: "agent",
      position: { x: COL_X[0], y: centerY - 40 },
      data: {
        label: "ORCHESTRATOR",
        title: "LEAD AUDITOR",
        description: lead?.activity || "Awaiting a portfolio",
        status: lead?.status ?? "pending",
        metric: `${docs.length} ${docs.length === 1 ? "LEASE" : "LEASES"}`,
        isHead: true,
      } satisfies AgentNodeData,
    },
    ...(docs.length
      ? docs.map(
          (doc, index) =>
            ({
              id: `doc-${doc.id}`,
              type: "doc",
              position: { x: COL_X[1], y: index * ROW_SPACING },
              data: {
                name: doc.name,
                size: formatBytes(doc.size),
                isBeingRead: detectorsRunning,
              } satisfies DocNodeData,
            }) as FlowNode
        )
      : [
          {
            id: "intake",
            type: "agent",
            position: { x: COL_X[1], y: centerY - 40 },
            data: {
              label: "INTAKE",
              title: "PORTFOLIO",
              description: "Upload the leases every detector will read",
              status: "pending",
            } satisfies AgentNodeData,
          } as FlowNode,
        ]),
    ...DETECTORS.map((detector, index) => {
      const agent = byType.get(detector.type);
      const filed = audit.candidates.filter(
        (candidate) => candidate.raisedBy === detector.type
      ).length;
      return {
        id: detector.type,
        type: "agent",
        position: { x: COL_X[2], y: index * ROW_SPACING },
        data: {
          label: "DETECTOR",
          title: detector.title,
          description: agent?.activity || detector.beat,
          status: agent?.status ?? "pending",
          metric: filed ? `${filed} CANDIDATE${filed === 1 ? "" : "S"}` : undefined,
        } satisfies AgentNodeData,
      } as FlowNode;
    }),
    {
      id: GATE,
      type: "agent",
      position: { x: COL_X[3], y: centerY - 40 },
      data: {
        label: "GATE",
        title: "MATERIALITY GATE",
        description:
          gate?.activity || "Refutes every candidate; publishes only major exposure",
        status: gate?.status ?? "pending",
        metric: audit.dismissals.length
          ? `${audit.dismissals.length} SUPPRESSED`
          : undefined,
      } satisfies AgentNodeData,
    },
    {
      id: "report",
      type: "agent",
      position: { x: COL_X[4], y: centerY - 40 },
      data: {
        label: "OUTPUT",
        title: "EXPOSURE REPORT",
        description: "Confirmed monetary and litigation exposure",
        status:
          audit.status === "complete"
            ? audit.findings.some((finding) => finding.severity === "critical")
              ? "error"
              : "done"
            : audit.status === "running"
              ? "running"
              : "pending",
        metric: audit.risk ? `RISK: ${audit.risk.toUpperCase()}` : undefined,
        isTail: true,
      } satisfies AgentNodeData,
    },
  ];

  const edges: FlowEdge[] = [
    ...(docs.length
      ? docs.flatMap((doc) => [
          {
            id: `lead-${doc.id}`,
            source: "lead",
            target: `doc-${doc.id}`,
            type: "pipeline",
            data: { state: edgeState(lead?.status ?? "pending") } satisfies PipelineEdgeData,
          },
          ...DETECTORS.map((detector) => ({
            id: `${doc.id}-${detector.type}`,
            source: `doc-${doc.id}`,
            target: detector.type,
            type: "pipeline",
            data: {
              state: edgeState(byType.get(detector.type)?.status ?? "pending"),
            } satisfies PipelineEdgeData,
          })),
        ])
      : [
          {
            id: "lead-intake",
            source: "lead",
            target: "intake",
            type: "pipeline",
            data: { state: "idle" } satisfies PipelineEdgeData,
          },
          ...DETECTORS.map((detector) => ({
            id: `intake-${detector.type}`,
            source: "intake",
            target: detector.type,
            type: "pipeline",
            data: { state: "idle" } satisfies PipelineEdgeData,
          })),
        ]),
    ...DETECTORS.map((detector) => ({
      id: `${detector.type}-gate`,
      source: detector.type,
      target: GATE,
      type: "pipeline",
      data: {
        state: edgeState(byType.get(detector.type)?.status ?? "pending"),
      } satisfies PipelineEdgeData,
    })),
    {
      id: "gate-report",
      source: GATE,
      target: "report",
      type: "pipeline",
      data: {
        state: edgeState(gate?.status ?? "pending"),
        // The report is written when the gate finishes ruling, so the handoff
        // pulse fires on completion rather than when the gate starts.
        pulseOn: "done",
      } satisfies PipelineEdgeData,
    },
  ];

  return { nodes, edges };
}

interface WorkflowGraphProps {
  docs: LeaseDoc[];
  agents: AgentRun[];
  audit: AuditState;
}

export function WorkflowGraph({ docs, agents, audit }: WorkflowGraphProps) {
  const instanceRef = useRef<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);

  const graph = useMemo(
    () => computeGraph({ docs, agents, audit }),
    [docs, agents, audit]
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
        void instanceRef.current?.fitView({ duration: 350, padding: 0.16 });
      });
      return () => cancelAnimationFrame(id);
    }

    // Data pass: run progress only mutates node data and edge state, never
    // positions — nodes stay put (and stay draggable) mid-run.
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
      minZoom={0.3}
      maxZoom={1.5}
    >
      <Panel position="top-left" className="m-3 border-border/80 bg-card/90 px-2.5 py-1.5">
        <span className="microlabel text-[9px]">Agent constellation</span>
      </Panel>
      <Controls showInteractive={false} />
    </Canvas>
  );
}
