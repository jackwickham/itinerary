/**
 * Enumerations shared by client and server. Kept free of zod so the client can
 * import them without pulling the schema library into its bundle.
 */

export const ENTRY_TYPES = ['travel', 'accommodation', 'activity', 'reservation', 'note', 'other'] as const;
export const ENTRY_STATUSES = ['idea', 'tentative', 'booked', 'cancelled'] as const;
export const SOURCES = ['manual', 'email'] as const;

export type EntryType = (typeof ENTRY_TYPES)[number];
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export type Source = (typeof SOURCES)[number];

/** Statuses that count as committed plans, and so drive a trip's inferred dates. */
export const DATE_DRIVING_STATUSES: readonly EntryStatus[] = ['booked', 'tentative'];

/**
 * Icons an entry can show. Entries store the key; renaming or removing a key
 * orphans stored values (they fall back to the automatic icon), so only add.
 */
export const ENTRY_ICONS = {
  plane: { emoji: '✈️', label: 'Flight' },
  train: { emoji: '🚆', label: 'Train' },
  bus: { emoji: '🚌', label: 'Bus or coach' },
  car: { emoji: '🚗', label: 'Car' },
  taxi: { emoji: '🚕', label: 'Taxi or transfer' },
  ferry: { emoji: '⛴️', label: 'Ferry' },
  bike: { emoji: '🚲', label: 'Bike' },
  walk: { emoji: '🚶', label: 'Walk' },
  bed: { emoji: '🛏️', label: 'Bed' },
  hotel: { emoji: '🏨', label: 'Hotel' },
  house: { emoji: '🏠', label: 'House or apartment' },
  camping: { emoji: '⛺', label: 'Camping' },
  ticket: { emoji: '🎟️', label: 'Ticket' },
  museum: { emoji: '🏛️', label: 'Museum or sight' },
  tour: { emoji: '🗺️', label: 'Tour' },
  hiking: { emoji: '🥾', label: 'Hiking' },
  beach: { emoji: '🏖️', label: 'Beach' },
  skiing: { emoji: '⛷️', label: 'Skiing' },
  music: { emoji: '🎵', label: 'Music or show' },
  sport: { emoji: '⚽', label: 'Sport' },
  spa: { emoji: '💆', label: 'Spa' },
  shopping: { emoji: '🛍️', label: 'Shopping' },
  dining: { emoji: '🍽️', label: 'Dining' },
  drinks: { emoji: '🍷', label: 'Drinks' },
  coffee: { emoji: '☕', label: 'Café' },
  note: { emoji: '📝', label: 'Note' },
  info: { emoji: 'ℹ️', label: 'Info' },
  star: { emoji: '⭐', label: 'Highlight' },
  pin: { emoji: '📌', label: 'Pin' },
} as const;

export type EntryIcon = keyof typeof ENTRY_ICONS;

export const ICON_KEYS = Object.keys(ENTRY_ICONS) as [EntryIcon, ...EntryIcon[]];

/** The icons offered first for each type; any icon can still be chosen. */
export const ICONS_BY_TYPE: Record<EntryType, EntryIcon[]> = {
  travel: ['plane', 'train', 'bus', 'car', 'taxi', 'ferry', 'bike', 'walk'],
  accommodation: ['bed', 'hotel', 'house', 'camping'],
  activity: ['ticket', 'museum', 'tour', 'hiking', 'beach', 'skiing', 'music', 'sport', 'spa', 'shopping'],
  reservation: ['dining', 'drinks', 'coffee', 'ticket', 'spa'],
  note: ['note', 'info', 'star', 'pin'],
  other: ['pin', 'star', 'info', 'shopping'],
};

/** Shown for an entry with no icon chosen (travel may guess better from its title). */
export const DEFAULT_ICON: Record<EntryType, EntryIcon> = {
  travel: 'plane',
  accommodation: 'bed',
  activity: 'ticket',
  reservation: 'dining',
  note: 'note',
  other: 'pin',
};
