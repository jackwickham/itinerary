import { Router } from 'express';
import { parseId } from '../errors.js';
import { moveEntriesSchema } from '../../shared/schemas.js';
import { createEntry } from '../services/entries.js';
import {
  createTrip,
  deleteTrip,
  getTripWithEntries,
  listTrips,
  moveAllEntries,
  updateTrip,
} from '../services/trips.js';

export const tripsRouter = Router();

tripsRouter.get('/', (_req, res) => {
  res.json(listTrips());
});

tripsRouter.post('/', (req, res) => {
  res.status(201).json(createTrip(req.body));
});

tripsRouter.get('/:id', (req, res) => {
  res.json(getTripWithEntries(parseId(req.params.id)));
});

tripsRouter.patch('/:id', (req, res) => {
  res.json(updateTrip(parseId(req.params.id), req.body));
});

tripsRouter.delete('/:id', (req, res) => {
  deleteTrip(parseId(req.params.id));
  res.status(204).end();
});

tripsRouter.post('/:id/move-entries', (req, res) => {
  const body = moveEntriesSchema.parse(req.body);
  res.json(
    moveAllEntries(parseId(req.params.id), body.target_trip_id, { deleteSource: body.delete_source }),
  );
});

tripsRouter.post('/:id/entries', (req, res) => {
  res.status(201).json(createEntry(parseId(req.params.id), req.body));
});
