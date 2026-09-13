import { useEffect, useState, type FormEvent } from 'react';
import {
  ENTRY_STATUSES,
  ENTRY_TYPES,
  ICONS_BY_TYPE,
  type EntryIcon,
  type EntryStatus,
  type EntryType,
} from '../../shared/constants';
import { canonicalTimeZone, type LocalDate } from '../../shared/dates';
import type { Detail, Entry, EntryData, Trip } from '../../shared/schemas';
import { api, errorMessage, type EntryPayload } from '../api';
import { STATUS_META, TYPE_META, browserTimeZone, suggestTimeZone } from '../format';
import { DetailsEditor, cleanDetails } from './DetailsEditor';
import { IconPicker } from './IconPicker';
import { Sheet } from './Sheet';
import { TimezoneDatalist, TimezoneInput } from './TimezoneInput';
import { Button, Field, Segmented, inputClass } from './ui';

export type EntryFormTarget =
  | { mode: 'create'; tripId: number; defaults?: Partial<EntryData> }
  | { mode: 'edit'; entry: Entry };

/** The four ways an entry can be scheduled; each shows only the fields it needs. */
type WhenMode = 'unscheduled' | 'date' | 'time' | 'range';

interface FormState {
  title: string;
  type: EntryType;
  status: EntryStatus;
  icon: EntryIcon | null;
  mode: WhenMode;
  start_date: string;
  start_time: string;
  start_tz: string;
  start_location: string;
  end_date: string;
  end_time: string;
  end_tz: string;
  end_location: string;
  details: Detail[];
  notes: string;
  trip_id: number;
}

function detectMode(e: Partial<EntryData>): WhenMode {
  if (!e.start_date) return 'unscheduled';
  const multiDay = !!e.end_date && e.end_date !== e.start_date;
  if (e.start_time) return multiDay && e.type !== 'travel' ? 'range' : 'time';
  return multiDay ? 'range' : 'date';
}

function initialState(target: EntryFormTarget, entries: Entry[]): FormState {
  const e: Partial<EntryData> =
    target.mode === 'edit' ? target.entry : { type: 'activity', status: 'booked', ...target.defaults };
  const defaultTz = suggestTimeZone(entries, e.start_date ?? null, browserTimeZone());
  return {
    title: e.title ?? '',
    type: e.type ?? 'activity',
    status: e.status ?? 'booked',
    icon: e.icon ?? null,
    mode: detectMode(e),
    start_date: e.start_date ?? '',
    start_time: e.start_time ?? '',
    start_tz: e.start_tz ?? defaultTz,
    start_location: e.start_location ?? '',
    end_date: e.end_date ?? '',
    end_time: e.end_time ?? '',
    end_tz: e.end_tz ?? '',
    end_location: e.end_location ?? '',
    details: e.details ?? [],
    notes: e.notes ?? '',
    trip_id: target.mode === 'edit' ? target.entry.trip_id : target.tripId,
  };
}

/** Builds the API payload, clearing every scheduling field the chosen mode doesn't use. */
function toPayload(s: FormState): EntryPayload {
  const travel = s.type === 'travel';
  const base = {
    title: s.title,
    type: s.type,
    status: s.status,
    icon: s.icon,
    start_location: s.start_location,
    end_location: s.end_location,
    details: cleanDetails(s.details),
    notes: s.notes,
    start_date: null as string | null,
    start_time: null as string | null,
    start_tz: null as string | null,
    end_date: null as string | null,
    end_time: null as string | null,
    end_tz: null as string | null,
  };
  const endTz = s.end_time ? (travel ? s.end_tz || s.start_tz : s.start_tz) : null;

  switch (s.mode) {
    case 'unscheduled':
      return base;
    case 'date':
      return { ...base, start_date: s.start_date };
    case 'time':
      return {
        ...base,
        start_date: s.start_date,
        start_time: s.start_time,
        start_tz: s.start_tz,
        end_date: s.end_time ? (travel && s.end_date) || s.start_date : null,
        end_time: s.end_time || null,
        end_tz: endTz,
      };
    case 'range':
      return {
        ...base,
        start_date: s.start_date,
        end_date: s.end_date,
        start_time: s.start_time || null,
        start_tz: s.start_time ? s.start_tz : null,
        end_time: s.end_time || null,
        end_tz: endTz,
      };
  }
}

