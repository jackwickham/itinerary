import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';
import { loadConfig, setConfigForTests, type Secrets } from '../src/server/config.js';
import { clearFlightCache } from '../src/server/services/flights.js';
import { createEntry } from '../src/server/services/entries.js';
import { createTrip } from '../src/server/services/trips.js';
import { flightLookup, flightWindow, STATUS_LEAD_MS } from '../src/shared/flights.js';

const app = createApp();
const config = loadConfig();

function configure(secrets: Secrets) {
  setConfigForTests(config, secrets);
}

beforeEach(() => configure({ flightaware: { apiKey: 'test-key' } }));
afterEach(() => {
  clearFlightCache();
  vi.unstubAllGlobals();
  configure({ email: { webhookSecret: 'test-secret' } });
});

/** A local date and time, in UTC, a number of hours from now. */
function inHours(hours: number) {
  const at = new Date(Date.now() + hours * 3_600_000);
  return { date: at.toISOString().slice(0, 10), time: at.toISOString().slice(11, 16) };
}

function flightEntry({ hoursAway = 3, flight_number = 'BA432' as string | null } = {}) {
  const departs = inHours(hoursAway);
  const arrives = inHours(hoursAway + 2);
  const trip = createTrip({ name: 'Lisbon' });
  return createEntry(trip.id, {
    title: 'BA 432 London → Lisbon',
    type: 'travel',
    flight_number,
    start_date: departs.date,
    start_time: departs.time,
    start_tz: 'UTC',
    end_date: arrives.date,
    end_time: arrives.time,
    end_tz: 'UTC',
  });
}

/** One flight as AeroAPI returns it, with only the fields the service reads. */
function aeroFlight(overrides: Record<string, unknown> = {}) {
  return {
    ident: 'BAW432',
    ident_iata: 'BA432',
    fa_flight_id: 'BAW432-1700000000-airline-0123',
    inbound_fa_flight_id: null,
    status: 'Scheduled / Delayed',
    cancelled: false,
    diverted: false,
    origin: { code: 'EGLL', code_iata: 'LHR', name: 'London Heathrow', city: 'London', timezone: 'Europe/London' },
    destination: { code: 'LPPT', code_iata: 'LIS', name: 'Lisbon', city: 'Lisbon', timezone: 'Europe/Lisbon' },
    departure_delay: 1500,
    arrival_delay: 1200,
    progress_percent: 0,
    gate_origin: 'A12',
    terminal_origin: '5',
    gate_destination: null,
    terminal_destination: '1',
    baggage_claim: '4',
    scheduled_out: '2027-03-14T07:25:00Z',
    estimated_out: '2027-03-14T07:50:00Z',
    actual_out: null,
    scheduled_off: '2027-03-14T07:40:00Z',
    scheduled_in: '2027-03-14T10:05:00Z',
    estimated_in: '2027-03-14T10:25:00Z',
    actual_in: null,
    actual_off: null,
    actual_on: null,
    ...overrides,
  };
}

