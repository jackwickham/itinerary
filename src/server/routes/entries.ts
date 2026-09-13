import { Router } from 'express';
import { parseId } from '../errors.js';
import { deleteEntry, getEntry, updateEntry } from '../services/entries.js';

export const entriesRouter = Router();

entriesRouter.get('/:id', (req, res) => {
  res.json(getEntry(parseId(req.params.id)));
});

entriesRouter.patch('/:id', (req, res) => {
  res.json(updateEntry(parseId(req.params.id), req.body));
});

entriesRouter.delete('/:id', (req, res) => {
  deleteEntry(parseId(req.params.id));
  res.status(204).end();
});
