import { getDb, nowIso } from '../db/index.js';
import { NotFoundError } from '../errors.js';
import {
  ENTRY_DATA_KEYS,
  entryCreateSchema,
  entryDataSchema,
  entryPatchSchema,
  type Entry,
  type EntryData,
  type Source,
} from '../../shared/schemas.js';
import { tripExists } from './trips.js';

/**
 * The canonical way to change itinerary entries. The API routes and email
 * ingestion both call these functions; nothing else writes to the entries table.
 */

type EntryRow = Omit<Entry, 'details'> & { details: string };

const ENTRY_SELECT = `
  SELECT e.*, ie.subject AS inbound_email_subject
  FROM itinerary_entries e
  LEFT JOIN inbound_emails ie ON ie.id = e.inbound_email_id
`;

function toEntry(row: EntryRow): Entry {
  return { ...row, details: JSON.parse(row.details) };
}

function toParams(data: EntryData) {
  return { ...data, details: JSON.stringify(data.details) };
}

function pickData(entry: Entry): EntryData {
  return Object.fromEntries(ENTRY_DATA_KEYS.map((key) => [key, entry[key]])) as EntryData;
}

function assertTripExists(tripId: number) {
  if (!tripExists(tripId)) throw new NotFoundError('Trip');
}

export function listEntriesForTrip(tripId: number): Entry[] {
  const rows = getDb()
    .prepare(
      `${ENTRY_SELECT} WHERE e.trip_id = ?
       ORDER BY e.start_date IS NULL, e.start_date, e.start_time IS NOT NULL, e.start_time, e.id`,
    )
    .all(tripId) as EntryRow[];
  return rows.map(toEntry);
}

export function listEntriesForEmail(inboundEmailId: number): Entry[] {
  const rows = getDb()
    .prepare(`${ENTRY_SELECT} WHERE e.inbound_email_id = ? ORDER BY e.id`)
    .all(inboundEmailId) as EntryRow[];
  return rows.map(toEntry);
}

export function getEntry(id: number): Entry {
  const row = getDb().prepare(`${ENTRY_SELECT} WHERE e.id = ?`).get(id) as EntryRow | undefined;
  if (!row) throw new NotFoundError('Entry');
  return toEntry(row);
}

export interface EntryProvenance {
  source?: Source;
  inboundEmailId?: number | null;
}

export function createEntry(tripId: number, input: unknown, provenance: EntryProvenance = {}): Entry {
  assertTripExists(tripId);
  const data = entryCreateSchema.parse(input);
  const result = getDb()
    .prepare(
      `INSERT INTO itinerary_entries (
         trip_id, title, type, status, icon,
         start_date, start_time, start_tz, start_location,
         end_date, end_time, end_tz, end_location,
         flight_number, details, notes, source, inbound_email_id
       ) VALUES (
         @trip_id, @title, @type, @status, @icon,
         @start_date, @start_time, @start_tz, @start_location,
         @end_date, @end_time, @end_tz, @end_location,
         @flight_number, @details, @notes, @source, @inbound_email_id
       )`,
    )
    .run({
      ...toParams(data),
      trip_id: tripId,
      source: provenance.source ?? 'manual',
      inbound_email_id: provenance.inboundEmailId ?? null,
    });
  return getEntry(Number(result.lastInsertRowid));
}

/**
 * Applies a partial update, re-validating the whole entry. Moving between dates is
 * a change of `start_date`/`end_date`; moving between trips is a change of `trip_id`.
 */
export function updateEntry(id: number, patch: unknown): Entry {
  const existing = getEntry(id);
  const { trip_id: tripId, ...changes } = entryPatchSchema.parse(patch);
  if (tripId !== undefined) assertTripExists(tripId);

  const data = entryDataSchema.parse({ ...pickData(existing), ...changes });
  getDb()
    .prepare(
      `UPDATE itinerary_entries SET
         trip_id = @trip_id, title = @title, type = @type, status = @status, icon = @icon,
         start_date = @start_date, start_time = @start_time, start_tz = @start_tz,
         start_location = @start_location,
         end_date = @end_date, end_time = @end_time, end_tz = @end_tz, end_location = @end_location,
         flight_number = @flight_number, details = @details, notes = @notes, updated_at = @updated_at
       WHERE id = @id`,
    )
    .run({ ...toParams(data), trip_id: tripId ?? existing.trip_id, updated_at: nowIso(), id });
  return getEntry(id);
}

export function deleteEntry(id: number): void {
  const result = getDb().prepare('DELETE FROM itinerary_entries WHERE id = ?').run(id);
  if (result.changes === 0) throw new NotFoundError('Entry');
}
