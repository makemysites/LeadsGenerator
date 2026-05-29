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
 *
 * Uses overpass.osm.ch as primary (more reliable from serverless) and
 * falls back to overpass-api.de if the primary fails.
 *
 * Hyderabad bounding box: south=17.20, west=78.30, north=17.60, east=78.65
 */
export async function scrapeOverpass(): Promise<OverpassElement[]> {
  // Overpass QL query — [out:json] ensures JSON response, not XML
  const query = `[out:json][timeout:60];
(
  node["amenity"="doctors"](17.20,78.30,17.60,78.65);
  node["amenity"="clinic"](17.20,78.30,17.60,78.65);
  node["healthcare"="doctor"](17.20,78.30,17.60,78.65);
  way["amenity"="clinic"](17.20,78.30,17.60,78.65);
  way["amenity"="doctors"](17.20,78.30,17.60,78.65);
);
out body center;`;

  const endpoints = [
    'https://overpass.osm.ch/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Overpass: trying ${endpoint}...`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      console.log(`Overpass: ${endpoint} → HTTP ${response.status}`);

      if (!response.ok) {
        const body = await response.text();
        console.error(`Overpass ${endpoint} failed (${response.status}): ${body.substring(0, 300)}`);
        continue; // try next endpoint
      }

      const data = await response.json();
      const elements: OverpassElement[] = data.elements || [];
      console.log(`Overpass: got ${elements.length} elements from ${endpoint}`);
      return elements;

    } catch (err) {
      console.error(`Overpass ${endpoint} error:`, err);
      // try next endpoint
    }
  }

  console.error('Overpass: all endpoints failed, returning empty array.');
  return [];
}
