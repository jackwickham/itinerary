import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from './ui';

/**
 * A modal that slides up from the bottom on phones and sits centred on wider
 * screens. Built on <dialog> for focus trapping, Escape handling and top-layer
 * stacking. Mount it to open it; `onClose` fires on Escape, backdrop tap or ×.
 * `footer` stays pinned below the scrolling content (use the `form` attribute to
 * point its buttons at a form in the body).
 */
export function Sheet({
  title,
  onClose,
  footer,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 mt-auto w-full max-w-none animate-sheet-up rounded-t-2xl bg-white p-0 text-stone-900 shadow-2xl sm:m-auto sm:max-w-lg sm:rounded-2xl"
      style={{ maxHeight: '92dvh' }}
    >
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div
          className={cx(
            'overflow-y-auto overscroll-contain px-4 pt-4',
            footer ? 'pb-4' : 'pb-[calc(1rem+env(safe-area-inset-bottom))]',
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-stone-100 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
