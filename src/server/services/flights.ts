import { z } from 'zod';
import {
  flightLookup,
  isWithinFlightWindow,
  type FlightLeg,
  type FlightStatus,
  type FlightTimes,
} from '../../shared/flights.js';
import { loadConfig, loadSecrets } from '../config.js';
import { HttpError } from '../errors.js';
import { getEntry } from './entries.js';

/**
 * Live flight status from FlightAware AeroAPI. Every query costs money, so a
 * status is only fetched inside the window around departure where it means
 * something, and is then cached in memory until the refresh button asks again.
 */

// ---------------------------------------------------------------------------
// The slice of AeroAPI's flight object we use

const text = z.string().nullish();
const count = z.number().nullish();

const airportSchema = z
  .object({ code_iata: text, code: text, name: text, city: text, timezone: text })
  .nullish();

const aeroFlightSchema = z.object({
  ident: text,
  ident_iata: text,
  ident_icao: text,
  fa_flight_id: text,
  inbound_fa_flight_id: text,
  status: text,
  cancelled: z.boolean().nullish(),
  diverted: z.boolean().nullish(),
  origin: airportSchema,
  destination: airportSchema,
  departure_delay: count,
  arrival_delay: count,
  progress_percent: count,
  gate_origin: text,
  gate_destination: text,
  terminal_origin: text,
  terminal_destination: text,
  baggage_claim: text,
  scheduled_out: text,
  estimated_out: text,
  actual_out: text,
  scheduled_off: text,
  estimated_off: text,
  actual_off: text,
  scheduled_on: text,
  estimated_on: text,
  actual_on: text,
  scheduled_in: text,
  estimated_in: text,
  actual_in: text,
});

const aeroResponseSchema = z.object({ flights: z.array(aeroFlightSchema).nullish() });

type AeroFlight = z.output<typeof aeroFlightSchema>;

const aeroErrorSchema = z.object({ detail: text, title: text });

// ---------------------------------------------------------------------------
// Calling AeroAPI

/** AeroAPI only accepts a window within 10 days past and 2 days ahead. */
const MAX_PAST_MS = 9 * 24 * 3_600_000;
const MAX_FUTURE_MS = 47 * 3_600_000;
const REQUEST_TIMEOUT_MS = 10_000;

interface FlightQuery {
  ident: string;
  identType: 'designator' | 'fa_flight_id';
  start?: number;
  end?: number;
}

async function queryFlights(query: FlightQuery, apiKey: string): Promise<AeroFlight[]> {
  const apiBase = loadConfig().flights.apiBase.replace(/\/+$/, '');
  const url = new URL(`${apiBase}/flights/${encodeURIComponent(query.ident)}`);
  url.searchParams.set('ident_type', query.identType);
  if (query.start !== undefined) url.searchParams.set('start', new Date(query.start).toISOString());
  if (query.end !== undefined) url.searchParams.set('end', new Date(query.end).toISOString());

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'x-apikey': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // `fetch failed` on its own says nothing; the cause carries the DNS or socket error.
    console.error(`FlightAware request to ${url} failed:`, err);
    throw new HttpError(504, `FlightAware did not respond (${describeFailure(err)})`);
  }

  if (!response.ok) {
    // A 404 here means "no such ident", not a missing flight; both are handled the same way.
    if (response.status === 404) return [];
    const message = await errorMessage(response);
    console.error(`FlightAware request to ${url} returned ${response.status}: ${message}`);
    throw new HttpError(502, `FlightAware: ${message}`);
  }

  const parsed = aeroResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new HttpError(502, 'FlightAware returned an unexpected response');
  return parsed.data.flights ?? [];
}

/** "fetch failed: ENOTFOUND", rather than either half on its own. */
function describeFailure(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code ?? cause?.message;
  return detail ? `${err.message}: ${detail}` : err.message;
}

async function errorMessage(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) return 'the API key was rejected';
  if (response.status === 429) return 'the rate limit or quota has been reached';
  const body = aeroErrorSchema.safeParse(await response.json().catch(() => null));
  const detail = body.success ? (body.data.detail ?? body.data.title) : null;
  return detail ?? `request failed (${response.status})`;
}

// ---------------------------------------------------------------------------
// Turning one into a FlightLeg

function times(scheduled?: string | null, estimated?: string | null, actual?: string | null): FlightTimes {
  return { scheduled: scheduled ?? null, estimated: estimated ?? null, actual: actual ?? null };
}

/** Gate times where they exist, runway times where they don't, never a mix of both. */
function endTimes(gate: FlightTimes, runway: FlightTimes): FlightTimes {
  return gate.scheduled || gate.estimated || gate.actual ? gate : runway;
}

