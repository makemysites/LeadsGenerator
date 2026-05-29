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
      limit: '50',
      fields: 'fsq_id,name,location,tel,website,rating,stats',
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
    return data.results || [];
  } catch (error) {
    console.error('Foursquare search error:', error);
    return [];
  }
}
