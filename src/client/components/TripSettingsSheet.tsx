import { useState, type FormEvent } from 'react';
import type { Trip } from '../../shared/schemas';
import { api, errorMessage } from '../api';
import { formatDay, plural } from '../format';
import { Sheet } from './Sheet';
import { TripPicker } from './TripPicker';
import { Button, Field, FormError, inputClass } from './ui';

type View = 'edit' | 'merge' | 'confirm-merge' | 'delete';

/** Rename, set or reset dates, merge into another trip, or delete. */
export function TripSettingsSheet({
  trip,
  currentYear,
  onClose,
  onSaved,
  onMerged,
  onDeleted,
}: {
  trip: Trip;
  currentYear: number;
  onClose: () => void;
  onSaved: () => void;
  onMerged: (target: Trip) => void;
  onDeleted: () => void;
}) {
  const [view, setView] = useState<View>('edit');
  const [name, setName] = useState(trip.name);
  const [start, setStart] = useState(trip.start_date_override ?? '');
  const [end, setEnd] = useState(trip.end_date_override ?? '');
  const [mergeTarget, setMergeTarget] = useState<Trip | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await api.updateTrip(trip.id, {
        name,
        start_date_override: start || null,
        end_date_override: end || null,
      });
      onSaved();
    });
  }

  const dateField = (
    label: string,
    value: string,
    setValue: (v: string) => void,
    inferred: string | null,
  ) => (
    <Field
      label={label}
      hint={
        value ? (
          <>
            Set manually.{' '}
            <button type="button" className="text-teal-700 underline" onClick={() => setValue('')}>
              {inferred ? `Use bookings (${formatDay(inferred, currentYear)})` : 'Clear'}
            </button>
          </>
        ) : inferred ? (
          `From bookings: ${formatDay(inferred, currentYear)}`
        ) : (
          'No bookings yet'
        )
      }
    >
      <input type="date" className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} />
    </Field>
  );

  let body;
  if (view === 'merge') {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          Move all {plural(trip.entry_count, 'entry', 'entries')} into another trip, then delete “
          {trip.name}”.
        </p>
        <TripPicker
          excludeId={trip.id}
          onPick={(target) => {
            setMergeTarget(target);
            setView('confirm-merge');
          }}
        />
        <Button onClick={() => setView('edit')}>Back</Button>
      </div>
    );
  } else if (view === 'confirm-merge' && mergeTarget) {
    body = (
      <div className="space-y-4">
        <p>
          Move everything from “{trip.name}” into “{mergeTarget.name}” and delete “{trip.name}”?
        </p>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={() => setView('merge')}>Back</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const { target } = await api.mergeTrip(trip.id, mergeTarget.id);
                onMerged(target);
              })
            }
          >
            Merge
          </Button>
        </div>
      </div>
    );
  } else if (view === 'delete') {
    body = (
      <div className="space-y-4">
        <p>
          Delete “{trip.name}”
          {trip.entry_count > 0 && ` and its ${plural(trip.entry_count, 'entry', 'entries')}`}? This
          can’t be undone.
        </p>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={() => setView('edit')}>Cancel</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api.deleteTrip(trip.id);
                onDeleted();
              })
            }
          >
            Delete trip
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <form onSubmit={save} className="space-y-5">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {dateField('Start', start, setStart, trip.inferred_start_date)}
          {dateField('End', end, setEnd, trip.inferred_end_date)}
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            Save
          </Button>
        </div>

        <div className="space-y-2 border-t border-stone-100 pt-4">
          <Button className="w-full" onClick={() => setView('merge')}>
            Merge into another trip…
          </Button>
          <Button className="w-full text-red-700" onClick={() => setView('delete')}>
            Delete trip…
          </Button>
        </div>
      </form>
    );
  }

  return (
    <Sheet title={trip.name} onClose={onClose}>
      {body}
    </Sheet>
  );
}
