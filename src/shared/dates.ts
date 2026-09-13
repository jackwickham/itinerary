import { TZDate } from '@date-fns/tz';
import type { EntryType } from './constants.js';

/**
 * A calendar date as `YYYY-MM-DD`, with no time zone attached. Itinerary dates are
 * always local to wherever the thing happens, so they are kept as plain strings and
 * compared lexically rather than turned into instants.
 */
export type LocalDate = string;

// ---------------------------------------------------------------------------
// Validation

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const timeZoneCache = new Map<string, string | null>();

/**
 * The canonical spelling of an IANA time zone ("europe/london" → "Europe/London"),
 * or null if the runtime doesn't recognise it.
 */
export function canonicalTimeZone(value: string): string | null {
  const key = value.trim();
  if (!key) return null;
  let canonical = timeZoneCache.get(key);
  if (canonical === undefined) {
    try {
      canonical = new Intl.DateTimeFormat('en-US', { timeZone: key }).resolvedOptions().timeZone;
    } catch {
      canonical = null;
    }
    timeZoneCache.set(key, canonical);
  }
  return canonical;
}

// ---------------------------------------------------------------------------
// Local date arithmetic

function toUtc(date: LocalDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function diffDays(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** Every date from `start` to `end` inclusive. */
export function eachDay(start: LocalDate, end: LocalDate): LocalDate[] {
  const days: LocalDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Today's date in the runtime's own time zone (the viewer's, on the client). */
export function todayLocal(now: Date = new Date()): LocalDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Day of week (0 = Sunday) for a local date. */
export function weekday(date: LocalDate): number {
  return toUtc(date).getUTCDay();
}

/**
 * The absolute instant for a local date + time in an IANA zone, or null when any
 * part is missing. Only used where comparing across zones matters (validation,
 * travel durations) - display always uses the local values.
 */
export function entryInstant(
  date: LocalDate | null,
  time: string | null,
  timeZone: string | null,
): number | null {
  if (!date || !time || !timeZone) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new TZDate(y, m - 1, d, hh, mm, timeZone).getTime();
}

// ---------------------------------------------------------------------------
// Trips

export interface DatedTrip {
  start_date: LocalDate | null;
  end_date: LocalDate | null;
}

/**
 * A trip's effective dates: each manual override wins over the date inferred from
 * its entries. An override can leave the range inverted (e.g. start pushed past the
 * last booking), in which case the end is pulled up to the start.
 */
export function effectiveTripDates(
  overrides: { start: LocalDate | null; end: LocalDate | null },
  inferred: { start: LocalDate | null; end: LocalDate | null },
): DatedTrip {
  const start = overrides.start ?? inferred.start;
  let end = overrides.end ?? inferred.end;
  if (start && end && end < start) end = start;
  return { start_date: start, end_date: end };
}

export type TripPhase = 'current' | 'upcoming' | 'undated' | 'past';

export function tripPhase(trip: DatedTrip, today: LocalDate): TripPhase {
  const start = trip.start_date ?? trip.end_date;
  const end = trip.end_date ?? trip.start_date;
  if (!start || !end) return 'undated';
  if (end < today) return 'past';
  if (start > today) return 'upcoming';
  return 'current';
}

/**
 * Buckets trips for the home page: current and upcoming trips soonest first,
 * undated trips in the order given, past trips most recent first.
 */
export function groupTripsForHome<T extends DatedTrip>(
  trips: readonly T[],
  today: LocalDate,
): Record<TripPhase, T[]> {
  const groups: Record<TripPhase, T[]> = { current: [], upcoming: [], undated: [], past: [] };
  for (const trip of trips) groups[tripPhase(trip, today)].push(trip);

  const startOf = (t: T) => (t.start_date ?? t.end_date)!;
  const endOf = (t: T) => (t.end_date ?? t.start_date)!;
  groups.current.sort((a, b) => startOf(a).localeCompare(startOf(b)));
  groups.upcoming.sort((a, b) => startOf(a).localeCompare(startOf(b)));
  groups.past.sort((a, b) => endOf(b).localeCompare(endOf(a)));
  return groups;
}

// ---------------------------------------------------------------------------
// Entries

/**
 * New dates for an entry moved so that it starts on `newStart`, keeping the length
 * of any date range. Moving to null makes the entry unscheduled.
 */
export function shiftEntryDates(
  entry: { start_date: LocalDate | null; end_date: LocalDate | null },
  newStart: LocalDate | null,
): { start_date: LocalDate | null; end_date: LocalDate | null } {
  if (!newStart) return { start_date: null, end_date: null };
  if (!entry.start_date || !entry.end_date) return { start_date: newStart, end_date: null };
  return {
    start_date: newStart,
    end_date: addDays(newStart, diffDays(entry.start_date, entry.end_date)),
  };
}

export interface TimelineEntry {
  id: number;
  type: EntryType;
  start_date: LocalDate | null;
  start_time: string | null;
  end_date: LocalDate | null;
  end_time: string | null;
}

/**
 * How an entry appears on a given day: `full` on the day it starts, `end` on the
 * last day of a multi-day stay or activity, `continuation` on the days between.
 * Travel only ever appears in full, on the day it departs.
 */
export type TimelineItemKind = 'full' | 'end' | 'continuation';

export interface TimelineItem<E> {
  entry: E;
  kind: TimelineItemKind;
}

export interface TimelineDay<E> {
  date: LocalDate;
  /** 1-based day within the trip's range, or null for days outside it. */
  dayNumber: number | null;
  items: TimelineItem<E>[];
}

export interface Timeline<E> {
  days: TimelineDay<E>[];
  unscheduled: E[];
}

/** Guards against absurd ranges (a typo'd year) producing thousands of empty days. */
const MAX_RANGE_DAYS = 400;
const MAX_CONTINUATION_DAYS = 62;

/**
 * Groups entries into days. Every day of the trip's range is included, even when
 * empty, plus any day an entry touches outside it. Within a day, continuation chips
 * come first, then date-only items, then timed items by local time.
 */
export function groupTimeline<E extends TimelineEntry>(
  entries: readonly E[],
  range: { start: LocalDate | null; end: LocalDate | null },
): Timeline<E> {
  const days = new Map<LocalDate, TimelineItem<E>[]>();
  const itemsFor = (date: LocalDate) => {
    let items = days.get(date);
    if (!items) {
      items = [];
      days.set(date, items);
    }
    return items;
  };

  if (range.start && range.end && diffDays(range.start, range.end) <= MAX_RANGE_DAYS) {
    for (const date of eachDay(range.start, range.end)) itemsFor(date);
  }

  const unscheduled: E[] = [];
  for (const entry of entries) {
    const start = entry.start_date;
    if (!start) {
      unscheduled.push(entry);
      continue;
    }
    itemsFor(start).push({ entry, kind: 'full' });

    const end = entry.end_date;
    if (entry.type === 'travel' || !end || end <= start) continue;
    const span = diffDays(start, end);
    if (span <= MAX_CONTINUATION_DAYS) {
      for (let i = 1; i < span; i++) itemsFor(addDays(start, i)).push({ entry, kind: 'continuation' });
    }
    itemsFor(end).push({ entry, kind: 'end' });
  }

  return {
    days: [...days.keys()].sort().map((date) => ({
      date,
      dayNumber: dayNumber(date, range),
      items: days.get(date)!.sort(compareItems),
    })),
    unscheduled,
  };
}

function dayNumber(date: LocalDate, range: { start: LocalDate | null; end: LocalDate | null }) {
  if (!range.start || date < range.start || (range.end && date > range.end)) return null;
  return diffDays(range.start, date) + 1;
}

function itemTime(item: TimelineItem<TimelineEntry>): string | null {
  if (item.kind === 'full') return item.entry.start_time;
  if (item.kind === 'end') return item.entry.end_time;
  return null;
}

function compareItems(a: TimelineItem<TimelineEntry>, b: TimelineItem<TimelineEntry>): number {
  const rank = (i: TimelineItem<TimelineEntry>) =>
    i.kind === 'continuation' ? 0 : itemTime(i) === null ? 1 : 2;
  const byRank = rank(a) - rank(b);
  if (byRank) return byRank;

  const ta = itemTime(a) ?? '';
  const tb = itemTime(b) ?? '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  // Check out of one place before checking in to the next.
  if (a.kind !== b.kind) return a.kind === 'end' ? -1 : 1;
  return a.entry.id - b.entry.id;
}
