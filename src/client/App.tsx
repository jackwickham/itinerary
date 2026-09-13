import { Link, Route, Routes } from 'react-router';
import { ToastProvider } from './components/Toast';
import HomePage from './pages/HomePage';
import ImportDetailPage from './pages/ImportDetailPage';
import ImportsPage from './pages/ImportsPage';
import TripPage from './pages/TripPage';

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/trips/:id" element={<TripPage />} />
        <Route path="/imports" element={<ImportsPage />} />
        <Route path="/imports/:id" element={<ImportDetailPage />} />
        <Route
          path="*"
          element={
            <div className="mx-auto max-w-2xl px-4 py-16 text-center">
              <p className="text-stone-600">Page not found.</p>
              <Link to="/" className="mt-2 inline-block text-teal-700 underline">
                Back to trips
              </Link>
            </div>
          }
        />
      </Routes>
    </ToastProvider>
  );
}
