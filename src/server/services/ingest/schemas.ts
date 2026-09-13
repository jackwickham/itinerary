import { z } from 'zod';
import { ENTRY_TYPES, ICON_KEYS } from '../../../shared/constants.js';

/**
 * What the model returns. Every field is required-but-nullable, as OpenAI's strict
 * structured outputs demand; the pipeline then sanitises the values into the
 * common entry schema. Field descriptions are the extraction instructions, so
 * keep them precise rather than adding JSON examples to the prompt.
 */

const detail = z.object({
  label: z.string().describe('Short label, e.g. "Booking ref", "Flight", "Seat", "Address"'),
  value: z.string(),
});

export const proposedEntrySchema = z.object({
  title: z
    .string()
    .describe(
      'Short, specific title. Travel: "<service number> <origin city> → <destination city>", e.g. ' +
        '"BA 432 London → Lisbon" or "Eurostar 9014 London → Paris". Stays: the property name. ' +
        'Reservations and activities: what and where, e.g. "Dinner at Taberna da Rua"',
    ),
  type: z
    .enum(ENTRY_TYPES)
    .describe(
      'travel: flights, trains, buses, ferries, car hire, transfers. accommodation: hotels, rentals, ' +
        'hostels. reservation: restaurant and table bookings. activity: tours, tickets, events, classes. ' +
        'note or other: anything else',
    ),
  status: z
    .enum(['booked', 'tentative', 'cancelled'])
    .describe(
      'booked for a confirmed booking or an amendment; tentative for a provisional hold or an ' +
        'unconfirmed request; cancelled when the email cancels this booking',
    ),
  icon: z
    .enum(ICON_KEYS)
    .nullable()
    .describe(
      'The icon that best fits: plane for flights, train for rail, bus for buses and coaches, ferry, ' +
        'car for car hire, taxi for transfers; hotel, house (apartments, rentals) or camping for stays; ' +
        'dining, drinks or coffee for reservations; ticket, museum, tour, music, sport, spa and so on ' +
        'for activities. Null if nothing fits',
    ),
  start_date: z
    .string()
    .nullable()
    .describe('Local date it starts (departure, check-in), as YYYY-MM-DD. Null if not stated'),
  start_time: z
    .string()
    .nullable()
    .describe('Local 24-hour time it starts, as HH:MM, in the time zone of the start location. Null if not stated'),
  start_timezone: z
    .string()
    .nullable()
    .describe(
      'IANA time zone of the start location, e.g. "Europe/London", inferred from the place when not ' +
        'stated. Null only if the place is unknown',
    ),
  start_location: z
    .string()
    .nullable()
    .describe(
      'Where it starts: departure airport or station (with code if given, e.g. "London Heathrow (LHR) ' +
        'T5"), or the property or venue name with its full address',
    ),
  end_date: z
    .string()
    .nullable()
    .describe('Local date it ends (arrival, check-out), as YYYY-MM-DD. Null if it has no stated end'),
  end_time: z
    .string()
    .nullable()
    .describe('Local 24-hour time it ends, as HH:MM, in the time zone of the end location. Null if not stated'),
  end_timezone: z
    .string()
    .nullable()
    .describe('IANA time zone of the end location (the arrival point for travel). Null if there is no end'),
  end_location: z
    .string()
    .nullable()
    .describe('For travel, the arrival airport or station. Null for other types unless they end somewhere else'),
  details: z
    .array(detail)
    .describe(
      'Labelled facts the traveller may need to hand. Always include, when present: booking reference ' +
        'or confirmation number, carrier or provider, flight/train/service number, seat, coach or ' +
        'cabin, terminal or platform, full address, phone number, check-in and check-out times or ' +
        'windows, number of guests or travellers, room type, and total price',
    ),
  notes: z
    .string()
    .nullable()
    .describe(
      'Other useful information not captured above, as short lines: baggage allowance, fare ' +
        'conditions, cancellation deadline, how to collect tickets or keys, what is included, special ' +
        'requests. Null if there is nothing more',
    ),
});

export const emailExtractionSchema = z.object({
  entries: z
    .array(proposedEntrySchema)
    .describe(
      'One entry per distinct booked item: each flight or train leg (a return trip is two; a connection ' +
        'is one per leg), each stay (a multi-night stay is one entry from check-in to check-out), each ' +
        'reservation or ticket. Empty if the email contains no bookings',
    ),
  suggested_trip_name: z
    .string()
    .describe(
      'A short, destination-based name for a trip containing these bookings, e.g. "Lisbon", ' +
        '"Scottish Highlands" or "Japan". Name the destination, not the origin',
    ),
  destination_summary: z.string().describe('The main destination(s) of these bookings, e.g. "Lisbon, Portugal"'),
});

export const tripMatchSchema = z.object({
  reason: z.string().describe('One sentence explaining the decision'),
  trip_id: z
    .number()
    .nullable()
    .describe('The id of the existing trip these bookings belong to, or null to create a new trip'),
  new_trip_name: z
    .string()
    .nullable()
    .describe('A short destination-based name for the new trip when trip_id is null, otherwise null'),
});

export type ProposedEntry = z.output<typeof proposedEntrySchema>;
export type EmailExtraction = z.output<typeof emailExtractionSchema>;
export type TripMatch = z.output<typeof tripMatchSchema>;
