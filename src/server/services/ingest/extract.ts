import { canonicalTimeZone, isValidDateString } from '../../../shared/dates.js';
import { normaliseTiming, timingProblem, type EntryData } from '../../../shared/schemas.js';
import { getLLM } from '../llm/index.js';
import { ReasoningLevel } from '../llm/interface.js';
import type { ParsedEmail } from './mime.js';
import { EXTRACTION_SYSTEM_PROMPT, extractionUserMessage } from './prompts.js';
import { emailExtractionSchema, type EmailExtraction, type ProposedEntry } from './schemas.js';

export async function extractEntries(email: ParsedEmail): Promise<EmailExtraction> {
  return getLLM().completeStructured({
    task: 'extract',
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: extractionUserMessage(email) }],
    files: email.pdfs,
    schema: emailExtractionSchema,
    schemaName: 'email_extraction',
    options: { reasoning: ReasoningLevel.LOW },
  });
}

function cleanDate(value: string | null): string | null {
  const v = value?.trim();
  return v && isValidDateString(v) ? v : null;
}

/** Accepts "7:25", "07:25" or "07:25:00"; anything else becomes null. */
function cleanTime(value: string | null): string | null {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  return h < 24 && m < 60 ? `${String(h).padStart(2, '0')}:${match[2]}` : null;
}

function cleanText(value: string | null, max: number): string | null {
  const v = value?.trim();
  return v ? v.slice(0, max) : null;
}

/**
 * Coerces the model's proposal into valid entry data. A field that wouldn't
 * validate is dropped rather than failing the whole import: a bad date leaves the
 * entry unscheduled and a bad zone leaves it zoneless, both easy to fix by hand.
 */
export function sanitiseProposedEntry(p: ProposedEntry): EntryData {
  const entry: EntryData = {
    title: cleanText(p.title, 300) ?? 'Untitled booking',
    type: p.type,
    status: p.status,
    icon: p.icon,
    start_date: cleanDate(p.start_date),
    start_time: cleanTime(p.start_time),
    start_tz: p.start_timezone ? canonicalTimeZone(p.start_timezone) : null,
    start_location: cleanText(p.start_location, 1000),
    end_date: cleanDate(p.end_date),
    end_time: cleanTime(p.end_time),
    end_tz: p.end_timezone ? canonicalTimeZone(p.end_timezone) : null,
    end_location: cleanText(p.end_location, 1000),
    details: p.details
      .map((d) => ({ label: d.label.trim().slice(0, 100) || 'Detail', value: d.value.trim().slice(0, 2000) }))
      .filter((d) => d.value !== '')
      .slice(0, 50),
    notes: (p.notes ?? '').trim().slice(0, 20000),
  };

  // An end that lands before the start is more likely a misread end than start.
  if (timingProblem(normaliseTiming(entry))) {
    return { ...entry, end_date: null, end_time: null, end_tz: null };
  }
  return entry;
}
