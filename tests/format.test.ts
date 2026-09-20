import { describe, expect, it } from 'vitest';
import { browserTimeZone, formatInstant, inViewerZone } from '../src/client/format.js';

const reference = { date: '2026-09-20', currentYear: 2026 };

describe('formatting an instant where it happens', () => {
  it('names the zone when asked, and the day when it is not the entry\'s', () => {
    const iso = '2026-09-20T22:15:00Z';
    expect(formatInstant(iso, 'Europe/London', reference)).toBe('23:15');
    expect(formatInstant(iso, 'Europe/London', reference, { zone: true })).toBe('23:15 BST');
    expect(formatInstant(iso, 'Asia/Tokyo', reference, { zone: true })).toBe('07:15 (21 Sep) GMT+9');
  });

  it('falls back to the viewer\'s own clock, unlabelled, when the zone is unknown', () => {
    const iso = '2026-09-20T22:15:00Z';
    expect(formatInstant(iso, null, reference, { zone: true })).toBe(formatInstant(iso, null, reference));
  });
});

describe('the same moment on the viewer\'s clock', () => {
  const home = browserTimeZone();
  // Always a different reading from wherever the tests happen to run.
  const elsewhere = home === 'Pacific/Kiritimati' ? 'Pacific/Honolulu' : 'Pacific/Kiritimati';

  it('is left out when it says the same thing', () => {
    expect(inViewerZone('2026-09-20T22:15:00Z', home, reference)).toBeNull();
    expect(inViewerZone('2026-09-20T22:15:00Z', null, reference)).toBeNull();
  });

  it('is spelled out when the flight is somewhere else', () => {
    const iso = '2026-09-20T22:15:00Z';
    expect(inViewerZone(iso, elsewhere, reference)).toBe(formatInstant(iso, home, reference));
  });
});
