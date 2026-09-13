import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { todayLocal } from '../../shared/dates';
import type { ImportDetail } from '../../shared/schemas';
import { api, errorMessage } from '../api';
import { Button, ErrorState, FormError, LoadingState, StatusPill } from '../components/ui';
import {
  IMPORT_STATUS,
  entryIcon,
  formatDay,
  formatTimestamp,
  isImportPending,
  yearOf,
} from '../format';

/** Everything about one imported email, for checking and correcting what it created. */
export default function ImportDetailPage() {
  const id = Number(useParams().id);
  const [imp, setImp] = useState<ImportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getImport(id).then(
      (detail) => {
        setImp(detail);
        setError(null);
      },
      (err) => setError(errorMessage(err)),
    );
  }, [id]);
  useEffect(load, [load]);

  const pending = imp ? isImportPending(imp) : false;
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [pending, load]);

  async function retry() {
    setRetryError(null);
    try {
      setImp(await api.retryImport(id));
    } catch (err) {
      setRetryError(errorMessage(err));
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!imp) return <LoadingState />;

  const currentYear = yearOf(todayLocal());
  const result = imp.result;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 pb-16 pt-5">
      <div>
        <Link to="/imports" className="text-sm text-teal-700">
          ← Email imports
        </Link>
        <h1 className="mt-1 text-xl font-bold tracking-tight">{imp.subject ?? '(no subject)'}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {imp.from_header ?? imp.envelope_from ?? 'Unknown sender'} · {formatTimestamp(imp.received_at)}
        </p>
        <div className="mt-2">
          <StatusPill className={IMPORT_STATUS[imp.status].pill}>{IMPORT_STATUS[imp.status].label}</StatusPill>
        </div>
      </div>

      {imp.status === 'failed' && (
        <p className="whitespace-pre-wrap rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{imp.error}</p>
      )}

      {result && (
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          {result.trip_id ? (
            <p>
              {result.created_trip ? 'Created a new trip, ' : 'Added to '}
              <Link to={`/trips/${result.trip_id}`} className="font-medium text-teal-700 underline">
                {result.trip_name}
              </Link>
              .
            </p>
          ) : (
            <p>Nothing was added.</p>
          )}
          {result.message && <p className="mt-1 text-sm text-stone-500">{result.message}</p>}
        </section>
      )}

      {imp.entries.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Entries from this email</h2>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {imp.entries.map((e) => (
              <li key={e.id}>
                <Link to={`/trips/${e.trip_id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-stone-50">
                  <span aria-hidden>{entryIcon(e)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{e.title}</span>
                    <span className="block text-sm text-stone-500">
                      {e.start_date ? formatDay(e.start_date, currentYear) : 'Unscheduled'}
                      {e.start_time && `, ${e.start_time}`} · in {e.trip_name}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">
            Open an entry in its trip to fix details, move it to another trip or delete it.
          </p>
        </section>
      )}

      {!pending && (
        <section className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button onClick={retry}>Run the import again</Button>
            <a
              href={`/api/imports/${imp.id}/raw`}
              className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
            >
              Download original (.eml)
            </a>
          </div>
          {imp.entries.length > 0 && (
            <p className="text-xs text-stone-500">
              Running it again adds fresh entries. The ones above stay until you delete them.
            </p>
          )}
          <FormError message={retryError} />
        </section>
      )}

      {imp.body_text && (
        <details className="rounded-2xl border border-stone-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 font-medium">What the model read</summary>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words border-t border-stone-100 px-4 py-3 text-xs text-stone-700">
            {imp.body_text}
          </pre>
        </details>
      )}

      {imp.llm_output != null && (
        <details className="rounded-2xl border border-stone-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 font-medium">Raw model output</summary>
          <pre className="max-h-[60vh] overflow-auto border-t border-stone-100 px-4 py-3 text-xs text-stone-700">
            {JSON.stringify(imp.llm_output, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
