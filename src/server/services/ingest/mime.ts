import { convert } from 'html-to-text';
import { simpleParser, type AddressObject } from 'mailparser';
import type { LLMFile } from '../llm/interface.js';

export interface ParsedEmail {
  subject: string | null;
  /** Bare address from the From: header, lower-cased. */
  fromAddress: string | null;
  /** The From: header as written, e.g. `Jo Bloggs <jo@example.com>`. */
  fromHeader: string | null;
  messageId: string | null;
  sentAt: Date | null;
  /** The readable body plus any calendar attachments: exactly what the model sees. */
  text: string;
  /** PDF attachments (e-tickets, invoices) to hand to the model alongside the text. */
  pdfs: LLMFile[];
}

/**
 * Mail clients stack a marker on the front of the subject each time a message is
 * forwarded or replied to; none of that belongs in the name of an import. The raw
 * email is kept, so the original subject is never lost.
 */
const FORWARD_PREFIX = /^\s*(?:re|fw|fwd|aw|wg|tr|sv|vs|rv|enc|doorst)\s*(?:\[\d+\])?\s*:\s*/i;

export function stripForwardPrefixes(subject: string): string {
  let cleaned = subject.trim();
  while (FORWARD_PREFIX.test(cleaned)) cleaned = cleaned.replace(FORWARD_PREFIX, '').trim();
  return cleaned;
}

const MAX_TEXT_CHARS = 100_000;
const MAX_PDFS = 3;
const MAX_PDF_BYTES = 5 * 1024 * 1024;

export async function parseEmail(raw: Buffer): Promise<ParsedEmail> {
  const mail = await simpleParser(raw);
  const from = firstAddress(mail.from);

  const plain = (mail.text ?? '').trim();
  const fromHtml = mail.html ? htmlToText(mail.html) : '';
  // Booking emails often ship a token plain-text part; use the HTML when that's thin.
  let body = plain.length >= fromHtml.length * 0.5 ? plain : fromHtml;

  const pdfs: LLMFile[] = [];
  for (const attachment of mail.attachments) {
    const type = attachment.contentType.toLowerCase();
    const name = attachment.filename ?? 'attachment';
    if (type === 'text/calendar' || name.toLowerCase().endsWith('.ics')) {
      body += `\n\n--- Calendar attachment: ${name} ---\n${attachment.content.toString('utf-8').trim()}`;
    } else if (
      (type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) &&
      pdfs.length < MAX_PDFS &&
      attachment.size <= MAX_PDF_BYTES
    ) {
      pdfs.push({ filename: name, mimeType: 'application/pdf', base64: attachment.content.toString('base64') });
    }
  }

  body = body.replace(/\n{3,}/g, '\n\n').trim();
  if (body.length > MAX_TEXT_CHARS) body = `${body.slice(0, MAX_TEXT_CHARS)}\n\n[truncated]`;

  return {
    subject: stripForwardPrefixes(mail.subject ?? '') || null,
    fromAddress: from?.address?.toLowerCase() ?? null,
    fromHeader: from ? (mail.from as AddressObject).text : null,
    messageId: mail.messageId ?? null,
    sentAt: mail.date ?? null,
    text: body,
    pdfs,
  };
}

function firstAddress(from: AddressObject | AddressObject[] | undefined) {
  const obj = Array.isArray(from) ? from[0] : from;
  return obj?.value[0] ?? null;
}

function htmlToText(html: string): string {
  const text = convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'a', options: { linkBrackets: ['[', ']'], hideLinkHrefIfSameAsText: true } },
    ],
  });
  // Tracking links can dwarf the content; keep only short, readable ones.
  return text.replace(/\s*\[https?:\/\/[^\]\s]{120,}\]/g, '');
}
