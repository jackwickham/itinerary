import { useEffect, useState, type FormEvent } from 'react';
import { groupTripsForHome, todayLocal } from '../../shared/dates';
import type { Trip } from '../../shared/schemas';
import { api, errorMessage } from '../api';
import { formatDateRange, yearOf } from '../format';
import { Button, FormError, inputClass } from './ui';

/**
 * Pick a trip to move things into, soonest first, optionally creating a new one
 * on the spot (for when an import landed in the wrong trip and the right one
 * doesn't exist yet).
 */
export function TripPicker({
  excludeId,
  allowCreate,
  onPick,
}: {
  excludeId?: number;
  allowCreate?: boolean;
  onPick: (trip: Trip) => void;
}) {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listTrips().then(setTrips, (err) => setError(errorMessage(err)));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onPick(await api.createTrip({ name: newName }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const today = todayLocal();
  const groups = trips ? groupTripsForHome(trips.filter((t) => t.id !== excludeId), today) : null;
  const ordered = groups ? [...groups.current, ...groups.upcoming, ...groups.undated, ...groups.past] : [];

  return (
    <div className="space-y-3">
      {allowCreate && (
        <form onSubmit={create} className="flex gap-2">
          <input
            className={inputClass}
            placeholder="New trip name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={busy || !newName.trim()} className="shrink-0">
            Create
          </Button>
        </form>
      )}
      <FormError message={error} />
      {!trips && !error && <p className="text-sm text-stone-500">Loading trips…</p>}
      {trips && ordered.length === 0 && <p className="text-sm text-stone-500">No other trips.</p>}
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
        {ordered.map((trip) => (
          <li key={trip.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                onPick(trip);
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-stone-50"
            >
              <span className="font-medium">{trip.name}</span>
              <span className="shrink-0 text-sm text-stone-500">
                {formatDateRange(trip.start_date, trip.end_date, yearOf(today)) ?? 'No dates'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
