import { addDays, type LocalDate } from '../../../shared/dates.js';
import type { EntryData, Trip } from '../../../shared/schemas.js';
import { getLLM } from '../llm/index.js';
import { ReasoningLevel } from '../llm/interface.js';
import { listTripPlaces } from '../trips-places.js';
import { MATCH_SYSTEM_PROMPT, matchUserMessage, type CandidateDescription } from './prompts.js';
import { tripMatchSchema, type EmailExtraction } from './schemas.js';

/** How far either side of a trip's dates a booking can fall and still be considered part of it. */
const WINDOW_DAYS = 14;

/**
 * Trips worth asking the model about: those whose dates overlap or fall within
 * the window around the bookings, plus undated trips. When the bookings have no
 * dates at all, any trip that hasn't finished.
 */
export function selectCandidates(entries: EntryData[], trips: Trip[], today: LocalDate): CandidateDescription[] {
  const dates = entries
    .flatMap((e) => [e.start_date, e.end_date])
    .filter((d): d is string => d !== null)
    .sort();
  const first = dates[0];
  const last = dates[dates.length - 1];

  return trips
    .filter((t) => {
      const start = t.start_date ?? t.end_date;
      const end = t.end_date ?? t.start_date;
      if (!start || !end) return true;
      if (!first) return end >= today;
      return start <= addDays(last, WINDOW_DAYS) && end >= addDays(first, -WINDOW_DAYS);
    })
    .map((t) => ({
      id: t.id,
      name: t.name,
      start_date: t.start_date,
      end_date: t.end_date,
      places: listTripPlaces(t.id),
    }));
}

export interface MatchDecision {
  /** An existing trip to add to, or null to create one called `newTripName`. */
  tripId: number | null;
  newTripName: string;
  reason: string;
}

export async function matchTrip(
  entries: EntryData[],
  extraction: EmailExtraction,
  candidates: CandidateDescription[],
): Promise<MatchDecision> {
  const fallbackName = extraction.suggested_trip_name.trim() || extraction.destination_summary.trim() || 'Imported trip';
  if (candidates.length === 0) {
    return { tripId: null, newTripName: fallbackName, reason: 'No existing trips near these dates.' };
  }

  const match = await getLLM().completeStructured({
    task: 'match',
    systemPrompt: MATCH_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: matchUserMessage(entries, candidates, fallbackName) }],
    schema: tripMatchSchema,
    schemaName: 'trip_match',
    options: { reasoning: ReasoningLevel.LOW },
  });

  const known = match.trip_id !== null && candidates.some((c) => c.id === match.trip_id);
  return {
    tripId: known ? match.trip_id : null,
    newTripName: match.new_trip_name?.trim() || fallbackName,
    reason:
      match.trip_id !== null && !known
        ? `The model chose trip ${match.trip_id}, which wasn't a candidate, so a new trip was created.`
        : match.reason,
  };
}
