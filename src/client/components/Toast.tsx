import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';

type Tone = 'info' | 'error';
type ShowToast = (message: string, tone?: Tone) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; tone: Tone } | null>(null);
  const nextId = useRef(0);

  const show = useCallback<ShowToast>((message, tone = 'info') => {
    const id = ++nextId.current;
    setToast({ id, message, tone });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), tone === 'error' ? 5000 : 3000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
        >
          <div
            className={cx(
              'animate-fade-in rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg',
              toast.tone === 'error' ? 'bg-red-700' : 'bg-stone-800',
            )}
          >
            {toast.message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  return useContext(ToastContext);
}
