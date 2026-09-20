import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';
import { getInboundEmail, storeInboundEmail } from '../src/server/services/inbound-emails.js';
import { sanitiseProposedEntry } from '../src/server/services/ingest/extract.js';
import { parseEmail } from '../src/server/services/ingest/mime.js';
import { drainImports, enqueueImport } from '../src/server/services/ingest/queue.js';
import { setLLM } from '../src/server/services/llm/index.js';
import { createEntry } from '../src/server/services/entries.js';
import { createTrip, getTripWithEntries, listTrips } from '../src/server/services/trips.js';
import { FakeLLM, extraction, makeEmail, proposed } from './helpers.js';

const app = createApp();

afterEach(() => setLLM(null));

const outbound = proposed({
  title: 'BA 500 London → Lisbon',
  type: 'travel',
  start_date: '2027-03-14',
  start_time: '07:25',
  start_timezone: 'Europe/London',
  start_location: 'London Heathrow (LHR)',
  flight_number: 'BA500',
  end_date: '2027-03-14',
  end_time: '10:05',
  end_timezone: 'Europe/Lisbon',
  end_location: 'Lisbon (LIS)',
  details: [{ label: 'Booking ref', value: 'ABC123' }],
});
const inbound = proposed({
  ...outbound,
  title: 'BA 501 Lisbon → London',
  flight_number: 'BA501',
  start_date: '2027-03-18',
  start_time: '11:00',
  start_timezone: 'Europe/Lisbon',
  start_location: 'Lisbon (LIS)',
  end_date: '2027-03-18',
  end_time: '13:40',
  end_timezone: 'Europe/London',
  end_location: 'London Heathrow (LHR)',
});

function postEmail(raw: Buffer, { secret = 'test-secret', envelopeFrom = 'me@example.com' } = {}) {
  return request(app)
    .post('/api/hooks/inbound-email')
    .set('Authorization', `Bearer ${secret}`)
    .set('Content-Type', 'message/rfc822')
    .set('X-Envelope-From', envelopeFrom)
    .send(raw);
}

describe('inbound email webhook', () => {
  it('rejects a bad secret', async () => {
    await postEmail(makeEmail({ text: 'hi' }), { secret: 'wrong' }).expect(401);
  });

  it('rejects senders not on the allowlist', async () => {
    await postEmail(makeEmail({ from: 'spam@evil.example', text: 'hi' }), {
      envelopeFrom: 'spam@evil.example',
    }).expect(403);
  });

  it('accepts an allowed From: header even when the envelope was rewritten', async () => {
    setLLM(new FakeLLM({ extract: () => extraction([]) }));
    const res = await postEmail(makeEmail({ text: 'hi' }), {
      envelopeFrom: 'SRS0=abcd=xy=example.com=me@forwarder.example',
    }).expect(202);
    await drainImports();
    expect(getInboundEmail(res.body.id).status).toBe('done');
  });

  it('imports a return flight as two entries in a new trip', async () => {
    const llm = new FakeLLM({ extract: () => extraction([outbound, inbound], 'Lisbon') });
    setLLM(llm);

    const res = await postEmail(makeEmail({ text: 'Booking ABC123 ...' })).expect(202);
    await drainImports();

    const imported = getInboundEmail(res.body.id);
    expect(imported.status).toBe('done');
    expect(imported.result).toMatchObject({ created_trip: true, trip_name: 'Lisbon' });
    expect(imported.entries).toHaveLength(2);
    expect(llm.callsFor('match')).toHaveLength(0); // nothing to match against

    const trip = getTripWithEntries(imported.result!.trip_id!);
    expect(trip).toMatchObject({ source: 'email', start_date: '2027-03-14', end_date: '2027-03-18' });
    expect(trip.entries[0]).toMatchObject({
      source: 'email',
      inbound_email_id: res.body.id,
      start_tz: 'Europe/London',
      end_tz: 'Europe/Lisbon',
      flight_number: 'BA500',
      details: [{ label: 'Booking ref', value: 'ABC123' }],
    });
  });
});

