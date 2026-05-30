/**
 * Google Places API (New) — Text Search
 *
 * Endpoint: POST https://places.googleapis.com/v1/places:searchText
 * Auth: X-Goog-Api-Key header
 * Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 *
 * COST: $17 per 1000 requests after $200/month free credit (~11,765 free calls/month)
 * With 100 calls/day = ~3000/month = well within free tier.
 *
 * KEY ADVANTAGE over Foursquare:
 * - Website field is returned IN THE SEARCH RESPONSE (no separate details call needed)
 * - This halves the API call count
 * - Much better India coverage
 */

export interface GooglePlace {
  id: string;
  displayName: {
    text: string;
    languageCode?: string;
  };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;        // Absent (undefined) when place has no website
  rating?: number;            // Already on 0-5 scale (unlike Foursquare's 0-10)
  userRatingCount?: number;
  addressComponents?: Array<{
    longText: string;
    shortText: string;
    types: string[];
  }>;
}

/**
 * Extracts the locality/suburb from addressComponents.
 * Returns the most specific area name available (sublocality > locality > fallback).
 */
export function extractArea(place: GooglePlace, fallback: string): string {
  const components = place.addressComponents || [];

  const sublocality = components.find(
    (c) => c.types?.includes('sublocality_level_1') || c.types?.includes('sublocality')
  );
  if (sublocality) return sublocality.longText;

  const locality = components.find((c) => c.types?.includes('locality'));
  if (locality) return locality.longText;

  return fallback;
}

/**
 * TEXT SEARCH — POST /v1/places:searchText
 *
 * Returns up to `limit` places matching the query near the given area.
 * The response already includes name, address, phone, website, rating — no separate details call.
 *
 * Returns an empty array on error (never throws).
 */
export async function searchGooglePlaces(
  specialty: string,
  area: string,
  limit = 10
): Promise<GooglePlace[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    console.error('GOOGLE_PLACES_API_KEY is not set in environment variables.');
    return [];
  }

  console.log(`Google Places API key prefix: ${apiKey.substring(0, 8)}...`);

  const textQuery = `${specialty} doctor clinic in ${area}, Hyderabad, India`;
  const url = 'https://places.googleapis.com/v1/places:searchText';

  const body = JSON.stringify({
    textQuery,
    maxResultCount: limit,
    languageCode: 'en',
    regionCode: 'IN',
  });

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.addressComponents',
    'places.nationalPhoneNumber',
    'places.internationalPhoneNumber',
    'places.websiteUri',
    'places.rating',
    'places.userRatingCount',
  ].join(',');

  console.log(`GOOGLE SEARCH → "${textQuery}" (limit ${limit})`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body,
    });
  } catch (networkErr) {
    console.error('Google Places network error:', networkErr);
    return [];
  }

  const rawBody = await response.text();
  console.log(`GOOGLE SEARCH status: ${response.status}`);
  console.log(`GOOGLE SEARCH body (first 600 chars): ${rawBody.substring(0, 600)}`);

  if (!response.ok) {
    console.error(`GOOGLE SEARCH FAILED: HTTP ${response.status} — ${rawBody}`);
    return [];
  }

  let data: { places?: GooglePlace[] };
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.error('GOOGLE SEARCH: failed to parse JSON:', rawBody);
    return [];
  }

  const places = data.places || [];
  console.log(`GOOGLE SEARCH "${textQuery}": ${places.length} results`);

  if (places.length > 0) {
    console.log('GOOGLE SEARCH first result:', JSON.stringify(places[0], null, 2));
  }

  return places;
}
