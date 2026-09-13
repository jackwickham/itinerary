import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ImportSummary } from '../../shared/schemas';
import { api, errorMessage } from '../api';
import { ErrorState, LoadingState, StatusPill, cx } from '../components/ui';
import { IMPORT_STATUS, formatTimestamp, isImportPending, summariseImport } from '../format';

export default function ImportsPage() {
  const [imports, setImports] = useState<ImportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listImports().then(
      (list) => {
        setImports(list);
        setError(null);
      },
      (err) => setError(errorMessage(err)),
    );
  }, []);
  useEffect(load, [load]);

  // Keep refreshing while anything is still being processed.
  const pending = imports?.some(isImportPending) ?? false;
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [pending, load]);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-5">
      <Link to="/" className="text-sm text-teal-700">
        ← All trips
      </Link>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Email imports</h1>
      <p className="mt-1 text-sm text-stone-500">
        Booking emails forwarded to your import address, and what each one added.
      </p>

      <div className="mt-6">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !imports ? (
          <LoadingState />
        ) : imports.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-stone-500">
            Nothing imported yet.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {imports.map((imp) => (
              <li key={imp.id}>
                <Link to={`/imports/${imp.id}`} className="block px-4 py-3 hover:bg-stone-50">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-medium">{imp.subject ?? '(no subject)'}</span>
                    <StatusPill className={cx('shrink-0', IMPORT_STATUS[imp.status].pill)}>
                      {IMPORT_STATUS[imp.status].label}
                    </StatusPill>
                  </div>
                  <p
                    className={cx(
                      'mt-0.5 truncate text-sm',
                      imp.status === 'failed' ? 'text-red-700' : 'text-stone-600',
                    )}
                  >
                    {summariseImport(imp)}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-400">{formatTimestamp(imp.received_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
