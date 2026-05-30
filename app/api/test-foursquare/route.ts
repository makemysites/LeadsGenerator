import { NextResponse } from 'next/server';
import { searchGooglePlaces } from '@/lib/scraper/googlePlaces';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint — tests ONE Google Places Text Search call.
 * Visit /api/test-foursquare in your browser to see the raw API response.
 * This tells us immediately if the Google Places API key works.
 */
export async function GET(): Promise<NextResponse> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  const keyInfo = {
    GOOGLE_PLACES_API_KEY: apiKey ? `SET (prefix: ${apiKey.substring(0, 8)}...)` : 'MISSING',
    FOURSQUARE_API_KEY: process.env.FOURSQUARE_API_KEY
      ? 'SET but retired (410 Gone as of May 15 2026 — no longer used)'
      : 'NOT SET',
  };

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      keyInfo,
      error:
        'GOOGLE_PLACES_API_KEY is not set in Vercel environment variables. ' +
        'Get a key from https://console.cloud.google.com → enable "Places API (New)" → create an API key.',
    });
  }

  const places = await searchGooglePlaces('Dentist', 'Banjara Hills', 3);

  return NextResponse.json({
    success: places.length > 0,
    keyInfo,
    resultsCount: places.length,
    firstPlace: places[0] ?? null,
    message:
      places.length > 0
        ? `✅ Google Places API is working! Got ${places.length} results.`
        : '⚠️ Google Places API key is set but returned 0 results. Check Vercel logs for the error body.',
  });
}
