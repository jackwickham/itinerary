import { getDb, nowIso } from '../db/index.js';
import { NotFoundError } from '../errors.js';
import type { ImportDetail, ImportResult, ImportStatus, ImportSummary } from '../../shared/schemas.js';
import { listEntriesForEmail } from './entries.js';

/** Storage for received booking emails and the outcome of processing each one. */

interface SummaryRow {
  id: number;
  received_at: string;
  envelope_from: string | null;
  from_header: string | null;
  subject: string | null;
  status: ImportStatus;
  error: string | null;
  result: string | null;
  processed_at: string | null;
}

const SUMMARY_COLUMNS =
  'id, received_at, envelope_from, from_header, subject, status, error, result, processed_at';

function toSummary(row: SummaryRow): ImportSummary {
  return { ...row, result: row.result ? (JSON.parse(row.result) as ImportResult) : null };
}

export function storeInboundEmail(input: {
  raw: Buffer;
  envelopeFrom: string | null;
  fromHeader: string | null;
  subject: string | null;
  messageId: string | null;
}): number {
  const result = getDb()
    .prepare(
      `INSERT INTO inbound_emails (raw, envelope_from, from_header, subject, message_id)
       VALUES (@raw, @envelopeFrom, @fromHeader, @subject, @messageId)`,
    )
    .run(input);
  return Number(result.lastInsertRowid);
}

export function listInboundEmails(limit = 100): ImportSummary[] {
  const rows = getDb()
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM inbound_emails ORDER BY id DESC LIMIT ?`)
    .all(limit) as SummaryRow[];
  return rows.map(toSummary);
}

export function getInboundEmail(id: number): ImportDetail {
  const row = getDb()
    .prepare(`SELECT ${SUMMARY_COLUMNS}, body_text, llm_output FROM inbound_emails WHERE id = ?`)
    .get(id) as (SummaryRow & { body_text: string | null; llm_output: string | null }) | undefined;
  if (!row) throw new NotFoundError('Import');

  const entries = listEntriesForEmail(id);
  const tripNames = new Map(
    (
      getDb()
        .prepare(
          `SELECT id, name FROM trips WHERE id IN (SELECT DISTINCT trip_id FROM itinerary_entries WHERE inbound_email_id = ?)`,
        )
        .all(id) as { id: number; name: string }[]
    ).map((t) => [t.id, t.name]),
  );

  return {
    ...toSummary(row),
    body_text: row.body_text,
    llm_output: row.llm_output ? JSON.parse(row.llm_output) : null,
    entries: entries.map((e) => ({ ...e, trip_name: tripNames.get(e.trip_id) ?? '' })),
  };
}

export function getInboundEmailRaw(id: number): Buffer {
  const row = getDb().prepare('SELECT raw FROM inbound_emails WHERE id = ?').get(id) as
    | { raw: Buffer }
    | undefined;
  if (!row) throw new NotFoundError('Import');
  return row.raw;
}

/** Emails that were received but never finished, e.g. because the server restarted. */
export function pendingInboundEmailIds(): number[] {
  const rows = getDb()
    .prepare(`SELECT id FROM inbound_emails WHERE status IN ('received', 'processing') ORDER BY id`)
    .all() as { id: number }[];
  return rows.map((r) => r.id);
}

export function markProcessing(id: number): void {
  getDb()
    .prepare(`UPDATE inbound_emails SET status = 'processing', error = NULL WHERE id = ?`)
    .run(id);
}

export function recordBodyText(id: number, bodyText: string): void {
  getDb().prepare('UPDATE inbound_emails SET body_text = ? WHERE id = ?').run(bodyText, id);
}

export function markDone(id: number, llmOutput: unknown, result: ImportResult): void {
  getDb()
    .prepare(
      `UPDATE inbound_emails
       SET status = 'done', error = NULL, llm_output = ?, result = ?, processed_at = ?
       WHERE id = ?`,
    )
    .run(JSON.stringify(llmOutput), JSON.stringify(result), nowIso(), id);
}

export function markFailed(id: number, error: string, llmOutput: unknown = null): void {
  getDb()
    .prepare(
      `UPDATE inbound_emails
       SET status = 'failed', error = ?, llm_output = COALESCE(?, llm_output), processed_at = ?
       WHERE id = ?`,
    )
    .run(error, llmOutput === null ? null : JSON.stringify(llmOutput), nowIso(), id);
}

/** Queues an email to be processed again. Entries from earlier runs are left alone. */
export function resetForRetry(id: number): void {
  const result = getDb()
    .prepare(`UPDATE inbound_emails SET status = 'received', error = NULL WHERE id = ?`)
    .run(id);
  if (result.changes === 0) throw new NotFoundError('Import');
}