describe('trip matching', () => {
  it('adds to an overlapping trip the model picks', async () => {
    const trip = createTrip({ name: 'Portugal' });
    createEntry(trip.id, { title: 'Flight', type: 'travel', status: 'booked', start_date: '2027-03-14', end_location: 'Lisbon' });

    const hotel = proposed({ title: 'Hotel Avenida', type: 'accommodation', start_date: '2027-03-14', end_date: '2027-03-18' });
    const llm = new FakeLLM({
      extract: () => extraction([hotel]),
      match: () => ({ reason: 'Same dates, same city', trip_id: trip.id, new_trip_name: null }),
    });
    setLLM(llm);

    const id = storeInboundEmail({ raw: makeEmail({ text: 'hotel' }), envelopeFrom: null, fromHeader: null, subject: null, messageId: null });
    enqueueImport(id);
    await drainImports();

    expect(getInboundEmail(id).result).toMatchObject({ trip_id: trip.id, created_trip: false });
    const prompt = llm.callsFor('match')[0].messages[0].content;
    expect(prompt).toContain(`id ${trip.id}: "Portugal"`);
    expect(prompt).toContain('places: Lisbon');
  });

  it('creates a new trip when the model names a trip that was not a candidate', async () => {
    createTrip({ name: 'Nearby', start_date_override: '2027-03-10', end_date_override: '2027-03-20' });
    setLLM(
      new FakeLLM({
        extract: () => extraction([outbound], 'Lisbon'),
        match: () => ({ reason: 'x', trip_id: 9999, new_trip_name: null }),
      }),
    );

    const id = storeInboundEmail({ raw: makeEmail({ text: 'x' }), envelopeFrom: null, fromHeader: null, subject: null, messageId: null });
    enqueueImport(id);
    await drainImports();

    expect(getInboundEmail(id).result).toMatchObject({ created_trip: true, trip_name: 'Lisbon' });
  });

  it('leaves distant trips out of the candidates', async () => {
    createTrip({ name: 'Far away', start_date_override: '2027-08-01', end_date_override: '2027-08-10' });
    const llm = new FakeLLM({ extract: () => extraction([outbound]) });
    setLLM(llm);

    const id = storeInboundEmail({ raw: makeEmail({ text: 'x' }), envelopeFrom: null, fromHeader: null, subject: null, messageId: null });
    enqueueImport(id);
    await drainImports();

    expect(getInboundEmail(id).result).toMatchObject({ created_trip: true });
    expect(llm.callsFor('match')).toHaveLength(0);
  });

  it('processes emails one at a time so the second sees the trip the first created', async () => {
    const llm = new FakeLLM({
      extract: (req) => extraction([req.messages[0].content.includes('OUTBOUND') ? outbound : inbound]),
      match: () => ({ reason: 'Return leg of the same trip', trip_id: listTrips()[0].id, new_trip_name: null }),
    });
    setLLM(llm);

    const store = (text: string) =>
      storeInboundEmail({ raw: makeEmail({ text }), envelopeFrom: null, fromHeader: null, subject: null, messageId: null });
    enqueueImport(store('OUTBOUND'));
    enqueueImport(store('RETURN'));
    await drainImports();

    const trips = listTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].entry_count).toBe(2);
    expect(llm.callsFor('match')).toHaveLength(1);
  });
});

