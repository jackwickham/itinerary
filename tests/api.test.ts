import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.js';

const app = createApp();

describe('trips and entries API', () => {
  it('creates a trip, adds an entry and reads it back with inferred dates', async () => {
    const trip = (await request(app).post('/api/trips').send({ name: 'Lisbon' }).expect(201)).body;

    await request(app)
      .post(`/api/trips/${trip.id}/entries`)
      .send({
        title: 'BA 500 London → Lisbon',
        type: 'travel',
        status: 'booked',
        start_date: '2027-03-14',
        start_time: '07:25',
        start_tz: 'Europe/London',
        start_location: 'LHR',
        end_date: '2027-03-14',
        end_time: '10:05',
        end_tz: 'Europe/Lisbon',
        end_location: 'LIS',
      })
      .expect(201);

    const full = (await request(app).get(`/api/trips/${trip.id}`).expect(200)).body;
    expect(full).toMatchObject({ start_date: '2027-03-14', end_date: '2027-03-14', entry_count: 1 });
    expect(full.entries[0]).toMatchObject({ end_location: 'LIS', source: 'manual' });
  });

  it('returns readable validation errors', async () => {
    const res = await request(app).post('/api/trips').send({ name: '' }).expect(400);
    expect(res.body.error).toMatch(/name: Name is required/);
  });

  it('404s unknown resources and routes', async () => {
    await request(app).get('/api/trips/12345').expect(404);
    await request(app).patch('/api/entries/12345').send({ title: 'x' }).expect(404);
    await request(app).get('/api/nope').expect(404);
    await request(app).get('/api/trips/abc').expect(400);
  });

  it('updates, moves and deletes entries', async () => {
    const a = (await request(app).post('/api/trips').send({ name: 'A' })).body;
    const b = (await request(app).post('/api/trips').send({ name: 'B' })).body;
    const e = (
      await request(app).post(`/api/trips/${a.id}/entries`).send({ title: 'Dinner', type: 'reservation' })
    ).body;

    const moved = (
      await request(app).patch(`/api/entries/${e.id}`).send({ trip_id: b.id }).expect(200)
    ).body;
    expect(moved.trip_id).toBe(b.id);

    await request(app).delete(`/api/entries/${e.id}`).expect(204);
    await request(app).get(`/api/entries/${e.id}`).expect(404);
  });

  it('merges trips', async () => {
    const a = (await request(app).post('/api/trips').send({ name: 'A' })).body;
    const b = (await request(app).post('/api/trips').send({ name: 'B' })).body;
    await request(app).post(`/api/trips/${a.id}/entries`).send({ title: 'x', type: 'note' });

    const res = await request(app)
      .post(`/api/trips/${a.id}/move-entries`)
      .send({ target_trip_id: b.id, delete_source: true })
      .expect(200);
    expect(res.body).toMatchObject({ moved: 1, target: { id: b.id, entry_count: 1 } });
    await request(app).get(`/api/trips/${a.id}`).expect(404);
  });
});
