export interface OverpassElement {
  type: 'node' | 'way';
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: {
    name?: string;
    phone?: string;
    'contact:phone'?: string;
    website?: string;
    'contact:website'?: string;
    'addr:street'?: string;
    'addr:suburb'?: string;
    'addr:city'?: string;
    'healthcare:speciality'?: string;
    amenity?: string;
  };
}

/**
 * Queries OpenStreetMap via the Overpass API for doctors and clinics in Hyderabad.
 * Returns an array of OSM element results, or an empty array on failure.
 */
export async function scrapeOverpass(): Promise<OverpassElement[]> {
  try {
    const query = `[out:json][timeout:60];
(
  node["amenity"="doctors"](17.20,78.30,17.60,78.65);
  node["amenity"="clinic"](17.20,78.30,17.60,78.65);
  node["healthcare"="doctor"](17.20,78.30,17.60,78.65);
  way["amenity"="clinic"](17.20,78.30,17.60,78.65);
  way["amenity"="doctors"](17.20,78.30,17.60,78.65);
);
out body center;`;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ data: query }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Overpass API failed (${response.status}): ${errorBody}`);
      return [];
    }

    const data = await response.json();
    return data.elements || [];
  } catch (error) {
    console.error('Overpass API error:', error);
    return [];
  }
}
