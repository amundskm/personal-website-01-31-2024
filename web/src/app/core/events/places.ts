/**
 * Address search for the event form, shared by the group-events Lambda (which
 * calls Amazon Location Service) and the form's address picker.
 *
 *   GET /events/places?q=<text> → { suggestions: PlaceSuggestion[] }
 *   GET /events/places?id=<id>  → PlaceDetails
 */

import type { EventCoords } from './events';

/** Shortest search the picker sends; fewer letters match too much to help. */
export const MIN_PLACE_QUERY = 3;
export const MAX_PLACE_QUERY = 200;
export const MAX_PLACE_SUGGESTIONS = 6;

/** Searches favour places near Cedar Falls/Waterloo, Iowa ([longitude, latitude]). */
export const PLACES_BIAS_POSITION: [number, number] = [-92.4, 42.5];

/** One row in the picker's list. */
export interface PlaceSuggestion {
  id: string;
  /** A business or landmark name, or the street line of an address. */
  title: string;
  /** The rest of the address, shown under the title. */
  subtitle: string;
  /** A named place (bar, park, venue) rather than a plain address. */
  isPlace: boolean;
}

/** What picking a suggestion fills in. */
export interface PlaceDetails {
  /** A named place's name, to fill in "Place"; null for a plain address. */
  name: string | null;
  /** The full, formatted address. */
  address: string;
  coords: EventCoords | null;
}

/** The parts of Amazon Location's Suggest and GetPlace results used here. */
interface LocationPlace {
  PlaceId?: string;
  PlaceType?: string;
  Title?: string;
  Address?: { Label?: string };
  Position?: number[];
}

interface LocationSuggestItem {
  Title?: string;
  SuggestResultItemType?: string;
  Place?: LocationPlace;
}

/** Turns Suggest results into picker rows: places only (not query refinements). */
export function toSuggestions(items: LocationSuggestItem[] = []): PlaceSuggestion[] {
  const rows: PlaceSuggestion[] = [];
  for (const item of items) {
    const id = item.Place?.PlaceId;
    if (item.SuggestResultItemType !== 'Place' || !id || !item.Title) continue;
    const isPlace = item.Place?.PlaceType === 'PointOfInterest';
    const label = item.Place?.Address?.Label || item.Title;
    const title = isPlace ? item.Title : label.split(',')[0];
    rows.push({ id, title, subtitle: restOf(label, title), isPlace });
    if (rows.length === MAX_PLACE_SUGGESTIONS) break;
  }
  return rows;
}

/** Turns a GetPlace result into what the form fills in. */
export function toPlaceDetails(place: LocationPlace): PlaceDetails | null {
  const address = place.Address?.Label?.trim() || place.Title?.trim();
  if (!address) return null;
  const [lon, lat] = place.Position ?? [];
  return {
    name: place.PlaceType === 'PointOfInterest' ? (place.Title?.trim() ?? null) : null,
    // A named place's label starts with its name; the address is the rest
    address:
      place.PlaceType === 'PointOfInterest' && place.Title
        ? restOf(address, place.Title) || address
        : address,
    coords: validCoords({ lat, lon }) ? { lat: round(lat), lon: round(lon) } : null,
  };
}

/** `label` without a leading `first` and its comma. */
function restOf(label: string, first: string): string {
  return label.startsWith(first) ? label.slice(first.length).replace(/^,\s*/, '') : label;
}

/** About 1 m: plenty for a map pin. */
const round = (n: number) => Math.round(n * 1e5) / 1e5;

export function validCoords(value: unknown): value is EventCoords {
  const c = value as Partial<EventCoords> | null;
  return (
    !!c &&
    typeof c === 'object' &&
    typeof c.lat === 'number' &&
    typeof c.lon === 'number' &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lon) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lon) <= 180
  );
}
