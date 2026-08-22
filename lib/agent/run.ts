import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import type { AuditEvent } from "@/lib/audit-events";
import { connectorName, type ConnectorConfig } from "@/lib/connectors";
import { describeRunError } from "@/lib/credentials";
import type { ColumnDef, LeaseDoc } from "@/lib/types";
import { EventBus } from "./bus";
import { MATERIALITY_BAR } from "./doctrine";
import { ABSTRACTOR, DETECTORS, GATE, buildAgents } from "./subagents";
import { AUDIT_TOOLS, createAuditTools } from "./tools";
import { createWorkspace, type Workspace } from "./workspace";

const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_MAX_BUDGET_USD = 8;

/** Read-only file tools plus subagent dispatch. Nothing here can mutate. */
const LEAD_TOOLS = ["Read", "Grep", "Glob", "Agent", "Task", AUDIT_TOOLS.publishSummary];

const BLOCKED_TOOLS = [
  "Bash",
  "BashOutput",
  "KillShell",
  "Write",
  "Edit",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
];

const SYSTEM_PROMPT = `You are the lead auditor on a commercial lease portfolio review. You work for
the portfolio owner. Your output is read by someone who will act on it — send a
notice, amend a document, claw back a charge — so everything you surface has to
be worth acting on.

You do not audit documents yourself. You dispatch specialists, then you hold
them to the bar. Everything the owner sees is published by your subagents
through their tools; prose you write is never shown.

${MATERIALITY_BAR}

The workspace is read-only to you and to every agent you dispatch. You cannot
run commands, edit files, or reach the network. Work only from the documents in
\`leases/\` and whatever connected systems of record are made available.`;

function leadPrompt(workspace: Workspace, connectors: string[]) {
  const roster = workspace.leases
    .map((lease) => `- \`${lease.relPath}\``)
    .join("\n");

  return `Audit this lease portfolio.

## Documents

${roster}

## Pipeline

Run these stages in order. Each stage needs the previous stage's results, so
wait for every subagent in a stage to report before starting the next.

**Stage 1 — abstract.** Read \`SCHEMA.md\`. Dispatch one \`${ABSTRACTOR}\` per
lease, all in a single message so they run concurrently. Give each one the exact
file path of its lease and nothing else to do. Wait for all of them.

**Stage 2 — detect.** Dispatch all four detectors in a single message so they
run concurrently:
${DETECTORS.map((detector) => `- \`${detector.name}\` — ${detector.label.toLowerCase()}`).join("\n")}

Tell each to read \`SCHEMA.md\`, every lease in \`leases/\`, and \`abstracts/\`.
Wait for all of them.

**Stage 3 — gate.** Dispatch \`${GATE}\` once. It reads \`candidates/\`, verifies
each one against the source documents, and publishes only what survives.

**Stage 4 — close.** Call \`${AUDIT_TOOLS.publishSummary}\` exactly once with
the portfolio verdict. Read the gate's report for the counts; do not re-litigate
its decisions.
${
  connectors.length
    ? `\nConnected systems of record: ${connectors.join(", ")}. Tell the detectors to reconcile lease terms against them.`
    : ""
}

Do not read the leases yourself, do not summarize them, and do not add findings
of your own. Dispatch, wait, close.`;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function isToolUse(block: unknown): block is ToolUseBlock {
  return (
    typeof block === "object" &&
    block !== null &&
    (block as { type?: string }).type === "tool_use"
  );
}

