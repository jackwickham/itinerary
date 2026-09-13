import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { closeDb, getDb } from './db/index.js';
import { resumePendingImports } from './services/ingest/queue.js';

const config = loadConfig();
getDb();
resumePendingImports();

if (config.email.allowedSenders.length === 0) {
  console.warn('No email.allowed_senders configured: every inbound booking email will be rejected.');
}

const server = createApp().listen(config.port, () => {
  console.log(`Itinerary server running on http://localhost:${config.port}`);
});

// As PID 1 in a container, Node ignores SIGTERM unless it's handled, so `docker stop`
// would wait out its timeout and then kill the process. An import cut short is safe:
// its entries are written in one transaction, and it's resumed on the next start.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close();
    closeDb();
    process.exit(0);
  });
}
