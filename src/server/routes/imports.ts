import { Router } from 'express';
import { parseId } from '../errors.js';
import {
  getInboundEmail,
  getInboundEmailRaw,
  listInboundEmails,
  resetForRetry,
} from '../services/inbound-emails.js';
import { enqueueImport } from '../services/ingest/queue.js';

export const importsRouter = Router();

importsRouter.get('/', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  res.json(listInboundEmails(limit));
});

importsRouter.get('/:id', (req, res) => {
  res.json(getInboundEmail(parseId(req.params.id)));
});

importsRouter.get('/:id/raw', (req, res) => {
  const id = parseId(req.params.id);
  res
    .type('message/rfc822')
    .attachment(`import-${id}.eml`)
    .send(getInboundEmailRaw(id));
});

importsRouter.post('/:id/retry', (req, res) => {
  const id = parseId(req.params.id);
  resetForRetry(id);
  enqueueImport(id);
  res.status(202).json(getInboundEmail(id));
});
