import { diffDays, entryInstant, weekday, type LocalDate, type TimelineDay } from '../shared/dates';
import {
  DEFAULT_ICON,
  ENTRY_ICONS,
  type EntryIcon,
  type EntryStatus,
  type EntryType,
} from '../shared/constants';
import type { Entry, ImportStatus, ImportSummary } from '../shared/schemas';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function split(date: LocalDate) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

export function yearOf(date: LocalDate): number {
  return Number(date.slice(0, 4));
}

/** "Sat 14 Mar", with the year added when it isn't `currentYear`. */
export function formatDay(date: LocalDate, currentYear?: number): string {
  const { y, m, d } = split(date);
  const base = `${WEEKDAYS[weekday(date)]} ${d} ${MONTHS[m - 1]}`;
  return currentYear !== undefined && y !== currentYear ? `${base} ${y}` : base;
}

/** "14 Mar", with the year added when it isn't `currentYear`. */
export function formatShortDate(date: LocalDate, currentYear?: number): string {
  const { y, m, d } = split(date);
  const base = `${d} ${MONTHS[m - 1]}`;
  return currentYear !== undefined && y !== currentYear ? `${base} ${y}` : base;
}

/** "14–19 Mar", "28 Mar – 2 Apr", "30 Dec 2026 – 3 Jan 2027". */
export function formatDateRange(
  start: LocalDate | null,
  end: LocalDate | null,
  currentYear: number,
): string | null {
  if (!start && !end) return null;
  const s = split((start ?? end)!);
  const e = split((end ?? start)!);
  const year = (y: number) => (y === currentYear ? '' : ` ${y}`);
  if (!start || !end || start === end) return `${s.d} ${MONTHS[s.m - 1]}${year(s.y)}`;
  if (s.y !== e.y) return `${s.d} ${MONTHS[s.m - 1]} ${s.y} – ${e.d} ${MONTHS[e.m - 1]} ${e.y}`;
  if (s.m === e.m) return `${s.d}–${e.d} ${MONTHS[s.m - 1]}${year(s.y)}`;
  return `${s.d} ${MONTHS[s.m - 1]} – ${e.d} ${MONTHS[e.m - 1]}${year(s.y)}`;
}

export function relativeDays(from: LocalDate, to: LocalDate): string {
  const n = diffDays(from, to);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 0) return n < 60 ? `in ${n} days` : `in ${Math.round(n / 30.4)} months`;
  return -n < 60 ? `${-n} days ago` : `${Math.round(-n / 30.4)} months ago`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

// ---------------------------------------------------------------------------
// Time zones

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * A short name for a zone at a given moment: "BST", "CEST", "EDT", falling back to
 * "GMT+9" where no locale has a friendlier abbreviation.
 */
export function tzAbbreviation(tz: string, date: LocalDate, time: string | null): string {
  const instant = entryInstant(date, time ?? '12:00', tz);
  if (instant === null) return tz;
  let fallback = '';
  for (const locale of ['en-GB', 'en-US']) {
    const name =
      new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(instant)
        .find((part) => part.type === 'timeZoneName')?.value ?? '';
    if (name && !/^(GMT|UTC)[+-−]/.test(name)) return name;
    fallback ||= name;
  }
  return fallback || tz;
}

/**
 * Which times on a timeline need a zone label. Times are shown bare while you stay
 * in one zone, starting from the viewer's own; a label appears whenever the zone
 * changes, and on both ends of travel that crosses zones.
 */
export function zonesToShow(days: TimelineDay<Entry>[], homeZone: string): Set<string> {
  const show = new Set<string>();
  let current = homeZone;
  for (const day of days) {
    for (const { entry: e, kind } of day.items) {
      if (kind === 'full') {
        if (e.start_time && e.start_tz) {
          const crossing = e.type === 'travel' && !!e.end_tz && e.end_tz !== e.start_tz;
          if (e.start_tz !== current || crossing) show.add(`${e.id}:start`);
          current = e.start_tz;
        }
        if (e.type === 'travel' && e.end_time && e.end_tz) {
          if (e.end_tz !== current) show.add(`${e.id}:end`);
          current = e.end_tz;
        }
      } else if (kind === 'end' && e.end_time && e.end_tz) {
        if (e.end_tz !== current) show.add(`${e.id}:end`);
        current = e.end_tz;
      }
    }
  }
  return show;
}

/**
 * A sensible zone for a new timed entry: wherever the trip will be on that date
 * according to the entries before it, or the viewer's own zone.
 */