function toLeg(f: AeroFlight): FlightLeg {
  return {
    ident: f.ident_iata || f.ident || f.ident_icao || '',
    status: f.status ?? null,
    cancelled: f.cancelled ?? false,
    diverted: f.diverted ?? false,
    origin: f.origin
      ? {
          code: f.origin.code_iata || f.origin.code || null,
          name: f.origin.name ?? null,
          city: f.origin.city ?? null,
          timezone: f.origin.timezone ?? null,
        }
      : null,
    destination: f.destination
      ? {
          code: f.destination.code_iata || f.destination.code || null,
          name: f.destination.name ?? null,
          city: f.destination.city ?? null,
          timezone: f.destination.timezone ?? null,
        }
      : null,
    departure: endTimes(
      times(f.scheduled_out, f.estimated_out, f.actual_out),
      times(f.scheduled_off, f.estimated_off, f.actual_off),
    ),
    arrival: endTimes(
      times(f.scheduled_in, f.estimated_in, f.actual_in),
      times(f.scheduled_on, f.estimated_on, f.actual_on),
    ),
    took_off_at: f.actual_off ?? null,
    landed_at: f.actual_on ?? null,
    departure_delay: f.departure_delay ?? null,
    arrival_delay: f.arrival_delay ?? null,
    progress_percent: f.progress_percent ?? null,
    gate_origin: f.gate_origin ?? null,
    gate_destination: f.gate_destination ?? null,
    terminal_origin: f.terminal_origin ?? null,
    terminal_destination: f.terminal_destination ?? null,
    baggage_claim: f.baggage_claim ?? null,
  };
}

/** The flight scheduled closest to when the entry says it leaves. */
function closestTo(departure: number, flights: AeroFlight[]): AeroFlight | null {
  let best: AeroFlight | null = null;
  let bestDistance = Infinity;
  for (const flight of flights) {
    const scheduled = Date.parse(flight.scheduled_out ?? flight.scheduled_off ?? flight.estimated_out ?? '');
    const distance = Number.isNaN(scheduled) ? Infinity : Math.abs(scheduled - departure);
    if (distance < bestDistance) {
      best = flight;
      bestDistance = distance;
    }
  }
  return best ?? flights[0] ?? null;
}

// ---------------------------------------------------------------------------
// Cache

interface CacheRecord {
  at: number;
  /** Shared so simultaneous requests for one flight cost a single query. */
  status: Promise<FlightStatus>;
}

const cache = new Map<string, CacheRecord>();

function cached(key: string, now: number, load: () => Promise<FlightStatus>): Promise<FlightStatus> {
  const ttl = loadConfig().flights.cacheTtlSeconds * 1000;
  for (const [k, record] of cache) if (now - record.at > ttl) cache.delete(k);

  const hit = cache.get(key);
  if (hit) return hit.status;

  const status = load();
  cache.set(key, { at: now, status });
  // A failed lookup shouldn't be remembered: the refresh button must be able to retry.
  status.catch(() => cache.delete(key));
  return status;
}

/** Forget every cached status, for tests. */
export function clearFlightCache(): void {
  cache.clear();
}

// ---------------------------------------------------------------------------
// The status of one entry's flight

export async function getEntryFlightStatus(
  entryId: number,
  options: { refresh?: boolean; now?: number } = {},
): Promise<FlightStatus> {
  const entry = getEntry(entryId);
  const lookup = flightLookup(entry);
  if (!lookup) {
    return { state: 'unavailable', reason: 'This entry has no flight number.' };
  }

  const now = options.now ?? Date.now();
  if (!isWithinFlightWindow(lookup, now)) {
    return {
      state: 'outside_window',
      available_from: now < lookup.from ? new Date(lookup.from).toISOString() : null,
    };
  }

  const apiKey = loadSecrets().flightaware?.apiKey;
  if (!apiKey) {
    return { state: 'unavailable', reason: 'FlightAware is not configured.' };
  }

  // AeroAPI won't look further than 10 days back or 2 days ahead, but the key stays
  // the entry's own window so that clamping to "now" can't defeat the cache.
  const start = Math.max(lookup.searchStart, now - MAX_PAST_MS);
  const end = Math.min(lookup.searchEnd, now + MAX_FUTURE_MS);
  const key = `${lookup.ident}|${lookup.searchStart}|${lookup.searchEnd}`;
  if (options.refresh) cache.delete(key);
  return cached(key, now, () => loadStatus(lookup.ident, lookup.departure, start, end, apiKey));
}

async function loadStatus(
  ident: string,
  departure: number,
  start: number,
  end: number,
  apiKey: string,
): Promise<FlightStatus> {
  const flights = await queryFlights({ ident, identType: 'designator', start, end }, apiKey);
  const match = closestTo(departure, flights);
  const fetched_at = new Date().toISOString();
  if (!match) return { state: 'not_found', fetched_at, ident };

  return {
    state: 'ok',
    fetched_at,
    flight: toLeg(match),
    inbound: match.inbound_fa_flight_id ? await loadInbound(match.inbound_fa_flight_id, apiKey) : null,
  };
}

/** The aircraft's previous leg. Losing it shouldn't lose the flight itself. */
async function loadInbound(faFlightId: string, apiKey: string): Promise<FlightLeg | null> {
  try {
    const flights = await queryFlights({ ident: faFlightId, identType: 'fa_flight_id' }, apiKey);
    return flights[0] ? toLeg(flights[0]) : null;
  } catch (err) {
    console.warn(`Inbound flight ${faFlightId} could not be fetched:`, err);
    return null;
  }
}
