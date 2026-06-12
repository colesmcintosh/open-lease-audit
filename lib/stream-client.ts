import { parsePartialJson } from "ai";

interface StreamPartialObjectOptions<T> {
  url: string;
  body: unknown;
  onPartial: (partial: T) => void;
  signal?: AbortSignal;
}

/**
 * POSTs to a streamObject route and emits every partial parse of the
 * accumulating JSON, so the UI renders fields the moment they arrive.
 */
export async function streamPartialObject<T>({
  url,
  body,
  onPartial,
  signal,
}: StreamPartialObjectOptions<T>): Promise<T> {
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
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += value;
    const { value: partial } = await parsePartialJson(accumulated);
    if (partial !== undefined && partial !== null) {
      onPartial(partial as T);
    }
  }

  const { value: final, state } = await parsePartialJson(accumulated);
  if (final === undefined || final === null || state === "failed-parse") {
    throw new Error("Stream ended without a parseable result.");
  }
  return final as T;
}
