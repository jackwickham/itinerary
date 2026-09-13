# Itinerary

Personal, mobile-first trip planner. Trips hold a timeline of itinerary entries, and
booking emails forwarded to a dedicated address are turned into entries by an LLM.
It sits behind an auth proxy (forcefield) and has no auth of its own. Setup and
deployment are in [README.md](README.md).

## Commands

```bash
npm run dev          # Vite on :5173 (proxies /api) + tsx watch server on :3000
npm run typecheck
npm test             # vitest; in-memory SQLite, FakeLLM for ingestion
npm run build        # dist/client (vite) + dist/server (tsup)
npm run ingest -- file.eml [--dry-run]   # run the email pipeline on a saved email
```

## Stack

- Server: Express 5, better-sqlite3 (raw SQL, no ORM), zod 4, YAML config. ESM.
- Client: React 19, React Router 7 (import from `react-router`), Tailwind v4 (no config
  file; theme in `src/client/index.css`).
- One package. `src/shared` is imported by both sides; the client only takes types and
  zod-free modules from it (`constants.ts`, `dates.ts`).

## Layout

```
src/shared/     constants.ts, dates.ts (local-date maths, trip classification,
                timeline grouping), schemas.ts (zod schemas + API types)
src/server/
  services/     trips.ts, entries.ts: the only code that writes trips/entries
                inbound-emails.ts: storage for received emails
                ingest/: mime → extract (LLM) → match (LLM) → pipeline, serial queue
                llm/: provider abstraction (copied from ../recipes), OpenAI only
  routes/       thin wrappers; hooks.ts is the public webhook (bearer secret + allowlist)
  db/           migrations.ts (append-only, tracked by PRAGMA user_version)
src/client/     pages/, components/, api.ts, format.ts
email-worker/   Cloudflare Email Worker that POSTs raw mail to the webhook
```

## Key rules

- **Manual editing is canonical.** Email ingestion creates trips and entries by calling
  `createTrip`/`createEntry`, the same functions the API routes use. Don't add a
  separate write path.
- **Dates are local.** Entries store a local date (`YYYY-MM-DD`), local time (`HH:MM`)
  and an IANA zone per end, never instants. Compare dates as strings; only convert to
  instants to compare across zones (`entryInstant`).
- Entry validation lives in `src/shared/schemas.ts`. `normaliseTiming` gives each
  scheduling mode (unscheduled, date, time, range) one canonical shape;
  `timingProblem` checks ordering.
- Entry icons are keys from `ENTRY_ICONS` (`src/shared/constants.ts`); null means
  automatic (`guessIcon` in `src/client/format.ts`). Only ever add keys.
- Tailwind v4 utilities that set the same property (`w-full` vs `w-2/5`, `hidden` vs
  `inline-flex`) don't override each other by order in `className`; put the competing
  one on a wrapper instead.
- Trip dates are never stored: they're inferred in SQL from booked and tentative
  entries (`DATE_DRIVING_STATUSES`), and each date can be overridden separately.
- LLM payloads are zod schemas in `services/ingest/schemas.ts`. Their `.describe()`
  text is part of the prompt, so don't hand-write JSON examples in prompts. All fields
  must be required-but-nullable (OpenAI strict mode).
- Ingestion never fails over one bad field: `sanitiseProposedEntry` drops what won't
  validate. Imports run one at a time (`ingest/queue.ts`) so back-to-back emails for
  the same trip don't each create a new one.
- Tests substitute the LLM with `setLLM(new FakeLLM(...))` (`tests/helpers.ts`).
- Adding a DB column: append a migration; never edit a shipped one.
