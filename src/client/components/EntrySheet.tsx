import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { ENTRY_STATUSES } from '../../shared/constants';
import { shiftEntryDates, todayLocal } from '../../shared/dates';
import { flightWindow, isWithinFlightWindow } from '../../shared/flights';
import type { Entry, Trip } from '../../shared/schemas';
import { api, errorMessage, type EntryPayload } from '../api';
import { STATUS_META, TYPE_META, describeWhen, entryIcon, guessIcon, mapsUrl } from '../format';
import { FlightStatusPanel } from './FlightStatusPanel';
import { Sheet } from './Sheet';
import { TripPicker } from './TripPicker';
import { Button, Field, FormError, Segmented, inputClass } from './ui';

type View = 'view' | 'move-date' | 'move-trip' | 'delete';

/**
 * Everything about one entry, plus the quick corrections: status, date, trip,
 * delete. Full edits go through the entry form.
 */
export function EntrySheet({
  entry,
  currentYear,
  onClose,
  onEdit,
  onChanged,
}: {
  entry: Entry;
  currentYear: number;
  onClose: () => void;
  onEdit: () => void;
  /** Called after any change; `message` is shown as a toast once the sheet closes. */
  onChanged: (options?: { close?: boolean; message?: string }) => void;
}) {
  const [view, setView] = useState<View>('view');
  const [moveDate, setMoveDate] = useState(entry.start_date ?? todayLocal());
  const [copied, setCopied] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, after: { close?: boolean; message?: string } = {}) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged(after);
      if (!after.close) setView('view');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const update = (data: EntryPayload, after?: { close?: boolean; message?: string }) =>
    run(() => api.updateEntry(entry.id, data), after);

  async function copy(index: number, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(index);
      setTimeout(() => setCopied((c) => (c === index ? null : c)), 1500);
    } catch {
      // Clipboard needs a secure context; the value is selectable anyway.
    }
  }

  const when = describeWhen(entry, currentYear);
  const travel = entry.type === 'travel';
  // Live status is only worth showing around the departure, and only for flights.
  const statusWindow = flightWindow(entry);
  const liveStatus = !!statusWindow && isWithinFlightWindow(statusWindow);
  const flightNumberMissing = liveStatus && !entry.flight_number && (entry.icon ?? guessIcon(entry)) === 'plane';

  let body;
  if (view === 'move-date') {
    body = (
      <div className="space-y-4">
        <Field label="New date" hint={entry.end_date ? 'The entry keeps its length.' : undefined}>
          <input type="date" className={inputClass} value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
        </Field>
        <FormError message={error} />
        <div className="flex flex-wrap justify-between gap-2">
          <Button disabled={busy} onClick={() => update(shiftEntryDates(entry, null))}>
            Make unscheduled
          </Button>
          <div className="flex gap-2">
            <Button onClick={() => setView('view')}>Back</Button>
            <Button
              variant="primary"
              disabled={busy || !moveDate}
              onClick={() => update(shiftEntryDates(entry, moveDate))}
            >
              Move
            </Button>
          </div>
        </div>
      </div>
    );
  } else if (view === 'move-trip') {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-stone-600">Move “{entry.title}” to:</p>
        <TripPicker
          excludeId={entry.trip_id}
          allowCreate
          onPick={(trip: Trip) => update({ trip_id: trip.id }, { close: true, message: `Moved to ${trip.name}` })}
        />
        <FormError message={error} />
        <Button onClick={() => setView('view')}>Back</Button>
      </div>
    );
  } else if (view === 'delete') {
    body = (
      <div className="space-y-4">
        <p>Delete “{entry.title}”? This can’t be undone.</p>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={() => setView('view')}>Cancel</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => run(() => api.deleteEntry(entry.id), { close: true, message: 'Entry deleted' })}
          >
            Delete
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <span aria-hidden>{entryIcon(entry)}</span>
          {TYPE_META[entry.type].label}
        </div>

        <Segmented
          className="grid-cols-4"
          value={entry.status}
          onChange={(status) => update({ status })}
          options={ENTRY_STATUSES.map((st) => ({ value: st, label: STATUS_META[st].label }))}
        />

        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">When</dt>
            <dd className="mt-0.5">
              {when.start}
              {when.end && (
                <>
                  <span className="text-stone-400"> → </span>
                  {when.end}
                </>
              )}
            </dd>
          </div>
          {entry.flight_number && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">Flight</dt>
              <dd className="mt-0.5">{entry.flight_number}</dd>
            </div>
          )}
          {(entry.start_location || entry.end_location) && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                {travel ? 'Route' : 'Where'}
              </dt>
              <dd className="mt-0.5">
                {[entry.start_location, entry.end_location]
                  .filter((place): place is string => !!place)
                  .map((place, i) => (
                    <Fragment key={i}>
                      {i > 0 && <span className="text-stone-400"> → </span>}
                      <a
                        href={mapsUrl(place)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-800 underline decoration-sky-800/40 underline-offset-2"
                      >
                        {place}
                      </a>
                    </Fragment>
                  ))}
              </dd>
            </div>
          )}
        </dl>

        {entry.details.length > 0 && (
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
            {entry.details.map((d, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => copy(i, d.value)}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left hover:bg-stone-50"
                >
                  <span className="shrink-0 text-sm text-stone-500">{d.label}</span>
                  <span className="min-w-0 break-words text-right font-medium select-text">
                    {copied === i ? <span className="text-teal-700">Copied ✓</span> : d.value}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {liveStatus && entry.flight_number && <FlightStatusPanel entry={entry} currentYear={currentYear} />}
        {flightNumberMissing && (
          <p className="text-sm text-stone-500">
            Add a flight number when editing to see live departure, gate and inbound aircraft details.
          </p>
        )}

        {entry.notes && <p className="whitespace-pre-wrap text-sm text-stone-700">{entry.notes}</p>}

        {entry.inbound_email_id && (
          <Link to={`/imports/${entry.inbound_email_id}`} className="block text-sm text-sky-800 underline">
            ✉ Imported from “{entry.inbound_email_subject ?? 'an email'}”
          </Link>
        )}

        <FormError message={error} />

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="primary" onClick={onEdit}>
            Edit
          </Button>
          <Button onClick={() => setView('move-date')}>Move to date…</Button>
          <Button onClick={() => setView('move-trip')}>Move to trip…</Button>
          <Button className="text-red-700" onClick={() => setView('delete')}>
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Sheet title={entry.title} onClose={onClose}>
      {body}
    </Sheet>
  );
}
