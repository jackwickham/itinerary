import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { groupTripsForHome, todayLocal } from '../../shared/dates';
import type { Trip } from '../../shared/schemas';
import { api, errorMessage } from '../api';
import { NewTripSheet } from '../components/NewTripSheet';
import { TripCard } from '../components/TripCard';
import { Button, ErrorState, LoadingState } from '../components/ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lastImportFailed, setLastImportFailed] = useState(false);

  useEffect(() => {
    api.listImports(1).then(
      (latest) => setLastImportFailed(latest[0]?.status === 'failed'),
      () => {},
    );
  }, []);

  const load = useCallback(() => {
    api.listTrips().then(
      (t) => {
        setTrips(t);
        setError(null);
      },
      (err) => setError(errorMessage(err)),
    );
  }, []);
  useEffect(load, [load]);

  const today = todayLocal();

  let content: ReactNode;
  if (error) {
    content = <ErrorState message={error} onRetry={load} />;
  } else if (!trips) {
    content = <LoadingState />;
  } else if (trips.length === 0) {
    content = (
      <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
        <p className="text-lg font-medium">No trips yet</p>
        <p className="mt-1 text-sm text-stone-500">
          Create one to start planning, or forward a booking confirmation to your import address.
        </p>
        <Button variant="primary" className="mt-5" onClick={() => setCreating(true)}>
          + New trip
        </Button>
      </div>
    );
  } else {
    const groups = groupTripsForHome(trips, today);
    content = (
      <>
        {groups.current.length > 0 && (
          <Section title="Now">
            {groups.current.map((t) => (
              <TripCard key={t.id} trip={t} today={today} highlight />
            ))}
          </Section>
        )}
        {groups.upcoming.length > 0 && (
          <Section title="Upcoming">
            {groups.upcoming.map((t) => (
              <TripCard key={t.id} trip={t} today={today} />
            ))}
          </Section>
        )}
        {groups.undated.length > 0 && (
          <Section title="No dates yet">
            {groups.undated.map((t) => (
              <TripCard key={t.id} trip={t} today={today} />
            ))}
          </Section>
        )}
        {groups.current.length + groups.upcoming.length + groups.undated.length === 0 && (
          <p className="mb-8 text-stone-500">Nothing coming up.</p>
        )}
        {groups.past.length > 0 &&
          (showPast ? (
            <Section title="Past">
              {groups.past.map((t) => (
                <TripCard key={t.id} trip={t} today={today} />
              ))}
            </Section>
          ) : (
            <button className="text-sm text-teal-700" onClick={() => setShowPast(true)}>
              Show {groups.past.length} past {groups.past.length === 1 ? 'trip' : 'trips'}
            </button>
          ))}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Trips</h1>
        <div className="flex items-center gap-4">
          <Link to="/imports" className="relative text-sm font-medium text-stone-600 hover:text-stone-900">
            ✉ Imports
            {lastImportFailed && (
              <span
                className="absolute -right-2.5 -top-0.5 h-2 w-2 rounded-full bg-red-500"
                title="The latest import failed"
              />
            )}
          </Link>
          <div className="hidden sm:block">
            <Button variant="primary" onClick={() => setCreating(true)}>
              + New trip
            </Button>
          </div>
        </div>
      </header>

      {content}

      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-20 rounded-full bg-teal-700 px-5 py-3.5 font-semibold text-white shadow-lg transition active:scale-95 sm:hidden"
      >
        + New trip
      </button>

      {creating && (
        <NewTripSheet onClose={() => setCreating(false)} onCreated={(trip) => navigate(`/trips/${trip.id}`)} />
      )}
    </div>
  );
}
