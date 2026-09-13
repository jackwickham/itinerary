import { diffDays, type LocalDate } from '../../shared/dates';
import type { Entry } from '../../shared/schemas';
import {
  STATUS_META,
  entryIcon,
  formatDay,
  formatDuration,
  plural,
  travelDuration,
  tzAbbreviation,
} from '../format';
import { StatusPill, cx } from './ui';

interface ItemProps {
  entry: Entry;
  onSelect: (entry: Entry) => void;
}

/** The time column shared by every timeline row, so titles line up. */
function TimeColumn({ time, zone }: { time: string | null; zone?: string | null }) {
  return (
    <div className="w-12 shrink-0 text-sm leading-tight tabular-nums">
      {time && <div className="font-semibold">{time}</div>}
      {time && zone && <div className="mt-0.5 text-[11px] text-stone-500">{zone}</div>}
    </div>
  );
}

/** An entry on the day it starts. */
export function EntryCard({
  entry: e,
  onSelect,
  zones,
  hideTime,
  currentYear,
}: ItemProps & { zones?: Set<string>; hideTime?: boolean; currentYear?: number }) {
  const travel = e.type === 'travel';
  const planned = e.status === 'idea' || e.status === 'tentative';
  const cancelled = e.status === 'cancelled';
  const where = travel ? [e.start_location, e.end_location].filter(Boolean).join(' → ') : e.start_location;
  const startZone =
    zones?.has(`${e.id}:start`) && e.start_tz && e.start_date
      ? tzAbbreviation(e.start_tz, e.start_date, e.start_time)
      : null;

  let timing: string | null = null;
  if (travel && e.end_time && e.end_date && e.start_date) {
    const zone = zones?.has(`${e.id}:end`) && e.end_tz ? ` ${tzAbbreviation(e.end_tz, e.end_date, e.end_time)}` : '';
    const days = diffDays(e.start_date, e.end_date);
    const duration = travelDuration(e);
    timing = `Arrives ${e.end_time}${zone}${days > 0 ? ` (+${days})` : ''}${duration ? ` · ${formatDuration(duration)}` : ''}`;
  } else if (!travel && e.start_date && e.end_date && e.end_date !== e.start_date) {
    const until = `until ${formatDay(e.end_date, currentYear)}${e.end_time ? ` ${e.end_time}` : ''}`;
    timing = e.type === 'accommodation' ? `${plural(diffDays(e.start_date, e.end_date), 'night')} · ${until}` : until;
  } else if (e.end_time) {
    timing = `until ${e.end_time}`;
  }

  const firstDetail = e.details[0];

  return (
    <button
      type="button"
      onClick={() => onSelect(e)}
      className={cx(
        'flex w-full gap-3 rounded-xl border p-3 text-left transition hover:border-stone-400 active:scale-[0.99]',
        planned ? 'border-dashed border-stone-300 bg-white/60' : 'border-stone-200 bg-white shadow-sm',
        cancelled && 'opacity-60',
      )}
    >
      {!hideTime && <TimeColumn time={e.start_time} zone={startZone} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span aria-hidden className="leading-snug">
            {entryIcon(e)}
          </span>
          <span className={cx('min-w-0 font-medium leading-snug', cancelled && 'line-through')}>{e.title}</span>
        </div>
        {where && <p className="mt-0.5 truncate text-sm text-stone-600">{where}</p>}
        {timing && <p className="mt-0.5 text-sm text-stone-500">{timing}</p>}
        {(e.status !== 'booked' || firstDetail || e.source === 'email') && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
            {e.status !== 'booked' && <StatusPill className={STATUS_META[e.status].pill}>{STATUS_META[e.status].label}</StatusPill>}
            {firstDetail && (
              <span className="min-w-0 truncate">
                {firstDetail.label}: <span className="font-medium text-stone-700">{firstDetail.value}</span>
              </span>
            )}
            {e.source === 'email' && <span title="Imported from email">✉</span>}
          </div>
        )}
      </div>
    </button>
  );
}

/** The last day of a multi-day entry: a check-out, or the end of an activity. */
export function EndItem({ entry: e, onSelect, zones }: ItemProps & { zones?: Set<string> }) {
  const zone =
    zones?.has(`${e.id}:end`) && e.end_tz && e.end_date ? tzAbbreviation(e.end_tz, e.end_date, e.end_time) : null;
  return (
    <button
      type="button"
      onClick={() => onSelect(e)}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-stone-100/70 px-3 py-2 text-left text-sm transition hover:border-stone-400',
        e.status === 'cancelled' && 'opacity-60',
      )}
    >
      <TimeColumn time={e.end_time} zone={zone} />
      <span aria-hidden>{entryIcon(e)}</span>
      <span className="min-w-0 truncate text-stone-600">
        {e.type === 'accommodation' ? 'Check out' : 'Ends'} ·{' '}
        <span className="font-medium text-stone-800">{e.title}</span>
      </span>
    </button>
  );
}

/** A slim reminder of something spanning this day, e.g. where you're staying. */
export function ContinuationItem({ entry: e, date, onSelect }: ItemProps & { date: LocalDate }) {
  const n = diffDays(e.start_date!, date);
  const span = diffDays(e.start_date!, e.end_date!);
  const label = e.type === 'accommodation' ? `Night ${n + 1} of ${span}` : `Day ${n + 1} of ${span + 1}`;
  return (
    <button
      type="button"
      onClick={() => onSelect(e)}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-1 text-left text-xs text-stone-500 hover:bg-stone-100"
    >
      <span className="w-12 shrink-0" />
      <span aria-hidden>{entryIcon(e)}</span>
      <span className="min-w-0 flex-1 truncate">{e.title}</span>
      <span className="shrink-0">{label}</span>
    </button>
  );
}
