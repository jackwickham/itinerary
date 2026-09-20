/**
 * Ordered schema migrations. The database's `PRAGMA user_version` records how many
 * have been applied; never edit a migration once it has shipped, append a new one.
 */

const now = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const migrations: string[] = [
  `
  CREATE TABLE trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date_override TEXT,
    end_date_override TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'email')),
    created_at TEXT NOT NULL DEFAULT ${now},
    updated_at TEXT NOT NULL DEFAULT ${now}
  );

  CREATE TABLE inbound_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT NOT NULL DEFAULT ${now},
    envelope_from TEXT,
    from_header TEXT,
    subject TEXT,
    message_id TEXT,
    raw BLOB NOT NULL,
    body_text TEXT,
    status TEXT NOT NULL DEFAULT 'received'
      CHECK (status IN ('received', 'processing', 'done', 'failed')),
    error TEXT,
    llm_output TEXT,
    result TEXT,
    processed_at TEXT
  );

  CREATE TABLE itinerary_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL
      CHECK (type IN ('travel', 'accommodation', 'activity', 'reservation', 'note', 'other')),
    status TEXT NOT NULL CHECK (status IN ('idea', 'tentative', 'booked', 'cancelled')),
    start_date TEXT,
    start_time TEXT,
    start_tz TEXT,
    start_location TEXT,
    end_date TEXT,
    end_time TEXT,
    end_tz TEXT,
    end_location TEXT,
    details TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'email')),
    inbound_email_id INTEGER REFERENCES inbound_emails(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT ${now},
    updated_at TEXT NOT NULL DEFAULT ${now}
  );

  CREATE INDEX idx_entries_trip ON itinerary_entries(trip_id, start_date);
  CREATE INDEX idx_entries_email ON itinerary_entries(inbound_email_id);
  CREATE INDEX idx_inbound_status ON inbound_emails(status);
  `,
  // A key from ENTRY_ICONS, or NULL for the automatic icon. Validated in the app so
  // the icon set can grow without a migration.
  `ALTER TABLE itinerary_entries ADD COLUMN icon TEXT;`,
  // Flight number ("BA432"), used to look up live status. Validated in the app.
  `ALTER TABLE itinerary_entries ADD COLUMN flight_number TEXT;`,
];
