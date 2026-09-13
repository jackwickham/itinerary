import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { migrations } from './migrations.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = loadConfig().database.path;
    if (dbPath !== ':memory:') {
      mkdirSync(path.dirname(dbPath), { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function migrate(database: Database.Database): void {
  const current = database.pragma('user_version', { simple: true }) as number;
  for (let version = current; version < migrations.length; version++) {
    database.transaction(() => {
      database.exec(migrations[version]);
      database.pragma(`user_version = ${version + 1}`);
    })();
  }
}

/** Current UTC timestamp in the same format as the schema defaults. */
export function nowIso(): string {
  return new Date().toISOString();
}
