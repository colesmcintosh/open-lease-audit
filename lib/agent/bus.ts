import type { AuditEvent } from "@/lib/audit-events";

/**
 * Single-consumer async queue. Both the SDK message loop and the MCP tool
 * handlers push into it, so tool output interleaves with agent lifecycle in
 * the order it actually happened.
 */
export class EventBus {
  private queue: AuditEvent[] = [];
  private wake: (() => void) | null = null;
  private closed = false;

  push(event: AuditEvent) {
    if (this.closed) return;
    this.queue.push(event);
    this.wake?.();
    this.wake = null;
  }

  close() {
    this.closed = true;
    this.wake?.();
    this.wake = null;
  }

  async *stream(): AsyncGenerator<AuditEvent> {
    while (true) {
      while (this.queue.length) {
        yield this.queue.shift()!;
      }
      if (this.closed) return;
      // Safe against a lost wakeup: nothing awaits between the drain above and
      // this assignment, so a push cannot slip in unobserved.
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }
}
