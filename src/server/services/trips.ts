import { getDb, nowIso } from '../db/index.js';
import { HttpError, NotFoundError } from '../errors.js';
import { effectiveTripDates } from '../../shared/dates.js';
import {
  DATE_DRIVING_STATUSES,
  tripCreateSchema,
  tripDataSchema,
  tripPatchSchema,
  type Source,
  type Trip,
  type TripWithEntries,
} from '../../shared/schemas.js';
import { listEntriesForTrip } from './entries.js';

/**
 * The canonical way to change trips. The API routes and email ingestion both call
 * these functions; nothing else writes to the trips table.
 */

interface TripRow {
  id: number;
  name: string;
  start_date_override: string | null;
  end_date_override: string | null;
  source: Source;
  created_at: string;
  updated_at: string;
  inferred_start_date: string | null;
  inferred_end_date: string | null;
  entry_count: number;
}

const drivingStatuses = DATE_DRIVING_STATUSES.map((s) => `'${s}'`).join(', ');

/** Trips with their inferred dates, which are computed here and never stored. */
const TRIP_SELECT = `
  SELECT t.*,
    agg.inferred_start_date,
    agg.inferred_end_date,
    COALESCE(cnt.entry_count, 0) AS entry_count
  FROM trips t
  LEFT JOIN (
    SELECT trip_id,
      MIN(start_date) AS inferred_start_date,
      MAX(COALESCE(end_date, start_date)) AS inferred_end_date
    FROM itinerary_entries
    WHERE status IN (${drivingStatuses}) AND start_date IS NOT NULL
    GROUP BY trip_id
  ) agg ON agg.trip_id = t.id
  LEFT JOIN (
    SELECT trip_id, COUNT(*) AS entry_count FROM itinerary_entries GROUP BY trip_id
  ) cnt ON cnt.trip_id = t.id
`;

function toTrip(row: TripRow): Trip {
  return {
    ...row,
    ...effectiveTripDates(
      { start: row.start_date_override, end: row.end_date_override },
      { start: row.inferred_start_date, end: row.inferred_end_date },
    ),
  };
}

export function listTrips(): Trip[] {
  const rows = getDb().prepare(`${TRIP_SELECT} ORDER BY t.created_at DESC, t.id DESC`).all() as TripRow[];
  return rows.map(toTrip);
}

export function getTrip(id: number): Trip {
  const row = getDb().prepare(`${TRIP_SELECT} WHERE t.id = ?`).get(id) as TripRow | undefined;
  if (!row) throw new NotFoundError('Trip');
  return toTrip(row);
}

export function getTripWithEntries(id: number): TripWithEntries {
  return { ...getTrip(id), entries: listEntriesForTrip(id) };
}

export function tripExists(id: number): boolean {
  return getDb().prepare('SELECT 1 FROM trips WHERE id = ?').get(id) !== undefined;
}

export function createTrip(input: unknown, options: { source?: Source } = {}): Trip {
  const data = tripCreateSchema.parse(input);
  const result = getDb()
    .prepare(
      `INSERT INTO trips (name, start_date_override, end_date_override, source)
       VALUES (@name, @start_date_override, @end_date_override, @source)`,
    )
    .run({ ...data, source: options.source ?? 'manual' });
  return getTrip(Number(result.lastInsertRowid));
}

export function updateTrip(id: number, patch: unknown): Trip {
  const existing = getTrip(id);
  const changes = tripPatchSchema.parse(patch);
  const data = tripDataSchema.parse({
    name: existing.name,
    start_date_override: existing.start_date_override,
    end_date_override: existing.end_date_override,
    ...changes,
  });
  getDb()
    .prepare(
      `UPDATE trips
       SET name = @name, start_date_override = @start_date_override,
           end_date_override = @end_date_override, updated_at = @updated_at
       WHERE id = @id`,
    )
    .run({ ...data, id, updated_at: nowIso() });
  return getTrip(id);
}

/** Deletes a trip and, by cascade, all of its entries. */
export function deleteTrip(id: number): void {
  const result = getDb().prepare('DELETE FROM trips WHERE id = ?').run(id);
  if (result.changes === 0) throw new NotFoundError('Trip');
}

/**
 * Moves every entry from one trip to another, optionally deleting the emptied
 * source trip. This is how a wrongly auto-created trip is merged into the right one.
 */
export function moveAllEntries(
  fromId: number,
  toId: number,
  options: { deleteSource?: boolean } = {},
): { target: Trip; moved: number } {
  if (fromId === toId) throw new HttpError(400, 'Cannot move entries to the same trip');
  const db = getDb();
  return db.transaction(() => {
    getTrip(fromId);
    getTrip(toId);
    const moved = db
      .prepare('UPDATE itinerary_entries SET trip_id = ?, updated_at = ? WHERE trip_id = ?')
      .run(toId, nowIso(), fromId).changes;
    if (options.deleteSource) deleteTrip(fromId);
    return { target: getTrip(toId), moved };
  })();
}
