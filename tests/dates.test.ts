import { describe, expect, it } from 'vitest';
import {
  addDays,
  canonicalTimeZone,
  diffDays,
  effectiveTripDates,
  entryInstant,
  groupTimeline,
  groupTripsForHome,
  isValidDateString,
  shiftEntryDates,
  tripPhase,
  type TimelineEntry,
} from '../src/shared/dates.js';

describe('local date helpers', () => {
  it('validates real calendar dates only', () => {
    expect(isValidDateString('2027-02-28')).toBe(true);
    expect(isValidDateString('2027-02-29')).toBe(false);
    expect(isValidDateString('2028-02-29')).toBe(true);
    expect(isValidDateString('2027-2-1')).toBe(false);
  });

  it('does date arithmetic across month and DST boundaries', () => {
    expect(addDays('2027-03-27', 2)).toBe('2027-03-29');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(diffDays('2027-03-01', '2027-04-01')).toBe(31);
    expect(diffDays('2027-04-01', '2027-03-01')).toBe(-31);
  });

  it('canonicalises time zones', () => {
    expect(canonicalTimeZone('europe/london')).toBe('Europe/London');
    expect(canonicalTimeZone('Mars/Olympus')).toBeNull();
  });

  it('computes instants in a zone', () => {
    expect(entryInstant('2027-07-01', '12:00', 'Europe/London')).toBe(Date.UTC(2027, 6, 1, 11, 0));
    expect(entryInstant('2027-07-01', null, 'Europe/London')).toBeNull();
  });
});

describe('trip dates', () => {
  it('prefers overrides per field', () => {
    const inferred = { start: '2027-03-10', end: '2027-03-15' };
    expect(effectiveTripDates({ start: null, end: '2027-03-20' }, inferred)).toEqual({
      start_date: '2027-03-10',
      end_date: '2027-03-20',
    });
    expect(effectiveTripDates({ start: '2027-03-08', end: null }, inferred)).toEqual({
      start_date: '2027-03-08',
      end_date: '2027-03-15',
    });
  });

  it('never produces an inverted range', () => {
    expect(
      effectiveTripDates({ start: '2027-04-01', end: null }, { start: '2027-03-10', end: '2027-03-15' }),
    ).toEqual({ start_date: '2027-04-01', end_date: '2027-04-01' });
  });

  it('classifies trips relative to today', () => {
    const today = '2027-03-12';
    expect(tripPhase({ start_date: '2027-03-10', end_date: '2027-03-15' }, today)).toBe('current');
    expect(tripPhase({ start_date: '2027-03-12', end_date: '2027-03-12' }, today)).toBe('current');
    expect(tripPhase({ start_date: '2027-03-13', end_date: '2027-03-15' }, today)).toBe('upcoming');
    expect(tripPhase({ start_date: '2027-03-01', end_date: '2027-03-11' }, today)).toBe('past');
    expect(tripPhase({ start_date: null, end_date: null }, today)).toBe('undated');
    expect(tripPhase({ start_date: '2027-03-20', end_date: null }, today)).toBe('upcoming');
  });

  it('orders home page groups', () => {
    const trips = [
      { id: 1, start_date: '2027-06-01', end_date: '2027-06-05' },
      { id: 2, start_date: '2027-04-01', end_date: '2027-04-05' },
      { id: 3, start_date: '2027-03-10', end_date: '2027-03-15' },
      { id: 4, start_date: null, end_date: null },
      { id: 5, start_date: '2027-01-01', end_date: '2027-01-05' },
      { id: 6, start_date: '2027-02-01', end_date: '2027-02-05' },
    ];
    const groups = groupTripsForHome(trips, '2027-03-12');
    expect(groups.current.map((t) => t.id)).toEqual([3]);
    expect(groups.upcoming.map((t) => t.id)).toEqual([2, 1]);
    expect(groups.undated.map((t) => t.id)).toEqual([4]);
    expect(groups.past.map((t) => t.id)).toEqual([6, 5]);
  });
});

