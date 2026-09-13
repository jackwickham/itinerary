import type { Detail } from '../../shared/schemas';
import { inputClass } from './ui';

const LABEL_SUGGESTIONS = [
  'Booking ref',
  'Confirmation number',
  'Provider',
  'Flight',
  'Train',
  'Seat',
  'Coach',
  'Terminal',
  'Platform',
  'Address',
  'Phone',
  'Check-in',
  'Check-out',
  'Price',
];

/** Editable label/value pairs such as booking references and seat numbers. */
export function DetailsEditor({ value, onChange }: { value: Detail[]; onChange: (details: Detail[]) => void }) {
  const update = (index: number, patch: Partial<Detail>) =>
    onChange(value.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-2">
      <datalist id="detail-labels">
        {LABEL_SUGGESTIONS.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      {value.map((detail, index) => (
        <div key={index} className="flex gap-2">
          {/* Widths live on wrappers: inputClass's w-full would override them on the inputs. */}
          <div className="w-2/5 shrink-0">
            <input
              list="detail-labels"
              className={inputClass}
              placeholder="Label"
              value={detail.label}
              onChange={(e) => update(index, { label: e.target.value })}
            />
          </div>
          <div className="min-w-0 flex-1">
            <input
              className={inputClass}
              placeholder="Value"
              value={detail.value}
              onChange={(e) => update(index, { value: e.target.value })}
            />
          </div>
          <button
            type="button"
            aria-label="Remove detail"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            className="shrink-0 rounded-lg px-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm text-teal-700"
        onClick={() => onChange([...value, { label: '', value: '' }])}
      >
        + Add detail
      </button>
    </div>
  );
}

/** Drops empty rows and gives an unlabelled value a generic label. */
export function cleanDetails(details: Detail[]): Detail[] {
  return details
    .map((d) => ({ label: d.label.trim() || 'Detail', value: d.value.trim() }))
    .filter((d) => d.value !== '');
}
