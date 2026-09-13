import { createHash, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import { loadConfig, loadSecrets } from '../config.js';
import { HttpError } from '../errors.js';
import { storeInboundEmail } from '../services/inbound-emails.js';
import { enqueueImport } from '../services/ingest/queue.js';
import { parseEmail } from '../services/ingest/mime.js';

/**
 * Endpoints for machines rather than people. These are reachable from the public
 * internet (outside the auth proxy), so each authenticates itself.
 */
export const hooksRouter = Router();

function secretMatches(header: string | undefined, secret: string): boolean {
  const presented = header?.match(/^Bearer (.+)$/)?.[1] ?? '';
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(presented), digest(secret));
}

/** Extracts the bare address from "Name <a@b>" or SRS-free "a@b". */
function bareAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase() || null;
}

/**
 * Receives a raw forwarded email (message/rfc822) from the Cloudflare email
 * worker. Stores it and answers 202 straight away; processing happens in the
 * background. A 4xx makes the worker bounce the email back to the sender.
 */
hooksRouter.post('/inbound-email', express.raw({ type: () => true, limit: '30mb' }), async (req, res) => {
  const secret = loadSecrets().email?.webhookSecret;
  if (!secret) throw new HttpError(503, 'Email import is not configured');
  if (!secretMatches(req.get('authorization'), secret)) throw new HttpError(401, 'Unauthorized');
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Expected a raw email body');

  const email = await parseEmail(req.body);
  const envelopeFrom = bareAddress(req.get('x-envelope-from'));
  const allowed = loadConfig().email.allowedSenders;
  // Auto-forwarding can rewrite the envelope sender (SRS), so the From: header counts too.
  if (![envelopeFrom, email.fromAddress].some((sender) => sender && allowed.includes(sender))) {
    console.warn(`Rejected email from ${envelopeFrom ?? '?'} / ${email.fromAddress ?? '?'}`);
    throw new HttpError(403, 'Sender not allowed');
  }

  const id = storeInboundEmail({
    raw: req.body,
    envelopeFrom,
    fromHeader: email.fromHeader,
    subject: email.subject,
    messageId: email.messageId,
  });
  enqueueImport(id);
  res.status(202).json({ id });
});
