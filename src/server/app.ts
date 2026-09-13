import express from 'express';
import path from 'node:path';
import { errorHandler } from './middleware/error-handler.js';
import { entriesRouter } from './routes/entries.js';
import { hooksRouter } from './routes/hooks.js';
import { importsRouter } from './routes/imports.js';
import { tripsRouter } from './routes/trips.js';

/** The built frontend, relative to the working directory (the repo root, or /app in Docker). */
const clientDist = path.resolve('dist/client');

export function createApp() {
  const app = express();

  // Public, self-authenticating endpoints (exposed without the auth proxy).
  app.use('/api/hooks', hooksRouter);

  app.use('/api', express.json({ limit: '1mb' }));
  app.use('/api/trips', tripsRouter);
  app.use('/api/entries', entriesRouter);
  app.use('/api/imports', importsRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(express.static(clientDist));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  app.use(errorHandler);
  return app;
}
