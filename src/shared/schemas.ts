import { z } from 'zod';
import { ENTRY_STATUSES, ENTRY_TYPES, ICON_KEYS, type Source } from './constants.js';
import { canonicalTimeZone, entryInstant, isValidDateString, type LocalDate } from './dates.js';

/**
 * Validation shared by the API, the UI and email ingestion. Everything that writes
 * a trip or entry goes through these schemas, so the rules live in one place.
 */

export * from './constants.js';

// ---------------------------------------------------------------------------
// Field schemas

/** Forms submit blank inputs as empty strings; store those as null. */
const blankToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export const dateStringSchema = z
  .string()
  .refine(isValidDateString, 'Expected a date as YYYY-MM-DD');

export const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time as HH:MM');

export const timeZoneSchema = z.string().transform((value, ctx) => {
  const canonical = canonicalTimeZone(value);
  if (!canonical) {
    ctx.issues.push({ code: 'custom', message: `Unknown time zone "${value}"`, input: value });
    return z.NEVER;
  }
  return canonical;
});

const nullableDate = z.preprocess(blankToNull, dateStringSchema.nullable());
const nullableTime = z.preprocess(blankToNull, timeStringSchema.nullable());
const nullableTimeZone = z.preprocess(blankToNull, timeZoneSchema.nullable());
const nullableText = z.preprocess(blankToNull, z.string().trim().max(1000).nullable());

export const detailSchema = z.object({
  label: z.string().trim().min(1, 'Detail label is required').max(100),
  value: z.string().trim().min(1, 'Detail value is required').max(2000),
});

export type Detail = z.output<typeof detailSchema>;

// ---------------------------------------------------------------------------
// Entries

const entryShape = {
  title: z.string().trim().min(1, 'Title is required').max(300),
  type: z.enum(ENTRY_TYPES),
  status: z.enum(ENTRY_STATUSES),
  /** A key from ENTRY_ICONS; null means pick automatically from the type and title. */
  icon: z.preprocess(blankToNull, z.enum(ICON_KEYS).nullable()),
  start_date: nullableDate,
  start_time: nullableTime,
  start_tz: nullableTimeZone,
  start_location: nullableText,
  end_date: nullableDate,
  end_time: nullableTime,
  end_tz: nullableTimeZone,
  end_location: nullableText,
  details: z.array(detailSchema).max(50),
  notes: z.string().max(20000),
};

const entryObject = z.object(entryShape);

/** The editable content of an entry: everything except identity and provenance. */
export type EntryData = z.output<typeof entryObject>;

export const ENTRY_DATA_KEYS = Object.keys(entryShape) as (keyof EntryData)[];

/**
 * Tidies the scheduling fields into one canonical shape per mode (unscheduled,
 * date only, exact time, date range) so that stale values from another mode
 * never linger:
 * - no start date means no other date or time fields
 * - a zone only accompanies a time
 * - an end time with no end date is on the start date
 * - a non-travel end time with no zone shares the start's zone
 * - a date-only "range" that starts and ends on the same day is just a date
 */
export function normaliseTiming<T extends EntryData>(entry: T): T {
  const e = { ...entry };
  if (!e.start_date) {
    e.start_time = e.start_tz = e.end_date = e.end_time = e.end_tz = null;
    return e;
  }
  if (!e.start_time) e.start_tz = null;
  if (e.end_time && !e.end_date) e.end_date = e.start_date;
  if (!e.end_date) e.end_time = null;
  if (!e.end_time) e.end_tz = null;
  if (e.end_time && !e.end_tz && e.type !== 'travel') e.end_tz = e.start_tz;
  if (e.end_date === e.start_date && !e.end_time) e.end_date = null;
  return e;
}

/**
 * Checks that an entry doesn't end before it starts. Compares instants when both
 * ends have a time and zone (a flight can land at an earlier local time than it
 * left), local times when both share a zone, and otherwise just the dates.
 */
export function timingProblem(e: EntryData): { path: keyof EntryData; message: string } | null {
  if (!e.start_date || !e.end_date) return null;

  const start = entryInstant(e.start_date, e.start_time, e.start_tz);
  const end = entryInstant(e.end_date, e.end_time, e.end_tz);
  if (start !== null && end !== null) {
    return end < start ? { path: 'end_time', message: 'Ends before it starts' } : null;
  }
  if (e.start_time && e.end_time && e.start_tz === e.end_tz) {
    return `${e.end_date}T${e.end_time}` < `${e.start_date}T${e.start_time}`
      ? { path: 'end_time', message: 'Ends before it starts' }
      : null;
  }
  return e.end_date < e.start_date
    ? { path: 'end_date', message: 'End date is before the start date' }
    : null;
}

