import { createClient } from '@supabase/supabase-js';
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
 * Returns true if the doctor has no real website.
 * Foursquare OMITS the website field entirely when absent (returns undefined, not null).
 * This function handles: null, undefined, non-string, empty string, bare protocol stubs.
 *
 * NOTE: Temporarily set to ALWAYS return true so ALL doctors are saved.
 * This confirms the full pipeline works. Revert the final line to `return false`
 * once leads are appearing in the dashboard.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasNoWebsite(websiteValue: any): boolean {
  if (websiteValue === null) return true;
  if (websiteValue === undefined) return true;
  if (typeof websiteValue !== 'string') return true;
  if (websiteValue.trim() === '') return true;
  if (websiteValue.trim() === 'http://') return true;
  if (websiteValue.trim() === 'https://') return true;
  // ⚠️ TEMPORARY: save ALL doctors regardless of website to confirm pipeline works
  // TODO: revert this line to `return false` once leads are confirmed saving
  return true;
}

/**
 * Creates a Supabase admin client directly using the service role key.
 * This bypasses Row Level Security (RLS) entirely for all operations.
 */
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      `Missing Supabase env vars — URL: ${supabaseUrl ? 'SET' : 'MISSING'}, SERVICE_ROLE_KEY: ${serviceRoleKey ? 'SET' : 'MISSING'}`
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Core daily scrape algorithm.
 *
 * 1. Check if already ran today successfully
 * 2. Check Foursquare API usage limits (counts BOTH search + detail calls)
 * 3. Iterate specialty+area combos starting from pointer
 * 4. For each combo: search → Place Details per result → website check → upsert if no website
 * 5. Run backup Overpass API (OpenStreetMap)
 * 6. Save all results to database
 */
