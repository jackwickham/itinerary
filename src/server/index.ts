import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { getDb } from './db/index.js';
import { resumePendingImports } from './services/ingest/queue.js';

const config = loadConfig();
getDb();
resumePendingImports();

if (config.email.allowedSenders.length === 0) {
  console.warn('No email.allowed_senders configured: every inbound booking email will be rejected.');
}

createApp().listen(config.port, () => {
  console.log(`Itinerary server running on http://localhost:${config.port}`);
});