function refineTiming(entry: EntryData, ctx: z.RefinementCtx) {
  const problem = timingProblem(entry);
  if (problem) ctx.addIssue({ code: 'custom', message: problem.message, path: [problem.path] });
}

/** A complete entry, as stored. Used to validate an existing entry with a patch applied. */
export const entryDataSchema = entryObject.transform(normaliseTiming).superRefine(refineTiming);

/** A new entry. Only the title and type are required. */
export const entryCreateSchema = z
  .object({
    ...entryShape,
    status: entryShape.status.default('tentative'),
    icon: entryShape.icon.default(null),
    start_date: nullableDate.default(null),
    start_time: nullableTime.default(null),
    start_tz: nullableTimeZone.default(null),
    start_location: nullableText.default(null),
    end_date: nullableDate.default(null),
    end_time: nullableTime.default(null),
    end_tz: nullableTimeZone.default(null),
    end_location: nullableText.default(null),
    details: entryShape.details.default([]),
    notes: entryShape.notes.default(''),
  })
  .transform(normaliseTiming)
  .superRefine(refineTiming);

/** A partial update. Setting `trip_id` moves the entry to another trip. */
export const entryPatchSchema = entryObject.partial().extend({
  trip_id: z.number().int().positive().optional(),
});

export interface Entry extends EntryData {
  id: number;
  trip_id: number;
  source: Source;
  inbound_email_id: number | null;
  /** Subject of the email this entry was imported from, if any. */
  inbound_email_subject: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Trips

const tripShape = {
  name: z.string().trim().min(1, 'Name is required').max(200),
  start_date_override: nullableDate,
  end_date_override: nullableDate,
};

function refineOverrides(
  trip: { start_date_override: LocalDate | null; end_date_override: LocalDate | null },
  ctx: z.RefinementCtx,
) {
  const { start_date_override: start, end_date_override: end } = trip;
  if (start && end && end < start) {
    ctx.addIssue({
      code: 'custom',
      message: 'End date is before the start date',
      path: ['end_date_override'],
    });
  }
}

export const tripDataSchema = z.object(tripShape).superRefine(refineOverrides);

export const tripCreateSchema = z
  .object({
    ...tripShape,
    start_date_override: nullableDate.default(null),
    end_date_override: nullableDate.default(null),
  })
  .superRefine(refineOverrides);

export const tripPatchSchema = z.object(tripShape).partial();

export const moveEntriesSchema = z.object({
  target_trip_id: z.number().int().positive(),
  delete_source: z.boolean().default(false),
});

export type TripData = z.output<typeof tripDataSchema>;

export interface Trip extends TripData {
  id: number;
  source: Source;
  inferred_start_date: LocalDate | null;
  inferred_end_date: LocalDate | null;
  /** Effective dates: the override if set, otherwise the inferred date. */
  start_date: LocalDate | null;
  end_date: LocalDate | null;
  entry_count: number;
  created_at: string;
  updated_at: string;
}

export interface TripWithEntries extends Trip {
  entries: Entry[];
}

// ---------------------------------------------------------------------------
// Email imports

export type ImportStatus = 'received' | 'processing' | 'done' | 'failed';

/** What an import did, recorded when it finishes. */
export interface ImportResult {
  trip_id: number | null;
  trip_name: string | null;
  created_trip: boolean;
  entry_ids: number[];
  /** Why the trip was chosen, or why nothing was created. */
  message: string | null;
}

export interface ImportSummary {
  id: number;
  received_at: string;
  envelope_from: string | null;
  from_header: string | null;
  subject: string | null;
  status: ImportStatus;
  error: string | null;
  result: ImportResult | null;
  processed_at: string | null;
}

export interface ImportDetail extends ImportSummary {
  /** Exactly the text the model was given. */
  body_text: string | null;
  /** Raw extraction and matching output, for debugging. */
  llm_output: unknown;
  /** Entries still linked to this email, wherever they have since been moved. */
  entries: (Entry & { trip_name: string })[];
}

// ---------------------------------------------------------------------------
// LLM helpers

/** JSON Schema for a zod schema, in the shape LLM providers expect. */
export function toProviderJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}
