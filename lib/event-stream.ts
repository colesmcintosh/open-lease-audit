import type { AuditEvent } from "./audit-events";

/**
 * POSTs to the audit route and emits each NDJSON event as it arrives. Partial
 * lines are buffered, so an event split across two network chunks still parses.
 */
export async function consumeAuditStream({
  url,
  body,
  signal,
  onEvent,
}: {
  url: string;
  body: unknown;
  signal?: AbortSignal;
  onEvent: (event: AuditEvent) => void;
}): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  const flush = (chunk: string) => {
    const line = chunk.trim();
    if (!line) return;
    try {
      onEvent(JSON.parse(line) as AuditEvent);
    } catch {
      // A malformed line is not worth killing a running audit over.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      flush(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  flush(buffer);
}
