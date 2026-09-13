import { getDb } from '../db/index.js';

/** Distinct places mentioned in a trip's entries, in the order they were added. */
export function listTripPlaces(tripId: number, limit = 8): string[] {
  const rows = getDb()
    .prepare(
      `SELECT place FROM (
         SELECT start_location AS place, id FROM itinerary_entries
         WHERE trip_id = @tripId AND start_location IS NOT NULL
         UNION ALL
         SELECT end_location AS place, id FROM itinerary_entries
         WHERE trip_id = @tripId AND end_location IS NOT NULL
       )
       GROUP BY place ORDER BY MIN(id) LIMIT @limit`,
    )
    .all({ tripId, limit }) as { place: string }[];
  return rows.map((r) => r.place);
}
