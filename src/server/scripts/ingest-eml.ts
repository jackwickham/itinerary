/**
 * Run the import pipeline on a saved .eml file, using the real config and LLM.
 *
 *   npm run ingest -- booking.eml --dry-run   # show what would be extracted and matched
 *   npm run ingest -- booking.eml             # import it into the configured database
 */
import { readFileSync } from 'node:fs';
import { todayLocal } from '../../shared/dates.js';
import { getInboundEmail, storeInboundEmail } from '../services/inbound-emails.js';
import { extractEntries, sanitiseProposedEntry } from '../services/ingest/extract.js';
import { matchTrip, selectCandidates } from '../services/ingest/match.js';
import { parseEmail } from '../services/ingest/mime.js';
import { processInboundEmail } from '../services/ingest/pipeline.js';
import { listTrips } from '../services/trips.js';

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run ingest -- <file.eml> [--dry-run]');
  process.exit(1);
}

const raw = readFileSync(file);
const email = await parseEmail(raw);

if (flags.includes('--dry-run')) {
  const preview = email.text.length > 4000 ? `${email.text.slice(0, 4000)}\n…` : email.text;
  console.log(`--- Text for the model (${email.text.length} chars) ---\n${preview}\n`);
  console.log(`PDFs: ${email.pdfs.map((p) => p.filename).join(', ') || 'none'}\n`);

  const extraction = await extractEntries(email);
  const entries = extraction.entries.map(sanitiseProposedEntry);
  console.log('--- Extraction ---');
  console.log(JSON.stringify({ extraction, sanitised: entries }, null, 2));

  const candidates = selectCandidates(entries, listTrips(), todayLocal());
  const match = entries.length ? await matchTrip(entries, extraction, candidates) : null;
  console.log('--- Trip matching ---');
  console.log(JSON.stringify({ candidates, match }, null, 2));
} else {
  const id = storeInboundEmail({
    raw,
    envelopeFrom: null,
    fromHeader: email.fromHeader,
    subject: email.subject,
    messageId: email.messageId,
  });
  await processInboundEmail(id);
  const result = getInboundEmail(id);
  console.log(JSON.stringify({ id, status: result.status, error: result.error, result: result.result }, null, 2));
}
