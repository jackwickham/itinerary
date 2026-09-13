import { useState, type ReactNode } from 'react';
import { ENTRY_ICONS, ICONS_BY_TYPE, ICON_KEYS, type EntryIcon, type EntryType } from '../../shared/constants';
import { guessIcon } from '../format';
import { cx } from './ui';

function IconButton({
  selected,
  label,
  onClick,
  children,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg border px-2 transition',
        selected
          ? 'border-teal-600 bg-teal-50 ring-2 ring-teal-600/20'
          : 'border-stone-200 bg-white hover:border-stone-400',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Choose an entry's icon. The type's usual icons are offered first, with the
 * rest behind "More"; "Auto" leaves it to the type and title.
 */
export function IconPicker({
  type,
  title,
  value,
  onChange,
}: {
  type: EntryType;
  title: string;
  value: EntryIcon | null;
  onChange: (icon: EntryIcon | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const suggested = ICONS_BY_TYPE[type];
  const keys = showAll ? ICON_KEYS : value && !suggested.includes(value) ? [...suggested, value] : suggested;
  const auto = ENTRY_ICONS[guessIcon({ type, title })];

  return (
    <div className="flex flex-wrap gap-1.5">
      <IconButton selected={value === null} label={`Automatic (${auto.label})`} onClick={() => onChange(null)}>
        <span className="text-xs font-medium text-stone-600">Auto</span>
        <span aria-hidden className="text-lg">
          {auto.emoji}
        </span>
      </IconButton>
      {keys.map((key) => (
        <IconButton key={key} selected={value === key} label={ENTRY_ICONS[key].label} onClick={() => onChange(key)}>
          <span aria-hidden className="text-xl">
            {ENTRY_ICONS[key].emoji}
          </span>
        </IconButton>
      ))}
      {!showAll && (
        <button type="button" onClick={() => setShowAll(true)} className="px-2 text-sm text-teal-700">
          More…
        </button>
      )}
    </div>
  );
}
