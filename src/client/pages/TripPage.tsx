import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { groupTimeline, todayLocal, tripPhase, type LocalDate, type TimelineDay } from '../../shared/dates';
import type { Entry, EntryData, TripWithEntries } from '../../shared/schemas';
import { api, errorMessage } from '../api';
import { DaySection } from '../components/DaySection';
import { EntryCard } from '../components/EntryCard';
import { EntryForm, type EntryFormTarget } from '../components/EntryForm';
import { EntrySheet } from '../components/EntrySheet';
import { useToast } from '../components/Toast';
import { TripSettingsSheet } from '../components/TripSettingsSheet';
import { ErrorState, LoadingState, cx } from '../components/ui';
import { browserTimeZone, formatDateRange, formatShortDate, plural, yearOf, zonesToShow } from '../format';

type Segment = { kind: 'day'; day: TimelineDay<Entry> } | { kind: 'gap'; days: TimelineDay<Entry>[] };

/** Runs of at least this many empty days collapse into one row until expanded. */
const MIN_GAP_DAYS = 3;

/** Splits the timeline into days and collapsed runs of empty days (never hiding today). */
function segmentDays(days: TimelineDay<Entry>[], today: LocalDate, expanded: Set<string>): Segment[] {
  const segments: Segment[] = [];
  let run: TimelineDay<Entry>[] = [];
  const flush = () => {
    if (run.length >= MIN_GAP_DAYS && !expanded.has(run[0].date)) segments.push({ kind: 'gap', days: run });
    else segments.push(...run.map((day) => ({ kind: 'day' as const, day })));
    run = [];
  };
  for (const day of days) {
    if (day.items.length === 0 && day.date !== today) {
      run.push(day);
    } else {
      flush();
      segments.push({ kind: 'day', day });
    }
  }
  flush();
  return segments;
}

