import { describe, expect, it } from 'vitest';
import { createEntry, deleteEntry, getEntry, updateEntry } from '../src/server/services/entries.js';
import {
  createTrip,
  deleteTrip,
  getTrip,
  getTripWithEntries,
  listTrips,
  moveAllEntries,
  updateTrip,
} from '../src/server/services/trips.js';

const entry = (overrides: Record<string, unknown> = {}) => ({
  title: 'Something',
  type: 'activity',
  status: 'booked',
  ...overrides,
});

describe('trip date inference', () => {
  it('uses booked and tentative entries only', () => {
    const trip = createTrip({ name: 'Lisbon' });
    createEntry(trip.id, entry({ start_date: '2027-03-12' }));
    createEntry(trip.id, entry({ status: 'tentative', start_date: '2027-03-14', end_date: '2027-03-16' }));
    createEntry(trip.id, entry({ status: 'idea', start_date: '2027-03-01' }));
    createEntry(trip.id, entry({ status: 'cancelled', start_date: '2027-03-30' }));
    createEntry(trip.id, entry({ status: 'booked' })); // unscheduled

    const t = getTrip(trip.id);
    expect(t).toMatchObject({
      inferred_start_date: '2027-03-12',
      inferred_end_date: '2027-03-16',
      start_date: '2027-03-12',
      end_date: '2027-03-16',
      entry_count: 5,
    });
  });

  it('has no dates until something is committed', () => {
    const trip = createTrip({ name: 'Someday' });
    createEntry(trip.id, entry({ status: 'idea', start_date: '2027-03-01' }));
    expect(getTrip(trip.id)).toMatchObject({ start_date: null, end_date: null });
  });

  it('lets each date be overridden and reset independently', () => {
    const trip = createTrip({ name: 'Lisbon' });
    createEntry(trip.id, entry({ start_date: '2027-03-12', end_date: '2027-03-15' }));

    expect(updateTrip(trip.id, { end_date_override: '2027-03-18' })).toMatchObject({
      start_date: '2027-03-12',
      end_date: '2027-03-18',
    });
    expect(updateTrip(trip.id, { end_date_override: null })).toMatchObject({ end_date: '2027-03-15' });
  });

  it('rejects inverted overrides', () => {
    expect(() =>
      createTrip({ name: 'x', start_date_override: '2027-03-12', end_date_override: '2027-03-10' }),
    ).toThrow(/before the start/);
  });
});

describe('entries', () => {
  it('moves between trips and dates', () => {
    const a = createTrip({ name: 'A' });
    const b = createTrip({ name: 'B' });
    const e = createEntry(a.id, entry({ start_date: '2027-03-12' }));

    const moved = updateEntry(e.id, { trip_id: b.id, start_date: '2027-04-01' });
    expect(moved).toMatchObject({ trip_id: b.id, start_date: '2027-04-01', title: 'Something' });
    expect(getTrip(a.id).entry_count).toBe(0);
  });

  it('re-validates the merged entry on update', () => {
    const trip = createTrip({ name: 'A' });
    const e = createEntry(trip.id, entry({ start_date: '2027-03-12', end_date: '2027-03-14' }));
    expect(() => updateEntry(e.id, { start_date: '2027-03-20' })).toThrow(/before the start/);
    expect(() => updateEntry(e.id, { trip_id: 9999 })).toThrow(/Trip not found/);
  });

  it('round-trips details', () => {
    const trip = createTrip({ name: 'A' });
    const e = createEntry(trip.id, entry({ details: [{ label: 'Booking ref', value: 'ABC123' }] }));
    expect(getEntry(e.id).details).toEqual([{ label: 'Booking ref', value: 'ABC123' }]);
  });

  it('stores, changes and clears the icon', () => {
    const trip = createTrip({ name: 'A' });
    const e = createEntry(trip.id, entry({ type: 'travel', icon: 'train' }));
    expect(getEntry(e.id).icon).toBe('train');
    expect(updateEntry(e.id, { icon: 'ferry' }).icon).toBe('ferry');
    expect(updateEntry(e.id, { icon: null }).icon).toBeNull();
  });

  it('deletes', () => {
    const trip = createTrip({ name: 'A' });
    const e = createEntry(trip.id, entry());
    deleteEntry(e.id);
    expect(() => getEntry(e.id)).toThrow(/not found/);
  });
});

describe('trips', () => {
  it('merges one trip into another', () => {
    const wrong = createTrip({ name: 'Wrong' }, { source: 'email' });
    const right = createTrip({ name: 'Right' });
    createEntry(wrong.id, entry({ start_date: '2027-03-12' }));
    createEntry(wrong.id, entry({ start_date: '2027-03-13' }));

    const { target, moved } = moveAllEntries(wrong.id, right.id, { deleteSource: true });
    expect(moved).toBe(2);
    expect(target).toMatchObject({ id: right.id, entry_count: 2, start_date: '2027-03-12' });
    expect(() => getTrip(wrong.id)).toThrow(/not found/);
  });

  it('cascades deletes to entries', () => {
    const trip = createTrip({ name: 'A' });
    const e = createEntry(trip.id, entry());
    deleteTrip(trip.id);
    expect(() => getEntry(e.id)).toThrow(/not found/);
    expect(listTrips()).toEqual([]);
  });

  it('returns entries in chronological order', () => {
    const trip = createTrip({ name: 'A' });
    createEntry(trip.id, entry({ title: 'unscheduled' }));
    createEntry(trip.id, entry({ title: 'late', start_date: '2027-03-12', start_time: '18:00' }));
    createEntry(trip.id, entry({ title: 'all day', start_date: '2027-03-12' }));
    createEntry(trip.id, entry({ title: 'first', start_date: '2027-03-11' }));
    expect(getTripWithEntries(trip.id).entries.map((e) => e.title)).toEqual([
      'first',
      'all day',
      'late',
      'unscheduled',
    ]);
  });
});
