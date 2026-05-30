import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint — tests ONE Foursquare search + ONE Place Details call.
 * Visit /api/test-foursquare in your browser to see the raw API response.
 * This tells us immediately if the API key works and what fields come back.
 */
export async function GET(): Promise<NextResponse> {
  const apiKey = process.env.FOURSQUARE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'FOURSQUARE_API_KEY is not set in environment variables.' });
  }

  const keyInfo = {
    prefix: apiKey.substring(0, 10) + '...',
    length: apiKey.length,
    startsWithFsq3: apiKey.startsWith('fsq3'),
  };

  // ── Step 1: Search ──────────────────────────────────────────────────────────
  const searchUrl =
    'https://api.foursquare.com/v3/places/search' +
    '?query=dentist&near=Banjara+Hills%2C+Hyderabad%2C+India&limit=3' +
    '&fields=fsq_id,name,location,tel,rating,stats';

  let searchStatus: number;
  let searchBody: unknown;

  try {
    const searchRes = await fetch(searchUrl, {
      method: 'GET',
      headers: { Authorization: apiKey, Accept: 'application/json' },
    });
    searchStatus = searchRes.status;
    const rawText = await searchRes.text();
    try { searchBody = JSON.parse(rawText); } catch { searchBody = rawText; }
  } catch (err) {
    return NextResponse.json({
      keyInfo,
      error: 'Network error calling Foursquare search',
      detail: String(err),
    });
  }

  // ── Step 2: Place Details on first result (if any) ─────────────────────────
  let detailsStatus: number | null = null;
  let detailsBody: unknown = null;
  let firstFsqId: string | null = null;

  const results = (searchBody as { results?: { fsq_id: string }[] })?.results;
  if (Array.isArray(results) && results.length > 0) {
    firstFsqId = results[0].fsq_id;

    const detailsUrl =
      `https://api.foursquare.com/v3/places/${firstFsqId}` +
      '?fields=fsq_id,name,location,tel,website,rating,stats';

    try {
      const detailsRes = await fetch(detailsUrl, {
        method: 'GET',
        headers: { Authorization: apiKey, Accept: 'application/json' },
      });
      detailsStatus = detailsRes.status;
      const rawText = await detailsRes.text();
      try { detailsBody = JSON.parse(rawText); } catch { detailsBody = rawText; }
    } catch (err) {
      detailsBody = `Network error: ${String(err)}`;
    }
  }

  return NextResponse.json({
    keyInfo,
    search: {
      url: searchUrl,
      status: searchStatus!,
      body: searchBody,
    },
    details: firstFsqId
      ? { fsq_id: firstFsqId, url: `https://api.foursquare.com/v3/places/${firstFsqId}?fields=...`, status: detailsStatus, body: detailsBody }
      : { note: 'No results from search — details call skipped' },
  });
}