describe('failures and corrections', () => {
  it('records a failed extraction and succeeds on retry', async () => {
    let fail = true;
    setLLM(
      new FakeLLM({
        extract: () => {
          if (fail) return { nonsense: true };
          return extraction([outbound]);
        },
      }),
    );

    const res = await postEmail(makeEmail({ subject: 'Your booking', text: 'x' })).expect(202);
    await drainImports();
    const failed = getInboundEmail(res.body.id);
    expect(failed.status).toBe('failed');
    expect(failed.error).toMatch(/did not match/);
    expect(failed.body_text).toBe('x');

    fail = false;
    await request(app).post(`/api/imports/${res.body.id}/retry`).expect(202);
    await drainImports();
    expect(getInboundEmail(res.body.id)).toMatchObject({ status: 'done', entries: [{ title: 'BA 500 London → Lisbon' }] });
  });

  it('marks emails with no bookings as done with nothing created', async () => {
    setLLM(new FakeLLM({ extract: () => extraction([]) }));
    const res = await postEmail(makeEmail({ text: 'newsletter' })).expect(202);
    await drainImports();
    expect(getInboundEmail(res.body.id)).toMatchObject({
      status: 'done',
      result: { entry_ids: [], message: 'No bookings found in this email.' },
    });
  });

  it('serves the original email and lists imports', async () => {
    setLLM(new FakeLLM({ extract: () => extraction([]) }));
    const raw = makeEmail({ subject: 'Hello there', text: 'x' });
    const res = await postEmail(raw).expect(202);
    await drainImports();

    const download = await request(app).get(`/api/imports/${res.body.id}/raw`).expect(200);
    expect(download.headers['content-type']).toMatch(/message\/rfc822/);
    const list = await request(app).get('/api/imports').expect(200);
    expect(list.body[0]).toMatchObject({ id: res.body.id, subject: 'Hello there', status: 'done' });
  });
});

describe('sanitising proposed entries', () => {
  it('drops invalid values instead of failing', () => {
    const e = sanitiseProposedEntry(
      proposed({
        start_date: '2027-03-14',
        start_time: '7:25',
        start_timezone: 'Not/AZone',
        end_date: '14/03/2027',
        details: [{ label: '', value: 'ABC123' }, { label: 'Empty', value: '  ' }],
      }),
    );
    expect(e).toMatchObject({
      start_date: '2027-03-14',
      start_time: '07:25',
      start_tz: null,
      end_date: null,
      details: [{ label: 'Detail', value: 'ABC123' }],
      notes: '',
    });
  });

  it('keeps a flight number only for travel, and only when it looks like one', () => {
    expect(sanitiseProposedEntry(proposed({ type: 'travel', flight_number: 'ba 432' })).flight_number).toBe('BA432');
    expect(sanitiseProposedEntry(proposed({ type: 'travel', flight_number: 'TBC' })).flight_number).toBeNull();
    expect(sanitiseProposedEntry(proposed({ type: 'activity', flight_number: 'BA432' })).flight_number).toBeNull();
  });

  it('keeps the icon the model chose', () => {
    expect(sanitiseProposedEntry(proposed({ type: 'travel', icon: 'train' })).icon).toBe('train');
  });

  it('drops an end that comes before the start', () => {
    const e = sanitiseProposedEntry(proposed({ start_date: '2027-03-14', end_date: '2027-03-10' }));
    expect(e.end_date).toBeNull();
  });

  it('leaves an entry with an unparseable date unscheduled', () => {
    expect(sanitiseProposedEntry(proposed({ start_date: 'next Tuesday' })).start_date).toBeNull();
  });
});

describe('parseEmail', () => {
  it('reads HTML bodies, skipping images and long tracking links', async () => {
    const email = await parseEmail(
      makeEmail({
        text: 'See HTML',
        html:
          '<p>Booking reference <b>ABC123</b></p><img src="https://t.example/pixel.gif">' +
          `<a href="https://t.example/${'x'.repeat(200)}">Manage booking</a>`,
      }),
    );
    expect(email.text).toContain('ABC123');
    expect(email.text).toContain('Manage booking');
    expect(email.text).not.toContain('pixel.gif');
    expect(email.text).not.toContain('xxxx');
    expect(email.fromAddress).toBe('me@example.com');
  });

  it('collects PDFs and inlines calendar attachments', async () => {
    const email = await parseEmail(
      makeEmail({
        text: 'Tickets attached',
        attachments: [
          { filename: 'ticket.pdf', contentType: 'application/pdf', content: '%PDF-1.4 fake' },
          { filename: 'invite.ics', contentType: 'text/calendar', content: 'BEGIN:VCALENDAR\nSUMMARY:Dinner\nEND:VCALENDAR' },
        ],
      }),
    );
    expect(email.pdfs).toEqual([
      { filename: 'ticket.pdf', mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.4 fake').toString('base64') },
    ]);
    expect(email.text).toContain('SUMMARY:Dinner');
  });
});
