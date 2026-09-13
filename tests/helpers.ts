import { BaseLLM, type LLMRequest, type LLMTask } from '../src/server/services/llm/interface.js';
import type { ProposedEntry } from '../src/server/services/ingest/schemas.js';

/**
 * Replays scripted provider output through the real schema-conversion and
 * validation path, so tests cover what BaseLLM actually does.
 */
export class FakeLLM extends BaseLLM {
  requests: (LLMRequest & { jsonSchema: Record<string, unknown> })[] = [];

  constructor(private replies: Partial<Record<LLMTask, (request: LLMRequest) => unknown>>) {
    super();
  }

  protected async completeJson(
    request: LLMRequest,
    schema: { name: string; jsonSchema: Record<string, unknown> },
  ): Promise<string> {
    this.requests.push({ ...request, jsonSchema: schema.jsonSchema });
    const reply = this.replies[request.task];
    if (!reply) throw new Error(`Unexpected "${request.task}" call`);
    return JSON.stringify(reply(request));
  }

  callsFor(task: LLMTask) {
    return this.requests.filter((r) => r.task === task);
  }
}

export function proposed(overrides: Partial<ProposedEntry> = {}): ProposedEntry {
  return {
    title: 'Something',
    type: 'activity',
    status: 'booked',
    icon: null,
    start_date: null,
    start_time: null,
    start_timezone: null,
    start_location: null,
    end_date: null,
    end_time: null,
    end_timezone: null,
    end_location: null,
    details: [],
    notes: null,
    ...overrides,
  };
}

export function extraction(entries: ProposedEntry[], name = 'Lisbon') {
  return { entries, suggested_trip_name: name, destination_summary: `${name}, somewhere` };
}

/** Builds a raw RFC 822 email. */
export function makeEmail({
  from = 'Me <me@example.com>',
  subject = 'Fwd: Booking confirmation',
  text,
  html,
  attachments = [],
}: {
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: { filename: string; contentType: string; content: string }[];
}): Buffer {
  const headers = [
    `From: ${from}`,
    'To: trips@automation.example.com',
    `Subject: ${subject}`,
    'Date: Mon, 01 Feb 2027 10:00:00 +0000',
    `Message-ID: <${Math.random().toString(36).slice(2)}@example.com>`,
    'MIME-Version: 1.0',
  ];

  const alternative = [
    text !== undefined ? `Content-Type: text/plain; charset=utf-8\r\n\r\n${text}` : null,
    html !== undefined ? `Content-Type: text/html; charset=utf-8\r\n\r\n${html}` : null,
  ].filter((p): p is string => p !== null);

  const bodyPart =
    alternative.length === 1
      ? alternative[0]
      : `Content-Type: multipart/alternative; boundary="alt"\r\n\r\n${alternative
          .map((p) => `--alt\r\n${p}\r\n`)
          .join('')}--alt--`;

  if (attachments.length === 0) {
    return Buffer.from(`${headers.join('\r\n')}\r\n${bodyPart}\r\n`);
  }

  const parts = [
    bodyPart,
    ...attachments.map(
      (a) =>
        `Content-Type: ${a.contentType}; name="${a.filename}"\r\n` +
        `Content-Disposition: attachment; filename="${a.filename}"\r\n` +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        Buffer.from(a.content).toString('base64'),
    ),
  ];
  return Buffer.from(
    `${headers.join('\r\n')}\r\nContent-Type: multipart/mixed; boundary="mix"\r\n\r\n` +
      parts.map((p) => `--mix\r\n${p}\r\n`).join('') +
      '--mix--\r\n',
  );
}
