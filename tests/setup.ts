import { beforeEach } from 'vitest';
import { setConfigForTests } from '../src/server/config.js';
import { closeDb } from '../src/server/db/index.js';

setConfigForTests(
  {
    port: 0,
    database: { path: ':memory:' },
    llm: { provider: 'openai', models: { extract: 'test-extract', match: 'test-match' } },
    email: { allowedSenders: ['me@example.com'] },
  },
  { email: { webhookSecret: 'test-secret' } },
);

// Every test gets a fresh in-memory database.
beforeEach(() => {
  closeDb();
});
