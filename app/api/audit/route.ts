import { runAudit } from "@/lib/agent/run";
import { encodeEvent } from "@/lib/audit-events";
import { describeRunError } from "@/lib/credentials";
import type { ConnectorConfig } from "@/lib/connectors";
import type { LeaseDoc } from "@/lib/types";

// The SDK drives a Claude Code subprocess, so this route needs the Node
// runtime and a long ceiling: a portfolio audit is minutes of agent work.
export const runtime = "nodejs";
export const maxDuration = 800;

interface AuditRequest {
  docs: LeaseDoc[];
  connectors?: ConnectorConfig[];
  budgetUsd?: number;
}

export async function POST(req: Request) {
  const { docs, connectors, budgetUsd } = (await req.json()) as AuditRequest;
  if (!docs?.length) {
    return new Response("No documents to audit.", { status: 400 });
  }

  const encoder = new TextEncoder();
  const events = runAudit({
    docs,
    connectors: connectors ?? [],
    budgetUsd,
    signal: req.signal,
  });

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(encodeEvent(value)));
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encodeEvent({ type: "error", message: describeRunError(error) })
          )
        );
        controller.close();
      }
    },
    // Client navigated away or hit stop: unwind the generator so the run is
    // aborted and its workspace removed.
    cancel: () => void events.return(undefined),
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