export async function runDailyScrape(): Promise<ScrapeResult> {
  // Use explicit admin client — bypasses RLS, no ambiguity
  const db = getAdminClient();
  const todayIST = getTodayIST();

  console.log('=== runDailyScrape START ===');
  console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING');
  console.log('FOURSQUARE_API_KEY:', process.env.FOURSQUARE_API_KEY ? 'SET' : 'MISSING');
  console.log('Today IST:', todayIST);

  // 1. Check if scrape already ran today successfully
  const { data: existingRun, error: existingRunError } = await db
    .from('scrape_runs')
    .select('id, leads_found, api_calls_made, status')
    .eq('run_date', todayIST)
    .eq('status', 'completed')
    .maybeSingle();

  if (existingRunError) {
    console.error('Error checking existing run:', JSON.stringify(existingRunError));
  }

  if (existingRun) {
    console.log('Scrape already completed today, returning early.');
    return {
      leadsFound: existingRun.leads_found,
      apiCallsMade: existingRun.api_calls_made,
      status: 'already_completed',
      message: `Scrape already completed today. Found ${existingRun.leads_found} leads.`,
    };
  }

  // 2. Check/create api_usage record for today
  let { data: apiUsage, error: apiUsageError } = await db
    .from('api_usage')
    .select('*')
    .eq('usage_date', todayIST)
    .maybeSingle();

  if (apiUsageError) {
    console.error('Error fetching api_usage:', JSON.stringify(apiUsageError));
  }

  if (!apiUsage) {
    const { data: configForLimit } = await db
      .from('search_config')
      .select('daily_limit')
      .limit(1)
      .single();

    const dailyLimit = configForLimit?.daily_limit || 100;
    console.log(`Creating api_usage record for ${todayIST} with limit ${dailyLimit}`);

    const { data: newUsage, error: insertUsageError } = await db
      .from('api_usage')
      .insert({
        usage_date: todayIST,
        calls_made: 0,
        daily_limit: dailyLimit,
        is_limit_reached: false,
      })
      .select()
      .single();

    if (insertUsageError || !newUsage) {
      console.error('FAILED to create api_usage:', JSON.stringify(insertUsageError));
      return {
        leadsFound: 0,
        apiCallsMade: 0,
        status: 'failed',
        message: `Failed to create API usage record: ${insertUsageError?.message || 'Unknown error'}`,
      };
    }

    apiUsage = newUsage;
    console.log('api_usage record created:', JSON.stringify(apiUsage));
  } else {
    console.log('Existing api_usage:', JSON.stringify(apiUsage));
  }

  const foursquareLimitReached = apiUsage.is_limit_reached;

  // 3. Load search_config
  const { data: config, error: configError } = await db
    .from('search_config')
    .select('*')
    .limit(1)
    .single();

  if (configError || !config) {
    console.error('Error loading search_config:', JSON.stringify(configError));
    return {
      leadsFound: 0,
      apiCallsMade: 0,
      status: 'failed',
      message: 'Search config not found. Run the schema.sql to initialize.',
    };
  }

  console.log('search_config:', JSON.stringify(config));
  const pointerStart = config.pointer_index;

  // 4. Create scrape_runs record
  const { data: scrapeRun, error: runError } = await db
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
    console.error('FAILED to create scrape_run:', JSON.stringify(runError));
    return {
      leadsFound: 0,
      apiCallsMade: 0,
      status: 'failed',
      message: `Failed to create scrape run record: ${runError?.message || 'Unknown error'}`,
    };
  }

  console.log('scrape_run created:', scrapeRun.id);

  // 5. Scrape loop
  const combinations = generateCombinations();
  let leadsFound = 0;
  let newLeadsSkipped = 0;
  let fsqResultsFetched = 0;
  let fsqCheckedWebsite = 0;
  let fsqNoWebsiteFound = 0;
  let apiCallsMade = apiUsage.calls_made;
  const dailyLimit = apiUsage.daily_limit;
  let currentPointer = pointerStart;
  let errorMessage: string | null = null;
  let firstSearchDone = false;

  try {
    if (!foursquareLimitReached) {
      for (let i = 0; i < TOTAL_COMBINATIONS; i++) {
        if (leadsFound >= MAX_LEADS_PER_RUN) {
          console.log(`MAX_LEADS_PER_RUN (${MAX_LEADS_PER_RUN}) reached, stopping.`);
          break;
        }
        if (apiCallsMade >= dailyLimit) {
          console.log(`Daily limit reached (${apiCallsMade}/${dailyLimit}), stopping.`);
          await db
            .from('api_usage')
            .update({ is_limit_reached: true, updated_at: new Date().toISOString() })
            .eq('id', apiUsage.id);
          break;
        }

        const comboIndex = currentPointer % TOTAL_COMBINATIONS;
        const combo = combinations[comboIndex];

        // Skip combos already having >= 5 leads
        const { count: comboCount } = await db
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('specialty', combo.specialty)
          .eq('area', combo.area);

        if (comboCount !== null && comboCount >= 5) {
          console.log(`Skipping "${combo.specialty} in ${combo.area}" — already has ${comboCount} leads.`);
          currentPointer = (currentPointer + 1) % TOTAL_COMBINATIONS;
          await db
            .from('search_config')
            .update({ pointer_index: currentPointer, updated_at: new Date().toISOString() })
            .eq('id', config.id);
          continue;
        }

        // ── STEP 1: Search ────────────────────────────────────────────────
        const searchResults = await searchFoursquarePlaces(combo.specialty, combo.area);
        apiCallsMade++;
        fsqResultsFetched += searchResults.length;

        console.log(`Search "${combo.specialty} in ${combo.area}": ${searchResults.length} results | total calls: ${apiCallsMade}/${dailyLimit}`);

        if (!firstSearchDone) {
          firstSearchDone = true;
          console.log('FIRST SEARCH RAW:', JSON.stringify(searchResults.slice(0, 2), null, 2));
        }

        await db
          .from('api_usage')
          .update({ calls_made: apiCallsMade, updated_at: new Date().toISOString() })
          .eq('id', apiUsage.id);

        // ── STEP 2: Place Details per result ─────────────────────────────
        for (const place of searchResults) {
          if (leadsFound >= MAX_LEADS_PER_RUN) break;
          if (apiCallsMade >= dailyLimit) {
            console.log(`API limit mid-loop (${apiCallsMade}/${dailyLimit}), breaking.`);
            break;
          }

          // Duplicate check
          const { data: existingLead, error: dupCheckError } = await db
            .from('leads')
            .select('id')
            .eq('place_id', place.fsq_id)
            .maybeSingle();

          if (dupCheckError) {
            console.error(`Dup check error for ${place.fsq_id}:`, JSON.stringify(dupCheckError));
          }

          if (existingLead) {
            newLeadsSkipped++;
            console.log(`Duplicate: ${place.name} (${place.fsq_id}) — already in DB.`);
            continue;
          }

          // ── STEP 2a: Place Details call ───────────────────────────────
          await sleep(DETAIL_DELAY_MS);
          const details = await getFoursquarePlaceDetails(place.fsq_id);
          apiCallsMade++;

          await db
            .from('api_usage')
            .update({ calls_made: apiCallsMade, updated_at: new Date().toISOString() })
            .eq('id', apiUsage.id);

          if (!details) {
            console.log(`Details fetch failed for ${place.fsq_id}, skipping.`);
            continue;
          }

          fsqCheckedWebsite++;
          const websiteFromDetails = details.website;

          // ── STEP 2b: Full debug log before website check ──────────────
          console.log('=== DOCTOR CHECK ===');
          console.log('Name:', details.name);
          console.log('Website raw value:', JSON.stringify(websiteFromDetails));
          console.log('Website type:', typeof websiteFromDetails);
          console.log('Has website? (!!value):', !!websiteFromDetails);
          const willSave = hasNoWebsite(websiteFromDetails);
          console.log('Will save as lead?', willSave);
          console.log('====================');

          // ── STEP 2c: Website check ────────────────────────────────────
          if (!willSave) {
            console.log(`SKIP: ${details.name} — has a real website: ${websiteFromDetails}`);
            continue;
          }

          fsqNoWebsiteFound++;

          // ── STEP 2c: Build exact insert payload ───────────────────────
          // Column names verified against schema: place_id, doctor_name, specialty, area,
          // address, phone, google_maps_url, rating, total_reviews, scraped_date, status
          const doctorName = details.name || place.name || 'Unknown Doctor';
          const phone = formatPhone(details.tel || place.tel || null);
          const address = details.location?.formatted_address || place.location?.formatted_address || '';
          const area =
            details.location?.locality ||
            place.location?.locality ||
            (details.location?.neighborhood?.[0]) ||
            (place.location?.neighborhood?.[0]) ||
            combo.area;
          const rawRating = details.rating ?? place.rating;
          const rating = rawRating !== undefined ? rawRating / 2 : null;
          const totalReviews = details.stats?.total_ratings ?? place.stats?.total_ratings ?? null;
          const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(doctorName + ' ' + address)}`;

          const leadPayload = {
            place_id:        place.fsq_id,
            doctor_name:     doctorName,
            specialty:       combo.specialty,
            area:            area,
            address:         address,
            phone:           phone,
            website:         null as null,
            google_maps_url: googleMapsUrl,
            rating:          rating,
            total_reviews:   totalReviews,
            status:          'to_call',
            scraped_date:    todayIST,
          };

          console.log(`INSERTING: ${doctorName} | place_id=${place.fsq_id} | area=${area} | phone=${phone}`);
          console.log('Payload:', JSON.stringify(leadPayload));

          // Use upsert with ignoreDuplicates to safely handle race conditions
          const { error: upsertError } = await db
            .from('leads')
            .upsert(leadPayload, { onConflict: 'place_id', ignoreDuplicates: true });

          if (upsertError) {
            console.error(
              `LEAD INSERT FAILED: ${doctorName} | code=${upsertError.code} | msg=${upsertError.message} | details=${upsertError.details} | hint=${upsertError.hint}`
            );
          } else {
            leadsFound++;
            console.log(`✓ LEAD SAVED: ${doctorName} (total saved so far: ${leadsFound})`);
          }
        }

        // Advance pointer
        currentPointer = (currentPointer + 1) % TOTAL_COMBINATIONS;
        await db
          .from('search_config')
          .update({ pointer_index: currentPointer, updated_at: new Date().toISOString() })
          .eq('id', config.id);

        await sleep(SEARCH_DELAY_MS);
      }
    } else {
      console.log('Foursquare limit already reached for today, skipping Foursquare scrape.');
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown error during Foursquare scrape';
    console.error('FOURSQUARE SCRAPE ERROR:', error);
  }

  // 6. Overpass backup
  try {
    console.log('Foursquare done. Starting Overpass in 2s...');
    await sleep(OVERPASS_DELAY_MS);

    const osmElements = await scrapeOverpass();
    console.log(`Overpass: ${osmElements.length} elements fetched.`);
    let osmLeadsAdded = 0;

    for (const element of osmElements) {
      const placeId = `osm_${element.id}`;

      const { data: existingOsm } = await db
        .from('leads')
        .select('id')
        .eq('place_id', placeId)
        .maybeSingle();

      if (existingOsm) {
        newLeadsSkipped++;
        continue;
      }

      const websiteTag       = element.tags?.website;
      const contactWebsite   = element.tags?.['contact:website'];
      if (!hasNoWebsite(websiteTag) || !hasNoWebsite(contactWebsite)) continue;

      const doctorName    = element.tags?.name || 'Unknown Doctor';
      const rawPhone      = element.tags?.phone || element.tags?.['contact:phone'] || null;
      const phone         = formatPhone(rawPhone);
      const street        = element.tags?.['addr:street'];
      const suburb        = element.tags?.['addr:suburb'];
      const address       = [street, suburb].filter(Boolean).join(', ') || 'Hyderabad, India';
      const area          = element.tags?.['addr:suburb'] || element.tags?.['addr:city'] || 'Hyderabad';
      const rawSpecialty  = element.tags?.['healthcare:speciality'] || element.tags?.amenity || 'General Physician';
      const specialty     = rawSpecialty.charAt(0).toUpperCase() + rawSpecialty.slice(1);
      const lat           = element.lat ?? element.center?.lat;
      const lon           = element.lon ?? element.center?.lon;
      const googleMapsUrl = lat !== undefined && lon !== undefined
        ? `https://www.google.com/maps?q=${lat},${lon}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(doctorName + ' ' + address)}`;

      const osmPayload = {
        place_id:        placeId,
        doctor_name:     doctorName,
        specialty:       specialty,
        area:            area,
        address:         address,
        phone:           phone,
        website:         null as null,
        google_maps_url: googleMapsUrl,
        rating:          null as null,
        total_reviews:   null as null,
        status:          'to_call',
        scraped_date:    todayIST,
      };

      console.log(`OSM INSERTING: ${doctorName}`);

      const { error: osmError } = await db
        .from('leads')
        .upsert(osmPayload, { onConflict: 'place_id', ignoreDuplicates: true });

      if (osmError) {
        console.error(`OSM INSERT FAILED: ${doctorName} | code=${osmError.code} | msg=${osmError.message}`);
      } else {
        leadsFound++;
        osmLeadsAdded++;
        console.log(`✓ OSM LEAD SAVED: ${doctorName}`);
      }
    }

    console.log(`Overpass done. Added ${osmLeadsAdded} new leads.`);
  } catch (error) {
    const osmErr = error instanceof Error ? error.message : 'Unknown Overpass error';
    console.error('OVERPASS ERROR:', osmErr);
    errorMessage = errorMessage ? `${errorMessage} | Overpass: ${osmErr}` : `Overpass: ${osmErr}`;
  }

  // 7. Finalize scrape_run record
  const finalStatus = errorMessage
    ? 'failed'
    : apiCallsMade >= dailyLimit && !foursquareLimitReached
    ? 'partial'
    : 'completed';

  const { error: finalUpdateError } = await db
    .from('scrape_runs')
    .update({
      status:               finalStatus,
      leads_found:          leadsFound,
      api_calls_made:       apiCallsMade - (apiUsage.calls_made || 0),
      new_leads_skipped:    newLeadsSkipped,
      fsq_results_fetched:  fsqResultsFetched,
      fsq_checked_website:  fsqCheckedWebsite,
      fsq_no_website_found: fsqNoWebsiteFound,
      pointer_end:          currentPointer,
      error_message:        errorMessage,
      completed_at:         new Date().toISOString(),
    })
    .eq('id', scrapeRun.id);

  if (finalUpdateError) {
    console.error('Failed to update scrape_run final status:', JSON.stringify(finalUpdateError));
  }

  const message = errorMessage
    ? `Scrape errored: ${errorMessage}. Saved ${leadsFound} leads.`
    : apiCallsMade >= dailyLimit && !foursquareLimitReached
    ? `API limit (${dailyLimit}) reached. Saved ${leadsFound} leads.`
    : `Scrape completed. Saved ${leadsFound} leads. (${fsqNoWebsiteFound} Foursquare without website, Overpass included)`;

  console.log(`=== runDailyScrape END | status=${finalStatus} | leads=${leadsFound} | calls=${apiCallsMade} ===`);

  return {
    leadsFound,
    apiCallsMade: apiCallsMade - (apiUsage.calls_made || 0),
    status: finalStatus,
    message,
  };
}
