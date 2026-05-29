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

/**
 * Searches for doctor places using the Foursquare Places API v3 Search endpoint.
 * NOTE: The search endpoint does NOT return the `website` field reliably.
 * Use `getFoursquarePlaceDetails` after this to get the website for each place.
 * Returns an array of Foursquare places, or an empty array on failure.
 */
export async function searchFoursquarePlaces(
  specialty: string,
  area: string
): Promise<FoursquarePlace[]> {
  try {
    const apiKey = process.env.FOURSQUARE_API_KEY;
    if (!apiKey) {
      throw new Error('FOURSQUARE_API_KEY environment variable is not set.');
    }

    const query = `${specialty} doctor`;
    const near = `${area}, Hyderabad, India`;
    const params = new URLSearchParams({
      query,
      near,
      limit: '10',
      // website field is NOT available from search — use Place Details endpoint instead
      fields: 'fsq_id,name,location,tel,rating,stats',
    });

    const response = await fetch(
      `https://api.foursquare.com/v3/places/search?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: apiKey,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Foursquare search failed (${response.status}): ${errorBody}`
      );
      return [];
    }

    const data = await response.json();
    const results: FoursquarePlace[] = data.results || [];

    // Debug: Log raw first result so we can see exact structure
    if (results.length > 0) {
      console.log('RAW RESPONSE first result:', JSON.stringify(results[0], null, 2));
      console.log('Total results returned:', results.length);
      console.log('First result website field (from search):', results[0]?.website);
    } else {
      console.log(`Search returned 0 results for "${query}" near "${near}"`);
    }

    return results;
  } catch (error) {
    console.error('Foursquare search error:', error);
    return [];
  }
}

/**
 * Fetches full Place Details for a given fsq_id, including the `website` field.
 * The search endpoint does NOT reliably return the website field.
 * This is a separate API call per place.
 * Returns the full place detail object, or null on failure.
 */
export async function getFoursquarePlaceDetails(
  fsqId: string
): Promise<FoursquarePlace | null> {
  try {
    const apiKey = process.env.FOURSQUARE_API_KEY;
    if (!apiKey) {
      throw new Error('FOURSQUARE_API_KEY environment variable is not set.');
    }

    const params = new URLSearchParams({
      fields: 'fsq_id,name,location,tel,website,rating,stats',
    });

    const response = await fetch(
      `https://api.foursquare.com/v3/places/${fsqId}?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: apiKey,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Foursquare place details failed for ${fsqId} (${response.status}): ${errorBody}`
      );
      return null;
    }

    const data: FoursquarePlace = await response.json();
    return data;
  } catch (error) {
    console.error(`Foursquare place details error for ${fsqId}:`, error);
    return null;
  }
}