function validate(s: FormState): string | null {
  if (!s.title.trim()) return 'Give it a title';
  if (s.mode !== 'unscheduled' && !s.start_date) return 'Choose a date';
  if (s.mode === 'time' && !s.start_time) return 'Choose a time';
  if (s.mode === 'range' && !s.end_date) return 'Choose an end date';
  const zones = [s.start_tz, s.type === 'travel' ? s.end_tz : ''].filter((z) => z.trim());
  if (s.mode !== 'unscheduled' && s.mode !== 'date' && zones.some((z) => !canonicalTimeZone(z))) {
    return 'Unknown time zone';
  }
  return null;
}

export function EntryForm({
  target,
  entries,
  suggestedDate,
  onClose,
  onSaved,
}: {
  target: EntryFormTarget;
  /** The trip's entries, for suggesting a time zone. */
  entries: Entry[];
  /** Pre-filled when switching from unscheduled to a dated mode. */
  suggestedDate: LocalDate | null;
  onClose: () => void;
  onSaved: (entry: Entry, movedToTrip: Trip | null) => void;
}) {
  const [s, setState] = useState(() => initialState(target, entries));
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [showEndLocation, setShowEndLocation] = useState(!!s.end_location);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = target.mode === 'edit';
  const travel = s.type === 'travel';
  const stay = s.type === 'accommodation';

  useEffect(() => {
    if (editing) api.listTrips().then(setTrips, () => setTrips([]));
  }, [editing]);

  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  /** Changing type drops a chosen icon that belongs to another type (back to Auto). */
  function setType(type: EntryType) {
    setState((prev) => ({
      ...prev,
      type,
      icon: prev.icon && !ICONS_BY_TYPE[type].includes(prev.icon) ? null : prev.icon,
    }));
  }

  function setMode(mode: WhenMode) {
    setState((prev) => ({
      ...prev,
      mode,
      start_date: prev.start_date || (mode !== 'unscheduled' ? (suggestedDate ?? '') : ''),
    }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validate(s);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = toPayload(s);
      if (target.mode === 'create') {
        onSaved(await api.createEntry(s.trip_id, payload), null);
      } else {
        const moving = s.trip_id !== target.entry.trip_id;
        const saved = await api.updateEntry(target.entry.id, moving ? { ...payload, trip_id: s.trip_id } : payload);
        onSaved(saved, moving ? (trips?.find((t) => t.id === s.trip_id) ?? null) : null);
      }
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  const input = (key: keyof FormState, type = 'text', extra: Record<string, unknown> = {}) => (
    <input
      type={type}
      className={inputClass}
      value={s[key] as string}
      onChange={(e) => set(key)(e.target.value as never)}
      {...extra}
    />
  );

  return (
    <Sheet
      title={editing ? 'Edit entry' : 'New entry'}
      onClose={onClose}
      footer={
        <>
          {error && <p className="mr-auto min-w-0 text-sm text-red-700">{error}</p>}
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="entry-form" variant="primary" disabled={saving}>
            {editing ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <form id="entry-form" onSubmit={submit} className="space-y-5" noValidate>
        <TimezoneDatalist />

        <Field label="Title">
          {input('title', 'text', {
            placeholder: travel ? 'e.g. BA 432 London → Lisbon' : 'What is it?',
            autoFocus: !editing,
          })}
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-stone-700">Type</span>
          <Segmented
            className="grid-cols-3"
            value={s.type}
            onChange={setType}
            options={ENTRY_TYPES.map((t) => ({
              value: t,
              label: (
                <span className="flex flex-col items-center gap-0.5 leading-tight">
                  <span aria-hidden>{TYPE_META[t].icon}</span>
                  <span className="text-xs">{TYPE_META[t].label}</span>
                </span>
              ),
            }))}
          />
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-stone-700">Icon</span>
          <IconPicker type={s.type} title={s.title} value={s.icon} onChange={set('icon')} />
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-stone-700">Status</span>
          <Segmented
            className="grid-cols-4"
            value={s.status}
            onChange={set('status')}
            options={ENTRY_STATUSES.map((st) => ({ value: st, label: STATUS_META[st].label }))}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-1 block text-sm font-medium text-stone-700">When</legend>
          <Segmented
            className="grid-cols-4"
            value={s.mode}
            onChange={setMode}
            options={[
              { value: 'unscheduled', label: 'Sometime' },
              { value: 'date', label: 'Date' },
              { value: 'time', label: 'Time' },
              { value: 'range', label: 'Range' },
            ]}
          />

          {s.mode === 'unscheduled' && (
            <p className="text-sm text-stone-500">Shown under "Unscheduled & ideas" until you give it a date.</p>
          )}

          {s.mode === 'date' && <Field label="Date">{input('start_date', 'date')}</Field>}

          {s.mode === 'time' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={travel ? 'Departs' : 'Date'}>{input('start_date', 'date')}</Field>
                <Field label={travel ? 'Departure time' : 'Start time'}>{input('start_time', 'time')}</Field>
              </div>
              <Field label={travel ? 'Departure time zone' : 'Time zone'}>
                <TimezoneInput value={s.start_tz} onChange={set('start_tz')} />
              </Field>
              {travel ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Arrives">{input('end_date', 'date', { placeholder: s.start_date })}</Field>
                    <Field label="Arrival time">{input('end_time', 'time')}</Field>
                  </div>
                  <Field label="Arrival time zone" hint="Leave blank if it's the same as departure">
                    <TimezoneInput value={s.end_tz} onChange={set('end_tz')} placeholder="Same as departure" />
                  </Field>
                </>
              ) : (
                <Field label="End time (optional)">{input('end_time', 'time')}</Field>
              )}
            </>
          )}

          {s.mode === 'range' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={stay ? 'Check-in' : 'From'}>{input('start_date', 'date')}</Field>
                <Field label={stay ? 'Check-out' : 'To'}>{input('end_date', 'date')}</Field>
                <Field label={stay ? 'Check-in time' : 'Start time'}>{input('start_time', 'time')}</Field>
                <Field label={stay ? 'Check-out time' : 'End time'}>{input('end_time', 'time')}</Field>
              </div>
              {(s.start_time || s.end_time) && (
                <Field label="Time zone">
                  <TimezoneInput value={s.start_tz} onChange={set('start_tz')} />
                </Field>
              )}
            </>
          )}
        </fieldset>

        {travel ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">{input('start_location', 'text', { placeholder: 'e.g. London Heathrow' })}</Field>
            <Field label="To">{input('end_location', 'text', { placeholder: 'e.g. Lisbon' })}</Field>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label={stay ? 'Address' : 'Location'}>{input('start_location')}</Field>
            {showEndLocation ? (
              <Field label="End location">{input('end_location')}</Field>
            ) : (
              <button type="button" className="text-sm text-teal-700" onClick={() => setShowEndLocation(true)}>
                + End location
              </button>
            )}
          </div>
        )}

        <div>
          <span className="mb-1 block text-sm font-medium text-stone-700">Details</span>
          <DetailsEditor value={s.details} onChange={set('details')} />
        </div>

        <Field label="Notes">
          <textarea
            className={`${inputClass} min-h-24`}
            value={s.notes}
            onChange={(e) => set('notes')(e.target.value)}
          />
        </Field>

        {editing && trips && trips.length > 1 && (
          <Field label="Trip">
            <select
              className={inputClass}
              value={s.trip_id}
              onChange={(e) => set('trip_id')(Number(e.target.value))}
            >
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        )}

      </form>
    </Sheet>
  );
}
