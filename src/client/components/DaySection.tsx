import type { LocalDate, TimelineDay } from '../../shared/dates';
import type { Entry } from '../../shared/schemas';
import { formatDay } from '../format';
import { ContinuationItem, EndItem, EntryCard } from './EntryCard';
import { cx } from './ui';

export function DaySection({
  day,
  today,
  currentYear,
  zones,
  onSelect,
  onAdd,
}: {
  day: TimelineDay<Entry>;
  today: LocalDate;
  currentYear: number;
  zones: Set<string>;
  onSelect: (entry: Entry) => void;
  onAdd: (date: LocalDate) => void;
}) {
  const isToday = day.date === today;
  const empty = day.items.length === 0;

  return (
    <section id={`day-${day.date}`} className="scroll-mt-1">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 bg-stone-50/95 px-4 py-2 backdrop-blur">
        <h2 className={cx('flex items-center gap-2 font-semibold', day.date < today && 'text-stone-500')}>
          {formatDay(day.date, currentYear)}
          {isToday && (
            <span className="rounded-full bg-teal-700 px-2 py-0.5 text-xs font-medium text-white">Today</span>
          )}
          {empty && <span className="text-sm font-normal text-stone-400">· Nothing planned</span>}
        </h2>
        <div className="flex items-center gap-1 text-sm text-stone-500">
          {day.dayNumber !== null && <span>Day {day.dayNumber}</span>}
          <button
            type="button"
            onClick={() => onAdd(day.date)}
            aria-label={`Add to ${formatDay(day.date)}`}
            className="ml-1 rounded-full px-2 py-0.5 text-lg leading-none text-teal-700 hover:bg-teal-50"
          >
            +
          </button>
        </div>
      </header>
      {!empty && (
        <div className="space-y-2 pb-4 pt-1">
          {day.items.map(({ entry, kind }) => {
            const key = `${entry.id}:${kind}`;
            if (kind === 'continuation') {
              return <ContinuationItem key={key} entry={entry} date={day.date} onSelect={onSelect} />;
            }
            if (kind === 'end') return <EndItem key={key} entry={entry} onSelect={onSelect} zones={zones} />;
            return (
              <EntryCard key={key} entry={entry} onSelect={onSelect} zones={zones} currentYear={currentYear} />
            );
          })}
        </div>
      )}
    </section>
  );
}
