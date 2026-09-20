import { useCallback, useEffect, useState } from 'react';
import type { FlightAirport, FlightLeg, FlightStatus, FlightTimes } from '../../shared/flights';
import type { Entry } from '../../shared/schemas';
import { api, errorMessage } from '../api';
import { formatDelay, formatInstant, inViewerZone, type InstantReference } from '../format';
import { cx } from './ui';

/**
 * Live status for a flight, shown in the entry sheet from a day before departure.
 * The server caches what FlightAware says, so the refresh button is the only way
 * to spend another lookup.
 */
export function FlightStatusPanel({ entry, currentYear }: { entry: Entry; currentYear: number }) {
  const [status, setStatus] = useState<FlightStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(
    async (refresh: boolean) => {
      setBusy(true);
      setError(null);
      try {
        setStatus(await api.getFlightStatus(entry.id, refresh));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [entry.id],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const reference = { date: entry.start_date, currentYear };

  return (
    <section className="rounded-xl border border-stone-200">
      <header className="flex items-center justify-between gap-3 border-b border-stone-100 px-3 py-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">Live flight status</h3>
        <div className="flex items-center gap-2 text-xs text-stone-400">
          {status?.state === 'ok' || status?.state === 'not_found' ? (
            <span>Updated {formatInstant(status.fetched_at, null)}</span>
          ) : null}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-sm text-teal-700 hover:bg-stone-100 disabled:opacity-50"
          >
            {busy ? 'Checking…' : '↻ Refresh'}
          </button>
        </div>
      </header>

      <div className="space-y-3 px-3 py-3">
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!error && !status && busy && <p className="text-sm text-stone-500">Checking with FlightAware…</p>}
        {status?.state === 'ok' && <Leg leg={status.flight} reference={reference} />}
        {status?.state === 'ok' && status.inbound && (
          <Inbound leg={status.inbound} reference={reference} />
        )}
        {status?.state === 'not_found' && (
          <p className="text-sm text-stone-500">
            FlightAware has nothing for {status.ident} around this time. Check the flight number.
          </p>
        )}
        {status?.state === 'unavailable' && <p className="text-sm text-stone-500">{status.reason}</p>}
        {status?.state === 'outside_window' && (
          <p className="text-sm text-stone-500">
            {status.available_from
              ? `Status appears on ${formatInstant(status.available_from, null, reference)}, a day before departure.`
              : 'This flight is over.'}
          </p>
        )}
      </div>
    </section>
  );
}

/** The entry's own flight: where it stands at each end. */
function Leg({ leg, reference }: { leg: FlightLeg; reference: InstantReference }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{leg.ident}</span>
        {leg.status && <span className="text-sm text-stone-500">{leg.status}</span>}
      </div>

      {leg.cancelled && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">This flight is cancelled.</p>
      )}
      {leg.diverted && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">This flight was diverted.</p>
      )}

      <End
        label="Departs"
        airport={leg.origin}
        times={leg.departure}
        delay={leg.departure_delay}
        facts={[gateLabel(leg.terminal_origin, leg.gate_origin)]}
        reference={reference}
      />
      <End
        label="Arrives"
        airport={leg.destination}
        times={leg.arrival}
        delay={leg.arrival_delay}
        arrival
        facts={[
          gateLabel(leg.terminal_destination, leg.gate_destination),
          leg.baggage_claim && `Baggage ${leg.baggage_claim}`,
        ]}
        reference={reference}
      />
    </div>
  );
}

/** The aircraft's previous flight: mostly, will it get here in time. */
function Inbound({ leg, reference }: { leg: FlightLeg; reference: InstantReference }) {
  const from = leg.origin?.code ?? leg.origin?.city ?? null;
  const expected = leg.departure.estimated ?? leg.departure.scheduled;
  const departed = leg.took_off_at
    ? { lead: 'Took off', at: leg.took_off_at }
    : expected
      ? { lead: 'Not yet departed, expected', at: expected }
      : { lead: 'Not yet departed', at: null };

  return (
    <div className="space-y-2 rounded-lg bg-stone-50 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">Inbound aircraft</span>
        <span className="text-sm">
          {leg.ident}
          {from && <span className="text-stone-500"> from {from}</span>}
        </span>
      </div>
      {leg.cancelled ? (
        <p className="text-sm font-medium text-red-800">Cancelled</p>
      ) : (
        <>
          <p className="text-sm text-stone-600">
            {leg.landed_at ? (
              <>
                Landed <Moment iso={leg.landed_at} tz={leg.destination?.timezone ?? null} reference={reference} />
              </>
            ) : (
              <>
                {departed.lead}
                {departed.at && (
                  <>
                    {' '}
                    <Moment iso={departed.at} tz={leg.origin?.timezone ?? null} reference={reference} />
                  </>
                )}
              </>
            )}
          </p>
          <End
            label="Arrives"
            airport={leg.destination}
            times={leg.arrival}
            delay={leg.arrival_delay}
            arrival
            facts={[]}
            reference={reference}
          />
        </>
      )}
    </div>
  );
}

/** A time where it happens, and - when that differs - on the viewer's own clock. */
function Moment({ iso, tz, reference }: { iso: string; tz: string | null; reference: InstantReference }) {
  const local = inViewerZone(iso, tz, reference);
  return (
    <>
      <span className="font-medium text-stone-700">{formatInstant(iso, tz, reference, { zone: true })}</span>
      {local && <span className="text-stone-500"> ({local} your time)</span>}
    </>
  );
}

function gateLabel(terminal: string | null, gate: string | null): string | null {
  const parts = [terminal && `Terminal ${terminal}`, gate && `Gate ${gate}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * One end of a flight: the scheduled time struck through when it has moved, then
 * the time to work to and how far off the schedule that is.
 */
function End({
  label,
  airport,
  times,
  delay,
  arrival = false,
  facts,
  reference,
}: {
  label: string;
  airport: FlightAirport | null;
  times: FlightTimes;
  delay: number | null;
  arrival?: boolean;
  facts: (string | null | false)[];
  reference: InstantReference;
}) {
  const tz = airport?.timezone ?? null;
  const current = times.actual ?? times.estimated;
  const moved =
    current && times.scheduled && Math.abs(Date.parse(current) - Date.parse(times.scheduled)) >= 60_000;
  const shown = current ?? times.scheduled;
  const lateness = formatDelay(delay);
  const local = shown ? inViewerZone(shown, tz, reference) : null;
  const state = times.actual ? (arrival ? 'Arrived' : 'Departed') : times.estimated ? 'Expected' : 'Scheduled';
  const shownFacts = facts.filter((fact): fact is string => !!fact);

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm text-stone-500">
          {label}
          {airport?.code ? ` · ${airport.code}` : ''}
        </div>
        {shownFacts.length > 0 && <div className="text-sm font-medium">{shownFacts.join(' · ')}</div>}
      </div>
      <div className="shrink-0 text-right">
        <div>
          {moved && (
            <span className="mr-1.5 text-stone-400 line-through">{formatInstant(times.scheduled!, tz, reference)}</span>
          )}
          {shown ? (
            <span className="font-medium">{formatInstant(shown, tz, reference, { zone: true })}</span>
          ) : (
            <span className="text-stone-400">—</span>
          )}
        </div>
        <div className="text-xs text-stone-500">
          {state}
          {lateness && <span className={cx('ml-1', lateness.tone)}>{lateness.text}</span>}
        </div>
        {shown && local && <div className="text-xs text-stone-400">{local} your time</div>}
      </div>
    </div>
  );
}
