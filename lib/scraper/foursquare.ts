/**
 * Foursquare Places API v3
 *
 * All endpoints use:
 *   Base: https://api.foursquare.com/v3/places/
 *   Auth: Authorization header = raw API key (no "Bearer" prefix)
 *   Accept: application/json
 *
 * The FOURSQUARE_API_KEY must be a v3 key from developer.foursquare.com.
 * A v2 key (client_id / client_secret style) will return 410 "Gone".
 */

export interface FoursquarePlace {
  fsq_id: string;
  name: string;
  location?: {
    formatted_address?: string;
    locality?: string;
    neighborhood?: string[];
  };
  tel?: string;
  website?: string;
  rating?: number;
  stats?: {
    total_ratings?: number;
  };
}

function getApiKey(): string {
  const key = process.env.FOURSQUARE_API_KEY;
  if (!key) throw new Error('FOURSQUARE_API_KEY is not set in environment variables.');
  // Log key prefix only (never log full key) so we can confirm it's loaded
  console.log(`Foursquare API key prefix: ${key.substring(0, 8)}...`);
  return key;
}

/**
 * SEARCH — GET /v3/places/search
 *
 * Does NOT return the `website` field. Use getFoursquarePlaceDetails for that.
 * Returns an array of places (may be empty on 0 results or on error).
 */
export async function searchFoursquarePlaces(
  specialty: string,
  area: string
): Promise<FoursquarePlace[]> {
  const apiKey = getApiKey();
  const query = `${specialty} doctor`;
  const near = `${area}, Hyderabad, India`;

  const params = new URLSearchParams({
    query,
    near,
    limit: '10',
    fields: 'fsq_id,name,location,tel,rating,stats',
  });

  const url = `https://api.foursquare.com/v3/places/search?${params.toString()}`;
  console.log(`FSQ SEARCH → ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
    });
  } catch (networkErr) {
    console.error('FSQ SEARCH network error:', networkErr);
    return [];
  }

  const rawBody = await response.text();
  console.log(`FSQ SEARCH status: ${response.status}`);
  console.log(`FSQ SEARCH body (first 500 chars): ${rawBody.substring(0, 500)}`);

  if (!response.ok) {
    console.error(`FSQ SEARCH FAILED: HTTP ${response.status} — ${rawBody}`);
    return [];
  }

  let data: { results?: FoursquarePlace[] };
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.error('FSQ SEARCH: failed to parse JSON response:', rawBody);
    return [];
  }

  const results: FoursquarePlace[] = data.results || [];
  console.log(`FSQ SEARCH "${query}" near "${near}": ${results.length} results`);

  if (results.length > 0) {
    console.log('FSQ SEARCH first result:', JSON.stringify(results[0], null, 2));
  }

  return results;
}

/**
 * PLACE DETAILS — GET /v3/places/{fsq_id}
 *
 * This IS where the `website` field comes from.
 * The field is ABSENT (undefined) when the place has no website registered — NOT null.
 * Returns the place detail object, or null on error.
 */
export async function getFoursquarePlaceDetails(
  fsqId: string
): Promise<FoursquarePlace | null> {
  const apiKey = getApiKey();

  const params = new URLSearchParams({
    fields: 'fsq_id,name,location,tel,website,rating,stats',
  });

  const url = `https://api.foursquare.com/v3/places/${fsqId}?${params.toString()}`;
  console.log(`FSQ DETAILS → ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
    });
  } catch (networkErr) {
    console.error(`FSQ DETAILS network error for ${fsqId}:`, networkErr);
    return null;
  }

  const rawBody = await response.text();
  console.log(`FSQ DETAILS [${fsqId}] status: ${response.status}`);
  console.log(`FSQ DETAILS [${fsqId}] body (first 500 chars): ${rawBody.substring(0, 500)}`);

  if (!response.ok) {
    console.error(`FSQ DETAILS FAILED [${fsqId}]: HTTP ${response.status} — ${rawBody}`);
    return null;
  }

  let data: FoursquarePlace;
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.error(`FSQ DETAILS: failed to parse JSON for ${fsqId}:`, rawBody);
    return null;
  }

  return data;
}