function firstString(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** One-line trace of a tool call, for the live agent console. */
function describeToolUse(block: ToolUseBlock, root: string): string {
  const name = block.name.startsWith("mcp__")
    ? block.name.split("__").slice(2).join("__")
    : block.name;
  const detail = firstString(block.input, [
    "file_path",
    "pattern",
    "lease",
    "title",
    "query",
    "path",
    "description",
  ]);
  // Paths arrive absolute; the console only ever shows workspace-relative ones.
  const relative = detail?.startsWith(root)
    ? detail.slice(root.length).replace(/^\/+/, "")
    : detail;
  return relative ? `${name} · ${relative}` : name;
}

function truncate(text: string, max = 240): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export interface AuditRunInput {
  docs: LeaseDoc[];
  columns: ColumnDef[];
  connectors: ConnectorConfig[];
  signal?: AbortSignal;
}

/**
 * Runs the audit and yields console events as they happen. The generator owns
 * the workspace lifecycle: it is removed when the run ends, aborts, or throws.
 */
export async function* runAudit({
  docs,
  columns,
  connectors,
  signal,
}: AuditRunInput): AsyncGenerator<AuditEvent> {
  const startedAt = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const workspace = await createWorkspace({ docs, columns, today });
  const bus = new EventBus();

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  const connectorServers = Object.fromEntries(
    connectors
      .filter((connector) => connector.url.trim())
      .map((connector) => [
        connector.id,
        {
          type: "http" as const,
          url: connector.url.trim(),
          ...(connector.token?.trim()
            ? { headers: { Authorization: `Bearer ${connector.token.trim()}` } }
            : {}),
        },
      ])
  );
  const connectorIds = Object.keys(connectorServers);
  const connectorLabels = connectorIds.map(connectorName);

  const options: Options = {
    cwd: workspace.root,
    model: process.env.OPEN_LEASE_AUDIT_MODEL || DEFAULT_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    agents: buildAgents({
      abstractorModel: process.env.OPEN_LEASE_AUDIT_ABSTRACTOR_MODEL || undefined,
      connectorNames: connectorIds,
    }),
    mcpServers: {
      audit: createAuditTools({ workspace, columns, bus }),
      ...connectorServers,
    },
    allowedTools: [
      ...LEAD_TOOLS,
      ...Object.values(AUDIT_TOOLS),
      ...connectorIds.map((id) => `mcp__${id}`),
    ],
    disallowedTools: BLOCKED_TOOLS,
    // Anything that is not explicitly allowed above lands here and is refused,
    // so a prompt-injected instruction inside a lease cannot widen the sandbox.
    canUseTool: async (toolName) => ({
      behavior: "deny" as const,
      message: `${toolName} is not available to this audit.`,
    }),
    env: {
      ...process.env,
      // Subagents default to running in the background, which returns the
      // Agent tool immediately and lets a stage's tool calls land after the
      // run has ended — the gate would publish into a closed stream. The
      // pipeline is strictly staged, so dispatch must be synchronous.
      CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
      CLAUDE_AUTO_BACKGROUND_TASKS: "0",
      // Two levels deep by design; subagents never spawn their own.
      CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "1",
      CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: String(Math.max(8, docs.length + 4)),
    },
    maxBudgetUsd: Number(process.env.OPEN_LEASE_AUDIT_MAX_BUDGET_USD) || DEFAULT_MAX_BUDGET_USD,
    settingSources: [],
    permissionMode: "default",
    abortController: controller,
    includePartialMessages: false,
  };

  // Agents live in a side channel: the SDK loop pushes lifecycle events while
  // the MCP handlers push payloads, and both drain through the same bus.
  const pump = (async () => {
    const agents = new Map<string, string>();
    // Background-task completions can surface extra result messages; the run
    // ends once, so the console is told once.
    let closed = false;
    const finish = (costUsd: number | null) => {
      if (closed) return;
      closed = true;
      bus.push({ type: "done", costUsd, durationMs: Date.now() - startedAt });
    };
    try {
      bus.push({
        type: "run_started",
        leases: workspace.leases.map((lease) => ({
          id: lease.doc.id,
          relPath: lease.relPath,
        })),
      });

      for await (const message of query({
        prompt: leadPrompt(workspace, connectorLabels),
        options,
      })) {
        if (message.type === "assistant") {
          const owner = message.parent_tool_use_id;
          for (const block of message.message.content) {
            if (block.type === "text" && !owner && block.text.trim()) {
              bus.push({ type: "lead_note", text: truncate(block.text) });
              continue;
            }
            if (!isToolUse(block)) continue;

            if (block.name === "Agent" || block.name === "Task") {
              const agent = firstString(block.input, ["subagent_type"]) ?? "agent";
              const label =
                firstString(block.input, ["description"]) ?? agent;
              agents.set(block.id, agent);
              const haystack = `${label} ${firstString(block.input, ["prompt"]) ?? ""}`;
              const lease =
                agent === ABSTRACTOR
                  ? workspace.leases.find(
                      (entry) =>
                        haystack.includes(entry.relPath) ||
                        haystack.includes(entry.doc.name)
                    )
                  : undefined;
              bus.push({
                type: "agent_started",
                id: block.id,
                agent,
                label,
                ...(lease ? { leaseId: lease.doc.id } : {}),
              });
              continue;
            }

            bus.push({
              type: "agent_activity",
              id: owner ?? "lead",
              activity: describeToolUse(block, workspace.root),
            });
          }
          continue;
        }

        if (message.type === "user") {
          const content = message.message.content;
          if (typeof content === "string") continue;
          for (const block of content) {
            if (block.type !== "tool_result") continue;
            if (agents.has(block.tool_use_id)) {
              agents.delete(block.tool_use_id);
              bus.push({
                type: "agent_finished",
                id: block.tool_use_id,
                status: block.is_error ? "error" : "done",
              });
              continue;
            }
            // A refused or failed tool call is silent otherwise, and a stage
            // that cannot report is indistinguishable from a clean portfolio.
            if (block.is_error) {
              bus.push({
                type: "agent_activity",
                id: message.parent_tool_use_id ?? "lead",
                activity: `failed · ${truncate(
                  typeof block.content === "string"
                    ? block.content
                    : JSON.stringify(block.content),
                  90
                )}`,
              });
            }
          }
          continue;
        }

        if (message.type === "result") {
          if (message.subtype !== "success") {
            bus.push({
              type: "error",
              message:
                message.subtype === "error_max_budget_usd"
                  ? "The audit stopped at its spend limit. Raise OPEN_LEASE_AUDIT_MAX_BUDGET_USD or audit fewer leases at once."
                  : `The audit ended early (${message.subtype}).`,
            });
          }
          finish(message.total_cost_usd ?? null);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        bus.push({ type: "error", message: describeRunError(error) });
        finish(null);
      }
    } finally {
      bus.close();
    }
  })();

  try {
    yield* bus.stream();
    await pump;
  } finally {
    signal?.removeEventListener("abort", abort);
    controller.abort();
    await workspace.dispose().catch(() => {});
  }
}