/** Answers every AeroAPI request with `flights`, keyed by the ident in the path. */
function stubAeroApi(byIdent: Record<string, unknown[]>, status = 200) {
  const fetchMock = vi.fn(async (url: URL | string, _init?: RequestInit) => {
    const ident = decodeURIComponent(new URL(String(url)).pathname.split('/').pop()!);
    const body = status === 200 ? { flights: byIdent[ident] ?? [] } : { title: 'Rate limited', detail: 'Too many' };
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('flight status window', () => {
  const base = {
    type: 'travel' as const,
    flight_number: 'BA432',
    start_date: '2027-03-14',
    start_time: '07:25',
    start_tz: 'Europe/London',
    end_date: '2027-03-14',
    end_time: '10:05',
    end_tz: 'Europe/Lisbon',
  };

  it('opens a day before departure and closes after arrival', () => {
    const window = flightWindow(base)!;
    const departure = Date.parse('2027-03-14T07:25:00Z');
    expect(window.departure).toBe(departure);
    expect(window.from).toBe(departure - STATUS_LEAD_MS);
    expect(window.until).toBeGreaterThan(Date.parse('2027-03-14T10:05:00Z'));
  });

  it('assumes the middle of the day when there is no departure time', () => {
    const window = flightWindow({ ...base, start_time: null, start_tz: null, end_time: null, end_tz: null })!;
    expect(window.departure).toBe(Date.parse('2027-03-14T12:00:00Z'));
  });

  it('has nothing to look up without a flight number, a date or the travel type', () => {
    expect(flightLookup({ ...base, flight_number: null })).toBeNull();
    expect(flightWindow({ ...base, start_date: null })).toBeNull();
    expect(flightWindow({ ...base, type: 'activity' })).toBeNull();
  });
});

describe('GET /api/entries/:id/flight-status', () => {
  it('returns the flight, its gate and its inbound aircraft', async () => {
    const entry = flightEntry();
    const fetchMock = stubAeroApi({
      BA432: [aeroFlight({ inbound_fa_flight_id: 'BAW431-1699990000-airline-0100' })],
      'BAW431-1699990000-airline-0100': [
        aeroFlight({
          ident_iata: 'BA431',
          inbound_fa_flight_id: null,
          origin: { code_iata: 'LIS', code: 'LPPT', name: 'Lisbon', city: 'Lisbon', timezone: 'Europe/Lisbon' },
          destination: {
            code_iata: 'LHR',
            code: 'EGLL',
            name: 'London Heathrow',
            city: 'London',
            timezone: 'Europe/London',
          },
          actual_off: '2027-03-14T04:40:00Z',
          actual_on: null,
          estimated_in: '2027-03-14T06:40:00Z',
        }),
      ],
    });

    const res = await request(app).get(`/api/entries/${entry.id}/flight-status`).expect(200);

    expect(res.body).toMatchObject({
      state: 'ok',
      flight: {
        ident: 'BA432',
        status: 'Scheduled / Delayed',
        cancelled: false,
        departure: { scheduled: '2027-03-14T07:25:00Z', estimated: '2027-03-14T07:50:00Z', actual: null },
        arrival: { scheduled: '2027-03-14T10:05:00Z', estimated: '2027-03-14T10:25:00Z' },
        departure_delay: 1500,
        gate_origin: 'A12',
        terminal_origin: '5',
        baggage_claim: '4',
        origin: { code: 'LHR', timezone: 'Europe/London' },
      },
      inbound: { ident: 'BA431', took_off_at: '2027-03-14T04:40:00Z', landed_at: null },
    });

    const requested = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requested.pathname).toBe('/aeroapi/flights/BA432');
    expect(requested.searchParams.get('ident_type')).toBe('designator');
    expect(Date.parse(requested.searchParams.get('start')!)).toBeLessThan(Date.now());
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ 'x-apikey': 'test-key' });
  });

  it('caches the answer and only looks again when asked to refresh', async () => {
    const entry = flightEntry();
    const fetchMock = stubAeroApi({ BA432: [aeroFlight()] });

    await request(app).get(`/api/entries/${entry.id}/flight-status`).expect(200);
    await request(app).get(`/api/entries/${entry.id}/flight-status`).expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await request(app).get(`/api/entries/${entry.id}/flight-status?refresh=true`).expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('picks the flight scheduled closest to the entry', async () => {
    const entry = flightEntry();
    const departure = new Date(Date.now() + 3 * 3_600_000).toISOString();
    stubAeroApi({
      BA432: [
        aeroFlight({ scheduled_out: new Date(Date.now() - 8 * 3_600_000).toISOString(), gate_origin: 'B1' }),
        aeroFlight({ scheduled_out: departure, gate_origin: 'C3' }),
      ],
    });

    const res = await request(app).get(`/api/entries/${entry.id}/flight-status`).expect(200);
    expect(res.body.flight.gate_origin).toBe('C3');
  });

  it('says so when FlightAware has no such flight', async () => {
    const entry = flightEntry();
    stubAeroApi({});
    const res = await request(app).get(`/api/entries/${entry.id}/flight-status`).expect(200);
    expect(res.body).toMatchObject({ state: 'not_found', ident: 'BA432' });
  });

  it('keeps the flight when the inbound lookup fails', async () => {
    const entry = flightEntry();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL | string) =>
        String(url).includes('BA432')
          ? new Response(JSON.stringify({ flights: [aeroFlight({ inbound_fa_flight_id: 'BAW431-x' })] }), {
              status: 200,
            })
          : new Response('nope', { status: 500 }),
      ),
    );

    const res = await request(app).get(`/api/entries/${entry.id}/flight-status`).expect(200);
    expect(res.body).toMatchObject({ state: 'ok', inbound: null });
  });

  it('reports an upstream failure without caching it', async () => {
    const entry = flightEntry();
    const fetchMock = stubAeroApi({ BA432: [aeroFlight()] }, 429);

    const res = await request(app).get(`/api/entries/${entry.id}/flight-status`).expect(502);
    expect(res.body.error).toMatch(/rate limit/i);

    await request(app).get(`/api/entries/${entry.id}/flight-status`).expect(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('passes on why the request never got there', async () => {
    const entry = flightEntry();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
      }),
    );

    const res = await request(app).get(`/api/entries/${entry.id}/flight-status`).expect(504);
    expect(res.body.error).toMatch(/fetch failed: ENOTFOUND/);
  });

  it('never calls FlightAware more than a day before departure', async () => {
    const entry = flightEntry({ hoursAway: 72 });
    const fetchMock = stubAeroApi({ BA432: [aeroFlight()] });

    const res = await request(app).get(`/api/entries/${entry.id}/flight-status`).expect(200);
    expect(res.body.state).toBe('outside_window');
    expect(Date.parse(res.body.available_from)).toBeGreaterThan(Date.now());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports entries with no flight number and a missing API key', async () => {
    const withoutNumber = flightEntry({ flight_number: null });
    const res = await request(app).get(`/api/entries/${withoutNumber.id}/flight-status`).expect(200);
    expect(res.body).toMatchObject({ state: 'unavailable' });

    configure({});
    const entry = flightEntry();
    const unconfigured = await request(app).get(`/api/entries/${entry.id}/flight-status`).expect(200);
    expect(unconfigured.body.reason).toMatch(/not configured/);
  });

  it('404s an unknown entry', async () => {
    await request(app).get('/api/entries/9999/flight-status').expect(404);
  });
});
