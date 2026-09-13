import { Link } from 'react-router';
import { diffDays, tripPhase, type LocalDate } from '../../shared/dates';
import type { Trip } from '../../shared/schemas';
import { formatDateRange, plural, relativeDays, yearOf } from '../format';
import { cx } from './ui';

function statusLabel(trip: Trip, today: LocalDate): string | null {
  const start = trip.start_date ?? trip.end_date;
  const end = trip.end_date ?? trip.start_date;
  if (!start || !end) return null;
  switch (tripPhase(trip, today)) {
    case 'current':
      return `Day ${diffDays(start, today) + 1} of ${diffDays(start, end) + 1}`;
    case 'upcoming':
      return relativeDays(today, start);
    case 'past':
      return relativeDays(today, end);
    default:
      return null;
  }
}

export function TripCard({ trip, today, highlight }: { trip: Trip; today: LocalDate; highlight?: boolean }) {
  const range = formatDateRange(trip.start_date, trip.end_date, yearOf(today));
  const status = statusLabel(trip, today);

  return (
    <Link
      to={`/trips/${trip.id}`}
      className={cx(
        'block rounded-2xl border p-4 transition hover:shadow-md active:scale-[0.99]',
        highlight
          ? 'border-teal-800 bg-linear-to-br from-teal-700 to-teal-900 text-white shadow-md'
          : 'border-stone-200 bg-white shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className={cx('font-semibold leading-tight', highlight ? 'text-xl' : 'text-lg')}>{trip.name}</h3>
        {status && (
          <span
            className={cx(
              'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
              highlight ? 'bg-white/20 text-white' : 'bg-teal-50 text-teal-800',
            )}
          >
            {status}
          </span>
        )}
      </div>
      <p className={cx('mt-1 text-sm', highlight ? 'text-teal-50' : 'text-stone-600')}>
        {range ?? 'No dates yet'}
      </p>
      <div className={cx('mt-3 flex flex-wrap items-center gap-2 text-xs', highlight ? 'text-teal-100' : 'text-stone-500')}>
        <span>{plural(trip.entry_count, 'entry', 'entries')}</span>
        {trip.source === 'email' && (
          <span
            className={cx(
              'rounded-full px-2 py-0.5 font-medium',
              highlight ? 'bg-white/15' : 'bg-sky-50 text-sky-800',
            )}
          >
            ✉ Auto-created
          </span>
        )}
      </div>
    </Link>
  );
}
