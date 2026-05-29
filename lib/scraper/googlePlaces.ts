import type { PlaceResult, PlaceDetails } from '@/types';

const SEARCH_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount';

const DETAILS_FIELD_MASK =
  'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,googleMapsUri,rating,userRatingCount';

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_PLACES_API_KEY environment variable is not set.');
  }
  return key;
}

/**
 * Searches for places using the Google Places API (New) Text Search endpoint.
 * Returns an array of place results, or an empty array on failure.
 */
export async function textSearch(query: string): Promise<PlaceResult[]> {
  try {
    const apiKey = getApiKey();

    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': SEARCH_FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: 'en',
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Google Places textSearch failed (${response.status}): ${errorBody}`
      );
      return [];
    }

    const data = await response.json();
    const places: PlaceResult[] = data.places || [];
    return places;
  } catch (error) {
    console.error('Google Places textSearch error:', error);
    return [];
  }
}

/**
 * Fetches details for a specific place using the Google Places API (New).
 * Returns place details, or null on failure.
 */
export async function getPlaceDetails(
  placeId: string
): Promise<PlaceDetails | null> {
  try {
    const apiKey = getApiKey();

    // The new API uses the resource name format: places/{placeId}
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': DETAILS_FIELD_MASK,
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Google Places getPlaceDetails failed (${response.status}): ${errorBody}`
      );
      return null;
    }

    const data: PlaceDetails = await response.json();
    return data;
  } catch (error) {
    console.error('Google Places getPlaceDetails error:', error);
    return null;
  }
}
