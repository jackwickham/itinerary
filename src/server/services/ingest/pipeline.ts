import { todayLocal } from '../../../shared/dates.js';
import type { EntryData, ImportResult } from '../../../shared/schemas.js';
import { getDb } from '../../db/index.js';
import { createEntry } from '../entries.js';
import {
  getInboundEmailRaw,
  markDone,
  markFailed,
  markProcessing,
  recordBodyText,
} from '../inbound-emails.js';
import { createTrip, getTrip, listTrips, tripExists } from '../trips.js';
import { extractEntries, sanitiseProposedEntry } from './extract.js';
import { matchTrip, selectCandidates, type MatchDecision } from './match.js';
import { parseEmail } from './mime.js';

/**
 * Turns one stored email into entries: parse, extract, pick a trip, then create
 * everything through the same service functions the UI uses. Never throws; the
 * outcome is recorded on the inbound_emails row for the imports page.
 */
export async function processInboundEmail(id: number): Promise<void> {
  const llmOutput: Record<string, unknown> = {};
  try {
    markProcessing(id);
    const email = await parseEmail(getInboundEmailRaw(id));
    recordBodyText(id, email.text);

    const extraction = await extractEntries(email);
    llmOutput.extraction = extraction;
    const entries = extraction.entries.map(sanitiseProposedEntry);
    if (entries.length === 0) {
      markDone(id, llmOutput, {
        trip_id: null,
        trip_name: null,
        created_trip: false,
        entry_ids: [],
        message: 'No bookings found in this email.',
      });
      return;
    }

    const candidates = selectCandidates(entries, listTrips(), todayLocal());
    llmOutput.candidates = candidates;
    const match = await matchTrip(entries, extraction, candidates);
    llmOutput.match = match;

    markDone(id, llmOutput, applyImport(id, entries, match));
  } catch (err) {
    console.error(`Import ${id} failed:`, err);
    markFailed(id, err instanceof Error ? err.message : String(err), llmOutput);
  }
}

function applyImport(emailId: number, entries: EntryData[], match: MatchDecision): ImportResult {
  return getDb().transaction(() => {
    const existing = match.tripId !== null && tripExists(match.tripId);
    const trip = existing
      ? getTrip(match.tripId!)
      : createTrip({ name: match.newTripName.slice(0, 200) }, { source: 'email' });
    const created = entries.map((entry) =>
      createEntry(trip.id, entry, { source: 'email', inboundEmailId: emailId }),
    );
    return {
      trip_id: trip.id,
      trip_name: trip.name,
      created_trip: !existing,
      entry_ids: created.map((e) => e.id),
      message: match.reason,
    };
  })();
}
