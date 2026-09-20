# Itinerary

A personal, mobile-first itinerary planner.

- **Trips** with a day-by-day timeline. Trip dates are worked out from booked and
  tentative plans, and either end can be overridden.
- **One entry type** for travel, stays, activities, reservations and notes. Entries can
  be ideas, tentative, booked or cancelled, and can be scheduled at an exact local time
  (with time zones, including different start and end zones for travel), on a date,
  across a date range, or left unscheduled.
- **Live flight status**: entries with a flight number show FlightAware's view of the
  flight from a day before departure - expected departure and arrival, gate, terminal
  and the inbound aircraft - cached on the server, with a refresh button.
- **Email import**: forward a booking confirmation and an LLM extracts the entries
  (flight legs, hotel stays, …), including booking references and other details, and
  files them into the matching trip or a new one. Everything it creates can be edited,
  moved or deleted, and the original email is kept for reference.

There's no login: it's designed to sit behind an authenticating proxy.

## Development

```bash
npm install
cp config.example.yml config.yml     # set email.allowed_senders
cp secrets.example.yml secrets.yml   # OpenAI key + webhook secret
npm run dev                          # http://localhost:5173
```

Try the import pipeline on a saved email (from "Download message" or "Show original" in
your mail client):

```bash
npm run ingest -- booking.eml --dry-run   # print the extraction and matching, write nothing
npm run ingest -- booking.eml             # import into the local database
```

Or send it through the webhook, exactly as the email worker does:

```bash
curl -X POST localhost:3000/api/hooks/inbound-email \
  -H 'Authorization: Bearer <webhookSecret>' -H 'Content-Type: message/rfc822' \
  -H 'X-Envelope-From: you@example.com' --data-binary @booking.eml
```

## Configuration

`config.yml` (read from the working directory):

| Key                             | Default               |                                                       |
| ------------------------------- | --------------------- | ----------------------------------------------------- |
| `port`                          | 3000                  | `PORT` env var overrides                              |
| `database.path`                 | `./data/itinerary.db` | `DATABASE_PATH` env var overrides                     |
| `llm.provider`                  | `openai`              | only OpenAI for now                                   |
| `llm.models.extract` / `.match` | `gpt-5.6-luna`        | model per task                                        |
| `email.allowed_senders`         | none                  | addresses allowed to import; empty rejects everything |
| `flights.cache_ttl_seconds`     | 300                   | how long a looked-up flight is reused                 |
| `flights.api_base`              | AeroAPI               | override to point at a mock                           |

`secrets.yml` (path from `SECRETS_FILE`, default `./secrets.yml`): `openai.apiKey`,
`email.webhookSecret` (e.g. `openssl rand -hex 32`) and `flightaware.apiKey`. Without a
FlightAware key the app works as before and flight entries just say live status isn't
configured. AeroAPI charges per query, so a status is only fetched within 24 hours of
departure and is then cached for `flights.cache_ttl_seconds`; the refresh button in an
entry is the only thing that spends another query.
