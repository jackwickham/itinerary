import { useState, type FormEvent } from 'react';
import type { Trip } from '../../shared/schemas';
import { api, errorMessage } from '../api';
import { Sheet } from './Sheet';
import { Button, Field, FormError, inputClass } from './ui';

export function NewTripSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (trip: Trip) => void }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [showDates, setShowDates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onCreated(
        await api.createTrip({ name, start_date_override: start || null, end_date_override: end || null }),
      );
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Sheet title="New trip" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lisbon"
            autoFocus
            required
          />
        </Field>

        {showDates ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <input type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="End">
              <input type="date" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <p className="col-span-2 text-xs text-stone-500">
              Leave blank to work the dates out from your bookings.
            </p>
          </div>
        ) : (
          <button type="button" className="text-sm text-teal-700" onClick={() => setShowDates(true)}>
            + Set dates now (optional)
          </button>
        )}

        <FormError message={error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={saving || !name.trim()}>
            Create trip
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
