import { createServerClient } from '@/lib/supabase/server';
import { getTodayIST } from '@/lib/utils/dateUtils';
import { formatPhone } from '@/lib/utils/formatPhone';
import { generateCombinations, TOTAL_COMBINATIONS } from './constants';
import { searchFoursquarePlaces, getFoursquarePlaceDetails } from './foursquare';
import { scrapeOverpass } from './overpass';
import type { ScrapeResult } from '@/types';

const MAX_LEADS_PER_RUN = 50;
const SEARCH_DELAY_MS = 500;
const DETAIL_DELAY_MS = 200;
const OVERPASS_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns true if the website field is empty / a broken placeholder.
 * Foursquare can return "", "http://", "https://", null, or undefined for places with no website.
 */
function hasNoWebsite(website?: string | null): boolean {
  if (!website) return true;
  if (website.trim() === '') return true;
  if (website === 'http://' || website === 'https://') return true;
  return false;
}

/**
 * Core daily scrape algorithm.
 *
 * 1. Check if already ran today successfully
 * 2. Check Foursquare API usage limits (daily limit is 100 — counts BOTH search + detail calls)
 * 3. Iterate specialty+area combos starting from pointer
 * 4. For each combo: search → for each result → call Place Details → check website → insert if no website
 * 5. Run backup Overpass API (OpenStreetMap)
 * 6. Save all results to database
 */
