import type { FlightStatus } from '../shared/flights';
import type { Entry, ImportDetail, ImportSummary, Trip, TripWithEntries } from '../shared/schemas';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: init.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Entry fields as sent to the API; the server validates and normalises them. */
export type EntryPayload = Record<string, unknown>;

export interface TripPayload {
  name?: string;
  start_date_override?: string | null;
  end_date_override?: string | null;
}

export const api = {
  listTrips: () => request<Trip[]>('/trips'),
  getTrip: (id: number) => request<TripWithEntries>(`/trips/${id}`),
  createTrip: (data: TripPayload & { name: string }) =>
    request<Trip>('/trips', { method: 'POST', json: data }),
  updateTrip: (id: number, data: TripPayload) =>
    request<Trip>(`/trips/${id}`, { method: 'PATCH', json: data }),
  deleteTrip: (id: number) => request<void>(`/trips/${id}`, { method: 'DELETE' }),
  /** Moves every entry into `targetId` and deletes this trip. */
  mergeTrip: (id: number, targetId: number) =>
    request<{ target: Trip; moved: number }>(`/trips/${id}/move-entries`, {
      method: 'POST',
      json: { target_trip_id: targetId, delete_source: true },
    }),

  createEntry: (tripId: number, data: EntryPayload) =>
    request<Entry>(`/trips/${tripId}/entries`, { method: 'POST', json: data }),
  updateEntry: (id: number, data: EntryPayload) =>
    request<Entry>(`/entries/${id}`, { method: 'PATCH', json: data }),
  deleteEntry: (id: number) => request<void>(`/entries/${id}`, { method: 'DELETE' }),
  /** Live status for a flight entry; `refresh` skips the server's cached copy. */
  getFlightStatus: (id: number, refresh = false) =>
    request<FlightStatus>(`/entries/${id}/flight-status${refresh ? '?refresh=true' : ''}`),

  listImports: (limit?: number) => request<ImportSummary[]>(`/imports${limit ? `?limit=${limit}` : ''}`),
  getImport: (id: number) => request<ImportDetail>(`/imports/${id}`),
  retryImport: (id: number) => request<ImportDetail>(`/imports/${id}/retry`, { method: 'POST' }),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