export function suggestTimeZone(entries: Entry[], date: LocalDate | null, fallback: string): string {
  let best: string | null = null;
  for (const e of entries) {
    if (!e.start_date) continue;
    if (date && e.start_date > date) break;
    best = e.end_tz ?? e.start_tz ?? best;
  }
  return best ?? fallback;
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Door-to-door time for travel with both ends fully specified. */
export function travelDuration(e: Entry): number | null {
  const start = entryInstant(e.start_date, e.start_time, e.start_tz);
  const end = entryInstant(e.end_date, e.end_time, e.end_tz);
  return start !== null && end !== null && end > start ? end - start : null;
}

// ---------------------------------------------------------------------------
// Entry presentation

const TYPE_LABELS: Record<EntryType, string> = {
  travel: 'Travel',
  accommodation: 'Stay',
  activity: 'Activity',
  reservation: 'Reservation',
  note: 'Note',
  other: 'Other',
};

export const TYPE_META = Object.fromEntries(
  Object.entries(TYPE_LABELS).map(([type, label]) => [
    type,
    { label, icon: ENTRY_ICONS[DEFAULT_ICON[type as EntryType]].emoji },
  ]),
) as Record<EntryType, { label: string; icon: string }>;

const TRAVEL_GUESSES: [RegExp, EntryIcon][] = [
  [/\b(train|rail|railway|eurostar|sncf|lner|avanti|gwr|trenitalia|renfe|tgv|shinkansen|amtrak)\b/i, 'train'],
  [/\b(ferry|boat|cruise|sailing)\b/i, 'ferry'],
  [/\b(bus|coach|flixbus|megabus)\b/i, 'bus'],
  [/\b(taxi|transfer|uber)\b/i, 'taxi'],
  [/\b(car|rental|hire)\b/i, 'car'],
];

/** The automatic icon: for travel a guess from the title, otherwise the type's default. */
export function guessIcon(e: { type: EntryType; title: string }): EntryIcon {
  if (e.type === 'travel') {
    for (const [pattern, icon] of TRAVEL_GUESSES) if (pattern.test(e.title)) return icon;
  }
  return DEFAULT_ICON[e.type];
}

/** The emoji to show: the chosen icon, or the automatic one. */
export function entryIcon(e: { type: EntryType; title: string; icon?: string | null }): string {
  const chosen = e.icon ? ENTRY_ICONS[e.icon as EntryIcon] : undefined;
  return (chosen ?? ENTRY_ICONS[guessIcon(e)]).emoji;
}

export const STATUS_META: Record<EntryStatus, { label: string; pill: string }> = {
  idea: { label: 'Idea', pill: 'bg-violet-100 text-violet-800' },
  tentative: { label: 'Tentative', pill: 'bg-amber-100 text-amber-800' },
  booked: { label: 'Booked', pill: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', pill: 'bg-stone-200 text-stone-600' },
};

// ---------------------------------------------------------------------------
// Imports

export const IMPORT_STATUS: Record<ImportStatus, { label: string; pill: string }> = {
  received: { label: 'Queued', pill: 'bg-stone-200 text-stone-700' },
  processing: { label: 'Processing…', pill: 'bg-sky-100 text-sky-800' },
  done: { label: 'Imported', pill: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Failed', pill: 'bg-red-100 text-red-800' },
};

export function isImportPending(imp: ImportSummary): boolean {
  return imp.status === 'received' || imp.status === 'processing';
}

/** One line on what an import did. */
export function summariseImport(imp: ImportSummary): string {
  if (imp.status === 'failed') return imp.error ?? 'Failed';
  if (isImportPending(imp)) return 'Reading the email…';
  const r = imp.result;
  if (!r || r.entry_ids.length === 0) return r?.message ?? 'Nothing imported';
  return `${plural(r.entry_ids.length, 'entry', 'entries')} → ${r.trip_name}${r.created_trip ? ' (new trip)' : ''}`;
}

/** A stored UTC timestamp in the viewer's zone, e.g. "13 Sept 2026, 17:45". */
export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function timeWithZone(date: LocalDate, time: string | null, tz: string | null): string {
  if (!time) return '';
  return tz ? `${time} ${tzAbbreviation(tz, date, time)}` : time;
}

/** Human description of when an entry happens, for the detail view. */
export function describeWhen(e: Entry, currentYear: number): { start: string; end: string | null } {
  if (!e.start_date) return { start: 'Unscheduled', end: null };

  const startTime = timeWithZone(e.start_date, e.start_time, e.start_tz);
  const start = [formatDay(e.start_date, currentYear), startTime].filter(Boolean).join(', ');
  if (!e.end_date) return { start, end: null };

  const endTime = timeWithZone(e.end_date, e.end_time, e.end_tz);
  const sameDay = e.end_date === e.start_date;
  let end = sameDay ? endTime : [formatDay(e.end_date, currentYear), endTime].filter(Boolean).join(', ');
  if (e.type === 'accommodation' && !sameDay) {
    end += ` (${plural(diffDays(e.start_date, e.end_date), 'night')})`;
  }
  return { start, end };
}