export async function runDailyScrape(): Promise<ScrapeResult> {
  const supabase = createServerClient();
  const todayIST = getTodayIST();

  console.log('=== runDailyScrape START ===');
  console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING');
  console.log('Supabase Service Role Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING');
  console.log('Foursquare API Key:', process.env.FOURSQUARE_API_KEY ? 'SET' : 'MISSING');

  // 1. Check if scrape already ran today successfully
  const { data: existingRun } = await supabase
    .from('scrape_runs')
    .select('*')
    .eq('run_date', todayIST)
    .eq('status', 'completed')
    .maybeSingle();

  if (existingRun) {
    return {
      leadsFound: existingRun.leads_found,
      apiCallsMade: existingRun.api_calls_made,
      status: 'already_completed',
      message: `Scrape already completed today. Found ${existingRun.leads_found} leads.`,
    };
  }

  // 2. Check/create api_usage record for today (default limit = 100)
  let { data: apiUsage } = await supabase
    .from('api_usage')
    .select('*')
    .eq('usage_date', todayIST)
    .maybeSingle();

  if (!apiUsage) {
    // Get daily_limit from search_config
    const { data: config } = await supabase
      .from('search_config')
      .select('daily_limit')
      .limit(1)
      .single();

    const dailyLimit = config?.daily_limit || 100;

    const { data: newUsage, error: usageError } = await supabase
      .from('api_usage')
      .insert({
        usage_date: todayIST,
        calls_made: 0,
        daily_limit: dailyLimit,
        is_limit_reached: false,
      })
      .select()
      .single();

    if (usageError || !newUsage) {
      console.error('Failed to create api_usage record:', usageError);
      return {
        leadsFound: 0,
        apiCallsMade: 0,
        status: 'failed',
        message: `Failed to create API usage record: ${usageError?.message || 'Unknown error'}`,
      };
    }

    apiUsage = newUsage;
  }

  const foursquareLimitReached = apiUsage.is_limit_reached;

  // 4. Create scrape_runs record with status='running'
  const { data: config } = await supabase
    .from('search_config')
    .select('*')
    .limit(1)
    .single();

  if (!config) {
    return {
      leadsFound: 0,
      apiCallsMade: 0,
      status: 'failed',
      message: 'Search config not found. Run the schema.sql to initialize.',
    };
  }

  const pointerStart = config.pointer_index;

  const { data: scrapeRun, error: runError } = await supabase
    .from('scrape_runs')
    .insert({
      run_date: todayIST,
      status: 'running',
      leads_found: 0,
      api_calls_made: 0,
      new_leads_skipped: 0,
      fsq_results_fetched: 0,
      fsq_checked_website: 0,
      fsq_no_website_found: 0,
      pointer_start: pointerStart,
      pointer_end: pointerStart,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError || !scrapeRun) {
    console.error('Failed to create scrape_run record:', JSON.stringify(runError));
    return {
      leadsFound: 0,
      apiCallsMade: 0,
      status: 'failed',
      message: `Failed to create scrape run record: ${runError?.message || 'Unknown error'}`,
    };
  }

  // 5. Generate combinations and start scraping
  const combinations = generateCombinations();
  let leadsFound = 0;
  let newLeadsSkipped = 0;
  let fsqResultsFetched = 0;
  let fsqCheckedWebsite = 0;
  let fsqNoWebsiteFound = 0;
  // apiCallsMade counts BOTH search calls and place detail calls
  let apiCallsMade = apiUsage.calls_made;
  const dailyLimit = apiUsage.daily_limit;
  let currentPointer = pointerStart;
  let errorMessage: string | null = null;
  let firstSearchDone = false;

  try {
    if (!foursquareLimitReached) {
      for (let i = 0; i < TOTAL_COMBINATIONS; i++) {
        // Stop conditions
        if (leadsFound >= MAX_LEADS_PER_RUN) {
          console.log(`Reached max leads per run (${MAX_LEADS_PER_RUN}), stopping.`);
          break;
        }

        if (apiCallsMade >= dailyLimit) {
          console.log(`Daily API limit reached (${apiCallsMade}/${dailyLimit}), stopping.`);
          await supabase
            .from('api_usage')
            .update({
              is_limit_reached: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', apiUsage.id);
          break;
        }

        const comboIndex = currentPointer % TOTAL_COMBINATIONS;
        const combo = combinations[comboIndex];

        // Skip combinations that already have >= 5 leads in the DB
        const { count: comboLeadsCount, error: countError } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('specialty', combo.specialty)
          .eq('area', combo.area);

        if (countError) {
          console.error(`Error counting leads for combo "${combo.specialty} in ${combo.area}":`, countError);
        }

        if (comboLeadsCount !== null && comboLeadsCount >= 5) {
          console.log(`Skipping "${combo.specialty} in ${combo.area}" — already has ${comboLeadsCount} leads.`);
          currentPointer = (currentPointer + 1) % TOTAL_COMBINATIONS;
          await supabase
            .from('search_config')
            .update({ pointer_index: currentPointer, updated_at: new Date().toISOString() })
            .eq('id', config.id);
          continue;
        }

        // ── STEP 1: Search call ──────────────────────────────────────────
        const searchResults = await searchFoursquarePlaces(combo.specialty, combo.area);
        apiCallsMade++;
        fsqResultsFetched += searchResults.length;

        console.log(`Search '${combo.specialty} doctor in ${combo.area}': got ${searchResults.length} results (total API calls so far: ${apiCallsMade})`);

        // Only log raw details once per run to avoid log spam
        if (!firstSearchDone) {
          firstSearchDone = true;
          console.log('=== FIRST SEARCH RAW RESULTS ===');
          console.log(JSON.stringify(searchResults.slice(0, 2), null, 2));
          console.log('=================================');
        }

        // Persist the search call count immediately
        await supabase
          .from('api_usage')
          .update({ calls_made: apiCallsMade, updated_at: new Date().toISOString() })
          .eq('id', apiUsage.id);

        // ── STEP 2: For each result, call Place Details to get website ──
        for (const place of searchResults) {
          if (leadsFound >= MAX_LEADS_PER_RUN) break;
          if (apiCallsMade >= dailyLimit) {
            console.log(`API limit reached mid-loop (${apiCallsMade}/${dailyLimit}), stopping detail calls.`);
            break;
          }

          // Check if place_id already exists — skip if so
          const { data: existingLead } = await supabase
            .from('leads')
            .select('id')
            .eq('place_id', place.fsq_id)
            .maybeSingle();

          if (existingLead) {
            newLeadsSkipped++;
            console.log(`Skipping ${place.name} (${place.fsq_id}) — already in DB.`);
            continue;
          }

          // ── STEP 2a: Fetch Place Details to get website field ─────────
          await sleep(DETAIL_DELAY_MS);
          const details = await getFoursquarePlaceDetails(place.fsq_id);
          apiCallsMade++;

          // Persist detail call count immediately
          await supabase
            .from('api_usage')
            .update({ calls_made: apiCallsMade, updated_at: new Date().toISOString() })
            .eq('id', apiUsage.id);

          if (!details) {
            console.log(`Could not fetch details for ${place.fsq_id}, skipping.`);
            continue;
          }

          fsqCheckedWebsite++;
          const websiteFromDetails = details.website;
          console.log(`Details for ${details.name} (${place.fsq_id}): website="${websiteFromDetails}"`);

          // ── STEP 2b: Website check ────────────────────────────────────
          const noWebsite = hasNoWebsite(websiteFromDetails);
          if (!noWebsite) {
            console.log(`Skipping ${details.name} — has a website: ${websiteFromDetails}`);
            continue;
          }

          fsqNoWebsiteFound++;

          // ── STEP 2c: Build lead and insert ────────────────────────────
          const doctorName = details.name || place.name || 'Unknown Doctor';
          const phone = formatPhone(details.tel || place.tel || null);
          const formattedAddress = details.location?.formatted_address || place.location?.formatted_address || '';
          const mappedArea =
            details.location?.locality ||
            place.location?.locality ||
            (details.location?.neighborhood && details.location.neighborhood[0]) ||
            (place.location?.neighborhood && place.location.neighborhood[0]) ||
            combo.area;
          const rawRating = details.rating ?? place.rating;
          const rating = rawRating !== undefined ? rawRating / 2 : null;
          const ratingCount = details.stats?.total_ratings ?? place.stats?.total_ratings ?? null;
          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            doctorName + ' ' + formattedAddress
          )}`;

          const insertPayload = {
            place_id: place.fsq_id,
            doctor_name: doctorName,
            specialty: combo.specialty,
            area: mappedArea,
            address: formattedAddress,
            phone: phone,
            website: null,
            google_maps_url: mapsUrl,
            rating: rating,
            total_reviews: ratingCount,
            status: 'to_call',
            scraped_date: todayIST,
          };

          console.log(`Inserting lead: ${doctorName} | website: "${websiteFromDetails}" | has_website: ${!noWebsite}`);

          const insertResult = await supabase.from('leads').insert(insertPayload);
          const insertError = insertResult.error;

          console.log('Insert error:', JSON.stringify(insertError));

          if (insertError) {
            console.error(`Failed to insert Foursquare lead for ${doctorName}:`, JSON.stringify(insertError));
          } else {
            leadsFound++;
            console.log(`✓ Lead saved: ${doctorName} (total saved: ${leadsFound})`);
          }
        }

        // Advance the pointer for this combination
        currentPointer = (currentPointer + 1) % TOTAL_COMBINATIONS;
        await supabase
          .from('search_config')
          .update({ pointer_index: currentPointer, updated_at: new Date().toISOString() })
          .eq('id', config.id);

        await sleep(SEARCH_DELAY_MS);
      }
    }
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : 'Unknown error during Foursquare scrape';
    console.error('Foursquare scrape error:', error);
  }

  // 6. Run backup source — Overpass API (OpenStreetMap)
  // Overpass does NOT count toward the Foursquare API limit.
  try {
    console.log('Foursquare scraper finished. Waiting 2 seconds before Overpass...');
    await sleep(OVERPASS_DELAY_MS);

    console.log('Running Overpass scraper...');
    const osmElements = await scrapeOverpass();
    console.log(`Overpass fetched ${osmElements.length} elements.`);

    let osmLeadsAdded = 0;

    for (const element of osmElements) {
      const placeId = `osm_${element.id}`;

      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('place_id', placeId)
        .maybeSingle();

      if (existingLead) {
        newLeadsSkipped++;
        continue;
      }

      const websiteTag = element.tags?.website;
      const contactWebsiteTag = element.tags?.['contact:website'];
      const noWebsite = hasNoWebsite(websiteTag) && hasNoWebsite(contactWebsiteTag);

      if (noWebsite) {
        const doctorName = element.tags?.name || 'Unknown Doctor';
        const rawPhone = element.tags?.phone || element.tags?.['contact:phone'] || null;
        const phone = formatPhone(rawPhone);

        const street = element.tags?.['addr:street'];
        const suburb = element.tags?.['addr:suburb'];
        const address = [street, suburb].filter(Boolean).join(', ') || 'Hyderabad, India';
        const area = element.tags?.['addr:suburb'] || element.tags?.['addr:city'] || 'Hyderabad';

        const rawSpecialty = element.tags?.['healthcare:speciality'] || element.tags?.amenity || 'General Physician';
        const specialty = rawSpecialty.charAt(0).toUpperCase() + rawSpecialty.slice(1);

        const lat = element.lat !== undefined ? element.lat : element.center?.lat;
        const lon = element.lon !== undefined ? element.lon : element.center?.lon;
        const mapsUrl =
          lat !== undefined && lon !== undefined
            ? `https://www.google.com/maps?q=${lat},${lon}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(doctorName + ' ' + address)}`;

        console.log(`Inserting Overpass lead: ${doctorName}`);

        const insertResult = await supabase.from('leads').insert({
          place_id: placeId,
          doctor_name: doctorName,
          specialty: specialty,
          area: area,
          address: address,
          phone: phone,
          website: null,
          google_maps_url: mapsUrl,
          rating: null,
          total_reviews: null,
          status: 'to_call',
          scraped_date: todayIST,
        });

        console.log('Overpass insert error:', JSON.stringify(insertResult.error));

        if (insertResult.error) {
          console.error(`Failed to insert Overpass lead for ${doctorName}:`, JSON.stringify(insertResult.error));
        } else {
          leadsFound++;
          osmLeadsAdded++;
          console.log(`✓ Overpass lead saved: ${doctorName} (total saved: ${leadsFound})`);
        }
      }
    }
    console.log(`Overpass completed. Added ${osmLeadsAdded} new leads.`);
  } catch (error) {
    const osmError = error instanceof Error ? error.message : 'Unknown error during Overpass scrape';
    console.error('Overpass scrape error:', osmError);
    if (!errorMessage) {
      errorMessage = `Overpass error: ${osmError}`;
    } else {
      errorMessage += ` | Overpass error: ${osmError}`;
    }
  }

  // 7. Update scrape_runs with final status
  const finalStatus = errorMessage
    ? 'failed'
    : apiCallsMade >= dailyLimit && !foursquareLimitReached
    ? 'partial'
    : 'completed';

  await supabase
    .from('scrape_runs')
    .update({
      status: finalStatus,
      leads_found: leadsFound,
      api_calls_made: apiCallsMade - (apiUsage.calls_made || 0),
      new_leads_skipped: newLeadsSkipped,
      fsq_results_fetched: fsqResultsFetched,
      fsq_checked_website: fsqCheckedWebsite,
      fsq_no_website_found: fsqNoWebsiteFound,
      pointer_end: currentPointer,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', scrapeRun.id);

  const message = errorMessage
    ? `Scrape failed or partially errored: ${errorMessage}. Found ${leadsFound} leads.`
    : apiCallsMade >= dailyLimit && !foursquareLimitReached
    ? `Scrape stopped: API limit (${dailyLimit}) reached. Found ${leadsFound} leads.`
    : `Scrape completed. Found ${leadsFound} leads (Foursquare: ${fsqNoWebsiteFound} without website, Overpass included).`;

  console.log(`=== runDailyScrape END | status: ${finalStatus} | leads: ${leadsFound} | API calls: ${apiCallsMade} ===`);

  return {
    leadsFound,
    apiCallsMade: apiCallsMade - (apiUsage.calls_made || 0),
    status: finalStatus,
    message,
  };
}
