import { describe, expect, it } from 'vitest';
import { entryCreateSchema } from '../src/shared/schemas.js';

describe('entry scheduling validation', () => {
  const base = { title: 'Thing', type: 'activity' as const };

  it('accepts an unscheduled entry and strips stray times', () => {
    const e = entryCreateSchema.parse({ ...base, start_time: '10:00', end_date: '2027-03-12' });
    expect(e).toMatchObject({ start_date: null, start_time: null, end_date: null });
  });

  it('treats blank form fields as null', () => {
    const e = entryCreateSchema.parse({ ...base, start_date: '', start_location: '  ' });
    expect(e.start_date).toBeNull();
    expect(e.start_location).toBeNull();
  });

  it('drops a zone that has no time', () => {
    const e = entryCreateSchema.parse({ ...base, start_date: '2027-03-12', start_tz: 'Europe/Paris' });
    expect(e.start_tz).toBeNull();
  });

  it('puts an end time with no end date on the start day, in the start zone', () => {
    const e = entryCreateSchema.parse({
      ...base,
      start_date: '2027-03-12',
      start_time: '19:00',
      start_tz: 'Europe/Paris',
      end_time: '21:30',
    });
    expect(e).toMatchObject({ end_date: '2027-03-12', end_time: '21:30', end_tz: 'Europe/Paris' });
  });

  it('collapses a same-day date-only range', () => {
    const e = entryCreateSchema.parse({ ...base, start_date: '2027-03-12', end_date: '2027-03-12' });
    expect(e.end_date).toBeNull();
  });

  it('canonicalises and rejects time zones', () => {
    const ok = entryCreateSchema.parse({
      ...base,
      start_date: '2027-03-12',
      start_time: '10:00',
      start_tz: 'asia/tokyo',
    });
    expect(ok.start_tz).toBe('Asia/Tokyo');
    expect(() =>
      entryCreateSchema.parse({ ...base, start_date: '2027-03-12', start_time: '10:00', start_tz: 'Nowhere' }),
    ).toThrow(/Unknown time zone/);
  });

  it('allows a flight that lands at an earlier local time than it departs', () => {
    // Tokyo 00:30 on the 2nd is 11:30 on the 1st in Honolulu; the flight lands 12:30 HST.
    const e = entryCreateSchema.parse({
      title: 'HND → HNL',
      type: 'travel',
      start_date: '2027-01-02',
      start_time: '00:30',
      start_tz: 'Asia/Tokyo',
      end_date: '2027-01-01',
      end_time: '12:30',
      end_tz: 'Pacific/Honolulu',
    });
    expect(e.end_date).toBe('2027-01-01');
  });

  it('tidies a flight number and rejects nonsense', () => {
    const e = entryCreateSchema.parse({ ...base, type: 'travel', flight_number: ' ba 432 ' });
    expect(e.flight_number).toBe('BA432');
    expect(entryCreateSchema.parse({ ...base, flight_number: '' }).flight_number).toBeNull();
    expect(() => entryCreateSchema.parse({ ...base, flight_number: 'Heathrow' })).toThrow(/flight number/);
  });

  it('rejects entries that end before they start', () => {
    expect(() =>
      entryCreateSchema.parse({ ...base, start_date: '2027-03-12', end_date: '2027-03-10' }),
    ).toThrow(/before the start/);
    expect(() =>
      entryCreateSchema.parse({ ...base, start_date: '2027-03-12', start_time: '19:00', end_time: '18:00' }),
    ).toThrow(/Ends before it starts/);
  });

  it('keeps a travel arrival zone unknown rather than guessing', () => {
    const e = entryCreateSchema.parse({
      title: 'Train',
      type: 'travel',
      start_date: '2027-03-12',
      start_time: '09:00',
      start_tz: 'Europe/London',
      end_time: '12:30',
    });
    expect(e.end_tz).toBeNull();
  });
});

describe('entry icons', () => {
  const base = { title: 'Thing', type: 'travel' as const };

  it('defaults to automatic', () => {
    expect(entryCreateSchema.parse(base).icon).toBeNull();
    expect(entryCreateSchema.parse({ ...base, icon: '' }).icon).toBeNull();
  });

  it('accepts known icons and rejects others', () => {
    expect(entryCreateSchema.parse({ ...base, icon: 'train' }).icon).toBe('train');
    expect(() => entryCreateSchema.parse({ ...base, icon: 'rocket' })).toThrow();
  });
});
