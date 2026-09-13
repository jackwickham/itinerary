import { pendingInboundEmailIds } from '../inbound-emails.js';
import { processInboundEmail } from './pipeline.js';

/**
 * Processes imports one at a time, in arrival order. Serial processing matters:
 * outbound and return bookings forwarded back to back must see each other's trip,
 * or they'd each create their own.
 */

let tail: Promise<void> = Promise.resolve();
const queued = new Set<number>();

export function enqueueImport(id: number): void {
  if (queued.has(id)) return;
  queued.add(id);
  tail = tail
    .then(() => processInboundEmail(id))
    .catch((err) => console.error(`Import ${id} crashed:`, err))
    .finally(() => queued.delete(id));
}

/** Re-queues emails left unfinished by a restart. Call once at startup. */
export function resumePendingImports(): void {
  const pending = pendingInboundEmailIds();
  if (pending.length) console.log(`Resuming ${pending.length} unfinished import(s)`);
  pending.forEach(enqueueImport);
}

/** Resolves once everything queued so far has been processed. */
export function drainImports(): Promise<void> {
  return tail;
}
