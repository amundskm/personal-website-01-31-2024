import { GeoPlacesClient, GetPlaceCommand, SuggestCommand } from '@aws-sdk/client-geo-places';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
  MAX_PLACE_QUERY,
  MAX_PLACE_SUGGESTIONS,
  MIN_PLACE_QUERY,
  PLACES_BIAS_POSITION,
  toPlaceDetails,
  toSuggestions,
} from '../../../src/app/core/events/places';
import { json } from '../shared/http';

const places = new GeoPlacesClient({});

/**
 * Address search for the event form (Amazon Location Service, Places v2):
 *   ?q=<text> → { suggestions }   (as you type)
 *   ?id=<id>  → PlaceDetails       (the one picked)
 */
export async function searchPlaces(
  query: Record<string, string | undefined> = {},
): Promise<APIGatewayProxyStructuredResultV2> {
  const id = query['id']?.trim();
  if (id) {
    if (id.length > 1000) return json(400, { message: 'Invalid place' });
    const place = await places.send(
      // The address and its position are saved with the event
      new GetPlaceCommand({ PlaceId: id, Language: 'en', IntendedUse: 'Storage' }),
    );
    const details = toPlaceDetails(place);
    return details ? json(200, details) : json(404, { message: 'Place not found' });
  }

  const text = query['q']?.trim() ?? '';
  if (text.length < MIN_PLACE_QUERY) return json(200, { suggestions: [] });
  const { ResultItems } = await places.send(
    new SuggestCommand({
      QueryText: text.slice(0, MAX_PLACE_QUERY),
      // Query refinements ("bars near…") are filtered out; the API requires at least 1
      MaxResults: MAX_PLACE_SUGGESTIONS + 2,
      BiasPosition: PLACES_BIAS_POSITION,
      // Elsewhere can still be typed in by hand
      Filter: { IncludeCountries: ['USA'] },
      Language: 'en',
    }),
  );
  return json(200, { suggestions: toSuggestions(ResultItems) });
}