export default function TripPage() {
  const tripId = Number(useParams().id);
  const navigate = useNavigate();
  const toast = useToast();

  const [trip, setTrip] = useState<TripWithEntries | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<EntryFormTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [expandedGaps, setExpandedGaps] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    try {
      setTrip(await api.getTrip(tripId));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [tripId]);

  useEffect(() => {
    setTrip(null);
    load();
  }, [load]);

  const today = todayLocal();
  const currentYear = yearOf(today);

  // Jump to today when opening a trip that's under way.
  const scrolledFor = useRef<number | null>(null);
  useEffect(() => {
    if (!trip || scrolledFor.current === trip.id) return;
    scrolledFor.current = trip.id;
    if (tripPhase(trip, today) === 'current') {
      document.getElementById(`day-${today}`)?.scrollIntoView({ block: 'start' });
    }
  }, [trip, today]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!trip) return <LoadingState />;

  const cancelledCount = trip.entries.filter((e) => e.status === 'cancelled').length;
  const visible = showCancelled ? trip.entries : trip.entries.filter((e) => e.status !== 'cancelled');
  const timeline = groupTimeline(visible, { start: trip.start_date, end: trip.end_date });
  const zones = zonesToShow(timeline.days, browserTimeZone());
  const selected = trip.entries.find((e) => e.id === selectedId) ?? null;
  const range = formatDateRange(trip.start_date, trip.end_date, currentYear);
  const manualDates = trip.start_date_override !== null || trip.end_date_override !== null;
  const defaultDate: LocalDate | null = tripPhase(trip, today) === 'current' ? today : trip.start_date;

  const openCreate = (defaults: Partial<EntryData>) => setForm({ mode: 'create', tripId: trip.id, defaults });

  return (
    <div className="mx-auto max-w-2xl px-4 pb-28">
      <header className="pb-3 pt-5">
        <Link to="/" className="text-sm text-teal-700">
          ← All trips
        </Link>
        <button type="button" onClick={() => setSettingsOpen(true)} className="group mt-1 block w-full text-left">
          <h1 className="text-2xl font-bold tracking-tight">
            {trip.name}
            <span className="ml-2 align-middle text-base font-normal text-stone-400 group-hover:text-stone-600">
              ✎
            </span>
          </h1>
          <p className="text-sm text-stone-500">
            {range ?? 'No dates yet'}
            {range && (manualDates ? ' · dates set manually' : ' · from bookings')}
          </p>
        </button>
        {trip.source === 'email' && (
          <p className="mt-2 inline-block rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800">
            ✉ Auto-created from an email. Rename, merge or delete it if that was wrong.
          </p>
        )}
        {(timeline.unscheduled.length > 0 || cancelledCount > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {timeline.unscheduled.length > 0 && (
              <a href="#unscheduled" className="rounded-full bg-violet-50 px-3 py-1 text-violet-800">
                {plural(timeline.unscheduled.length, 'unscheduled idea')} ↓
              </a>
            )}
            {cancelledCount > 0 && (
              <button
                type="button"
                onClick={() => setShowCancelled((v) => !v)}
                className={cx(
                  'rounded-full px-3 py-1',
                  showCancelled ? 'bg-stone-700 text-white' : 'bg-stone-200 text-stone-700',
                )}
              >
                {showCancelled ? 'Hide' : 'Show'} {cancelledCount} cancelled
              </button>
            )}
          </div>
        )}
      </header>

      {timeline.days.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-stone-500">
          <p>No dated plans yet.</p>
          <p className="mt-1 text-sm">Add a booking or set the trip dates to build the day-by-day plan.</p>
        </div>
      ) : (
        segmentDays(timeline.days, today, expandedGaps).map((segment) =>
          segment.kind === 'day' ? (
            <DaySection
              key={segment.day.date}
              day={segment.day}
              today={today}
              currentYear={currentYear}
              zones={zones}
              onSelect={(e) => setSelectedId(e.id)}
              onAdd={(date) => openCreate({ start_date: date })}
            />
          ) : (
            <button
              key={`gap-${segment.days[0].date}`}
              type="button"
              onClick={() => setExpandedGaps((prev) => new Set(prev).add(segment.days[0].date))}
              className="my-1 flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-left text-sm text-stone-500 hover:bg-white"
            >
              <span>
                <span className="font-semibold text-stone-600">
                  {formatShortDate(segment.days[0].date)} – {formatShortDate(segment.days[segment.days.length - 1].date)}
                </span>{' '}
                · {segment.days.length} days with nothing planned
              </span>
              <span className="shrink-0 text-teal-700">Show</span>
            </button>
          ),
        )
      )}

      <section id="unscheduled" className="mt-8 scroll-mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Unscheduled &amp; ideas</h2>
          <button
            type="button"
            className="text-sm text-teal-700"
            onClick={() => openCreate({ status: 'idea', start_date: null })}
          >
            + Add idea
          </button>
        </div>
        {timeline.unscheduled.length === 0 ? (
          <p className="text-sm text-stone-500">Park things you might do, with no date yet, here.</p>
        ) : (
          <div className="space-y-2">
            {timeline.unscheduled.map((e) => (
              <EntryCard key={e.id} entry={e} hideTime onSelect={() => setSelectedId(e.id)} />
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => openCreate({ start_date: defaultDate })}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-20 rounded-full bg-teal-700 px-5 py-3.5 font-semibold text-white shadow-lg transition active:scale-95 sm:right-[max(1rem,calc(50vw-28rem))]"
      >
        + Add
      </button>

      {selected && (
        <EntrySheet
          key={selected.id}
          entry={selected}
          currentYear={currentYear}
          onClose={() => setSelectedId(null)}
          onEdit={() => {
            setSelectedId(null);
            setForm({ mode: 'edit', entry: selected });
          }}
          onChanged={({ close, message } = {}) => {
            if (close) setSelectedId(null);
            if (message) toast(message);
            load();
          }}
        />
      )}

      {form && (
        <EntryForm
          target={form}
          entries={trip.entries}
          suggestedDate={defaultDate}
          onClose={() => setForm(null)}
          onSaved={(_entry, movedTo) => {
            setForm(null);
            if (movedTo) toast(`Moved to ${movedTo.name}`);
            load();
          }}
        />
      )}

      {settingsOpen && (
        <TripSettingsSheet
          trip={trip}
          currentYear={currentYear}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            load();
          }}
          onMerged={(target) => {
            toast(`Merged into ${target.name}`);
            navigate(`/trips/${target.id}`);
            setSettingsOpen(false);
          }}
          onDeleted={() => {
            toast('Trip deleted');
            navigate('/');
          }}
        />
      )}
    </div>
  );
}
