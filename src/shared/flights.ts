import type { EntryType } from './constants.js';
import { entryInstant, type LocalDate } from './dates.js';

/**
 * Live flight status: the shape the API returns, and the rules for when an entry
 * has one. Kept free of zod so the client can import it.
 */

// ---------------------------------------------------------------------------
// Flight numbers

/**
 * A flight number as stored: upper case with no spaces, either an IATA
 * designator ("BA432", "U28564") or an ICAO one ("BAW432"), with the optional
 * operational suffix airlines sometimes add.
 */
export const FLIGHT_NUMBER_PATTERN = /^(?=.*[A-Z])[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/;

export function normaliseFlightNumber(value: string): string {
  return value.toUpperCase().replace(/[\s.‐-―-]/g, '');
}

// ---------------------------------------------------------------------------
// When status is worth fetching

const HOUR = 3_600_000;

/** Status appears this long before departure: before that nothing is known yet. */
export const STATUS_LEAD_MS = 24 * HOUR;
/** And stays until this long after the scheduled arrival (or departure). */
export const STATUS_TRAIL_MS = 6 * HOUR;
/** How far either side of the departure FlightAware is asked to look. */
const SEARCH_HALF_MS = 12 * HOUR;

/** The entry fields that decide whether a live status exists, and which flight. */
export interface FlightEntryFields {
  type: EntryType;
  flight_number: string | null;
  start_date: LocalDate | null;
  start_time: string | null;
  start_tz: string | null;
  end_date: LocalDate | null;
  end_time: string | null;
  end_tz: string | null;
}

export interface FlightWindow {
  /** Best guess at the scheduled departure, as an epoch time. */
  departure: number;
  /** The period during which live status is shown. */
  from: number;
  until: number;
  /** The scheduled-departure window to search, which the guess may sit anywhere in. */
  searchStart: number;
  searchEnd: number;
}

export interface FlightLookup extends FlightWindow {
  /** The ident to ask FlightAware about. */
  ident: string;
}

/**
 * When live status would be shown for a travel entry, or null if it has no date.
 * A flight with no departure time is assumed to leave in the middle of its local
 * day, which is close enough to pick it out of a day's flights under one number.
 */
export function flightWindow(entry: FlightEntryFields): FlightWindow | null {
  if (entry.type !== 'travel' || !entry.start_date) return null;

  const departure = entryInstant(entry.start_date, entry.start_time, entry.start_tz) ?? middayUtc(entry.start_date);
  const arrival = entryInstant(entry.end_date, entry.end_time, entry.end_tz);
  return {
    departure,
    from: departure - STATUS_LEAD_MS,
    until: Math.max(arrival ?? departure, departure) + STATUS_TRAIL_MS,
    searchStart: departure - SEARCH_HALF_MS,
    searchEnd: departure + SEARCH_HALF_MS,
  };
}

/** What to ask FlightAware about for this entry, or null if it isn't a dated flight. */
export function flightLookup(entry: FlightEntryFields): FlightLookup | null {
  const window = entry.flight_number ? flightWindow(entry) : null;
  return window ? { ...window, ident: entry.flight_number! } : null;
}

/** Whether live status is worth showing now. */
export function isWithinFlightWindow(window: FlightWindow, now: number = Date.now()): boolean {
  return now >= window.from && now <= window.until;
}

function middayUtc(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12);
}

// ---------------------------------------------------------------------------
// The status itself

/** The three versions of one time: as published, as now expected, as it happened. */
export interface FlightTimes {
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
}

export interface FlightAirport {
  code: string | null;
  name: string | null;
  city: string | null;
  /** IANA zone of the airport, for showing its times in local time. */
  timezone: string | null;
}

/** One flight as FlightAware sees it: the entry's own, or the aircraft's previous leg. */
export interface FlightLeg {
  ident: string;
  /** FlightAware's own summary, e.g. "Scheduled", "En Route / On Time", "Cancelled". */
  status: string | null;
  cancelled: boolean;
  diverted: boolean;
  origin: FlightAirport | null;
  destination: FlightAirport | null;
  /** Gate departure and arrival, falling back to the runway times when unknown. */
  departure: FlightTimes;
  arrival: FlightTimes;
  /** Wheels up and down, so "has it left yet" doesn't depend on gate data. */
  took_off_at: string | null;
  landed_at: string | null;
  /** Seconds late against the schedule; negative is early. */
  departure_delay: number | null;
  arrival_delay: number | null;
  progress_percent: number | null;
  gate_origin: string | null;
  gate_destination: string | null;
  terminal_origin: string | null;
  terminal_destination: string | null;
  baggage_claim: string | null;
}

export type FlightStatus =
  | {
      state: 'ok';
      /** When this was fetched from FlightAware; it may have been served from cache. */
      fetched_at: string;
      flight: FlightLeg;
      /** The aircraft's previous flight, when FlightAware knows it. */
      inbound: FlightLeg | null;
    }
  | { state: 'not_found'; fetched_at: string; ident: string }
  /** Too early (or too late) for live status; `available_from` is null once it's past. */
  | { state: 'outside_window'; available_from: string | null }
  | { state: 'unavailable'; reason: string };

/** True while the flight has left the gate but not arrived. */
export function isAirborne(leg: FlightLeg): boolean {
  return !!leg.took_off_at && !leg.landed_at;
}

/** The time to show for one end of a leg: what happened, else what's expected. */
export function currentTime(times: FlightTimes): string | null {
  return times.actual ?? times.estimated ?? times.scheduled;
}
