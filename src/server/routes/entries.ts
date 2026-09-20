import { Router } from 'express';
import { parseId } from '../errors.js';
import { deleteEntry, getEntry, updateEntry } from '../services/entries.js';
import { getEntryFlightStatus } from '../services/flights.js';

export const entriesRouter = Router();

entriesRouter.get('/:id', (req, res) => {
  res.json(getEntry(parseId(req.params.id)));
});

/** Live status for a flight entry; `?refresh=true` skips the cached copy. */
entriesRouter.get('/:id/flight-status', async (req, res) => {
  const status = await getEntryFlightStatus(parseId(req.params.id), {
    refresh: req.query.refresh === 'true',
  });
  res.json(status);
});

entriesRouter.patch('/:id', (req, res) => {
  res.json(updateEntry(parseId(req.params.id), req.body));
});

entriesRouter.delete('/:id', (req, res) => {
  deleteEntry(parseId(req.params.id));
  res.status(204).end();
});