describe('shiftEntryDates', () => {
  it('keeps the length of a range', () => {
    expect(shiftEntryDates({ start_date: '2027-03-10', end_date: '2027-03-13' }, '2027-03-20')).toEqual({
      start_date: '2027-03-20',
      end_date: '2027-03-23',
    });
  });

  it('schedules and unschedules', () => {
    expect(shiftEntryDates({ start_date: null, end_date: null }, '2027-03-20')).toEqual({
      start_date: '2027-03-20',
      end_date: null,
    });
    expect(shiftEntryDates({ start_date: '2027-03-10', end_date: '2027-03-13' }, null)).toEqual({
      start_date: null,
      end_date: null,
    });
  });
});

describe('groupTimeline', () => {
  const entry = (overrides: Partial<TimelineEntry> & { id: number }): TimelineEntry => ({
    type: 'activity',
    start_date: null,
    start_time: null,
    end_date: null,
    end_time: null,
    ...overrides,
  });

  it('includes every day of the range and separates unscheduled entries', () => {
    const timeline = groupTimeline(
      [entry({ id: 1, start_date: '2027-03-11' }), entry({ id: 2 })],
      { start: '2027-03-10', end: '2027-03-12' },
    );
    expect(timeline.days.map((d) => [d.date, d.dayNumber, d.items.length])).toEqual([
      ['2027-03-10', 1, 0],
      ['2027-03-11', 2, 1],
      ['2027-03-12', 3, 0],
    ]);
    expect(timeline.unscheduled.map((e) => e.id)).toEqual([2]);
  });

  it('adds days outside the range for entries that fall there', () => {
    const timeline = groupTimeline([entry({ id: 1, start_date: '2027-03-20' })], {
      start: '2027-03-10',
      end: '2027-03-11',
    });
    expect(timeline.days.map((d) => [d.date, d.dayNumber])).toEqual([
      ['2027-03-10', 1],
      ['2027-03-11', 2],
      ['2027-03-20', null],
    ]);
  });

  it('shows stays on their start and end days with continuations between', () => {
    const hotel = entry({
      id: 1,
      type: 'accommodation',
      start_date: '2027-03-10',
      start_time: '15:00',
      end_date: '2027-03-13',
      end_time: '11:00',
    });
    const timeline = groupTimeline([hotel], { start: null, end: null });
    expect(timeline.days.map((d) => [d.date, d.items.map((i) => i.kind)])).toEqual([
      ['2027-03-10', ['full']],
      ['2027-03-11', ['continuation']],
      ['2027-03-12', ['continuation']],
      ['2027-03-13', ['end']],
    ]);
  });

  it('shows overnight travel only on its departure day', () => {
    const flight = entry({
      id: 1,
      type: 'travel',
      start_date: '2027-03-10',
      start_time: '22:00',
      end_date: '2027-03-11',
      end_time: '06:00',
    });
    const timeline = groupTimeline([flight], { start: null, end: null });
    expect(timeline.days.map((d) => d.date)).toEqual(['2027-03-10']);
  });

  it('orders a day: continuations, date-only, then by local time, check-outs first', () => {
    const items = groupTimeline(
      [
        entry({ id: 1, start_date: '2027-03-11', start_time: '19:00' }),
        entry({ id: 2, start_date: '2027-03-11' }),
        entry({ id: 3, type: 'accommodation', start_date: '2027-03-10', end_date: '2027-03-12' }),
        entry({ id: 4, type: 'accommodation', start_date: '2027-03-09', end_date: '2027-03-11', end_time: '11:00' }),
        entry({ id: 5, type: 'accommodation', start_date: '2027-03-11', start_time: '11:00', end_date: '2027-03-13' }),
        entry({ id: 6, start_date: '2027-03-11', start_time: '08:30' }),
      ],
      { start: null, end: null },
    ).days.find((d) => d.date === '2027-03-11')!.items;

    expect(items.map((i) => [i.entry.id, i.kind])).toEqual([
      [3, 'continuation'],
      [2, 'full'],
      [6, 'full'],
      [4, 'end'],
      [5, 'full'],
      [1, 'full'],
    ]);
  });
});
