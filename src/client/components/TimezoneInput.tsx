import { canonicalTimeZone } from '../../shared/dates';
import { cx, inputClass } from './ui';

const DATALIST_ID = 'time-zone-options';

const ALL_ZONES: string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

/** Render once per form; every TimezoneInput suggests from it. */
export function TimezoneDatalist() {
  return (
    <datalist id={DATALIST_ID}>
      {ALL_ZONES.map((zone) => (
        <option key={zone} value={zone} />
      ))}
    </datalist>
  );
}

export function TimezoneInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const invalid = value.trim() !== '' && !canonicalTimeZone(value);
  return (
    <div>
      <input
        list={DATALIST_ID}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          const canonical = canonicalTimeZone(value);
          if (canonical && canonical !== value) onChange(canonical);
        }}
        placeholder={placeholder ?? 'e.g. Europe/Paris'}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className={cx(inputClass, invalid && 'border-red-400')}
      />
      {invalid && <span className="mt-1 block text-xs text-red-700">Unknown time zone</span>}
    </div>
  );
}
