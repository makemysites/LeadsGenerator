import { createClient } from '@supabase/supabase-js';
import { getTodayIST } from '@/lib/utils/dateUtils';
import { formatPhone } from '@/lib/utils/formatPhone';
import { generateCombinations, TOTAL_COMBINATIONS } from './constants';
import { searchGooglePlaces, extractArea } from './googlePlaces';
import { scrapeOverpass } from './overpass';
import type { ScrapeResult } from '@/types';


const MAX_LEADS_PER_RUN = 50;
const SEARCH_DELAY_MS = 800;  // respect Google's rate limits


function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns true if the doctor has no real website (i.e., should be saved as a lead).
 * Google Places omits websiteUri entirely when no website is registered — field is undefined.
 * Also handles null, empty string, and bare protocol stubs from legacy data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasNoWebsite(websiteValue: any): boolean {
  if (websiteValue === null) return true;
  if (websiteValue === undefined) return true;
  if (typeof websiteValue !== 'string') return true;
  if (websiteValue.trim() === '') return true;
  if (websiteValue.trim() === 'http://') return true;
  if (websiteValue.trim() === 'https://') return true;
  return false; // has a real website — skip this doctor
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
 * @param force - When true (manual trigger), bypasses the "already completed today" check
 *                and deletes today's completed run so it can start fresh.
 */
export async function runDailyScrape(force = false): Promise<ScrapeResult> {
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
    if (force) {
      // Manual trigger — delete the completed record so we can re-run fresh
      console.log(`FORCE mode: deleting completed run ${existingRun.id} to allow re-run.`);
      await db.from('scrape_runs').delete().eq('id', existingRun.id);
    } else {
      console.log('Scrape already completed today, returning early.');
      return {
        leadsFound: existingRun.leads_found,
        apiCallsMade: existingRun.api_calls_made,
        status: 'already_completed',
        message: `Scrape already completed today. Found ${existingRun.leads_found} leads.`,
      };
    }
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
  let placesChecked = 0;
  let placesWithoutWebsite = 0;
  let apiCallsMade = apiUsage.calls_made;
  const dailyLimit = apiUsage.daily_limit;
  let currentPointer = pointerStart;
  let errorMessage: string | null = null;

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

        // ── SEARCH ─────────────────────────────────────────────────
        // Google Places returns name+address+phone+website in ONE call.
        // No separate details call needed — this halves API usage vs Foursquare.
        const searchResults = await searchGooglePlaces(combo.specialty, combo.area);
        apiCallsMade++;
        placesChecked += searchResults.length;

        console.log(`Google "${combo.specialty} in ${combo.area}": ${searchResults.length} results | calls: ${apiCallsMade}/${dailyLimit}`);

        await db
          .from('api_usage')
          .update({ calls_made: apiCallsMade, updated_at: new Date().toISOString() })
          .eq('id', apiUsage.id);

        // ── PROCESS EACH RESULT ──────────────────────────────────────
        for (const place of searchResults) {
          if (leadsFound >= MAX_LEADS_PER_RUN) break;

          const placeId = place.id;
          const doctorName = place.displayName?.text || 'Unknown Doctor';

          // Duplicate check
          const { data: existingLead, error: dupCheckError } = await db
            .from('leads')
            .select('id')
            .eq('place_id', placeId)
            .maybeSingle();

          if (dupCheckError) {
            console.error(`Dup check error for ${placeId}:`, JSON.stringify(dupCheckError));
          }

          if (existingLead) {
            newLeadsSkipped++;
            console.log(`Duplicate: ${doctorName} (${placeId}) — already in DB.`);
            continue;
          }

          // ── WEBSITE CHECK ───────────────────────────────────────
          // Google Places omits websiteUri entirely when no website is registered
          const websiteValue = place.websiteUri;

          console.log('=== DOCTOR CHECK ===');
          console.log('Name:', doctorName);
          console.log('Website raw value:', JSON.stringify(websiteValue));
          console.log('Website type:', typeof websiteValue);
          const willSave = hasNoWebsite(websiteValue);
          console.log('Will save as lead?', willSave);
          console.log('====================');

          if (!willSave) {
            console.log(`SKIP: ${doctorName} — has website: ${websiteValue}`);
            continue;
          }

          placesWithoutWebsite++;

          // ── BUILD PAYLOAD ─────────────────────────────────────────
          const phone = formatPhone(place.nationalPhoneNumber || place.internationalPhoneNumber || null);
          const address = place.formattedAddress || '';
          const area = extractArea(place, combo.area);
          // Google Places rating is already 0-5 (Foursquare was 0-10)
          const rating = place.rating ?? null;
          const totalReviews = place.userRatingCount ?? null;
          const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(doctorName + ' ' + address)}`;

          const leadPayload = {
            place_id:        placeId,
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

          console.log(`INSERTING: ${doctorName} | place_id=${placeId} | area=${area} | phone=${phone}`);

          const { error: upsertError } = await db
            .from('leads')
            .upsert(leadPayload, { onConflict: 'place_id', ignoreDuplicates: true });

          if (upsertError) {
            console.error(
              `LEAD INSERT FAILED: ${doctorName} | code=${upsertError.code} | msg=${upsertError.message} | details=${upsertError.details} | hint=${upsertError.hint}`
            );
          } else {
            leadsFound++;
            console.log(`✓ LEAD SAVED: ${doctorName} (total saved: ${leadsFound})`);
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
      console.log('API limit already reached for today, skipping Google Places scrape.');
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown error during Google Places scrape';
    console.error('GOOGLE PLACES SCRAPE ERROR:', error);
  }

  // 6. Overpass backup
  try {
    console.log('Google Places done. Starting Overpass backup in 2s...');
    await sleep(2000);

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
      status:            finalStatus,
      leads_found:       leadsFound,
      api_calls_made:    apiCallsMade - (apiUsage.calls_made || 0),
      new_leads_skipped: newLeadsSkipped,
      // Map Google Places search metrics to existing columns to avoid breaking the DB schema.
      // fsq_results_fetched and fsq_checked_website map to placesChecked (all Google search results fetched/checked).
      // fsq_no_website_found maps to placesWithoutWebsite (Google search results that had no website).
      fsq_results_fetched: placesChecked,
      fsq_checked_website: placesChecked,
      fsq_no_website_found: placesWithoutWebsite,
      pointer_end:       currentPointer,
      error_message:     errorMessage,
      completed_at:      new Date().toISOString(),
    })
    .eq('id', scrapeRun.id);

  if (finalUpdateError) {
    console.error('Failed to update scrape_run final status:', JSON.stringify(finalUpdateError));
  }

  const message = errorMessage
    ? `Scrape errored: ${errorMessage}. Saved ${leadsFound} leads.`
    : apiCallsMade >= dailyLimit && !foursquareLimitReached
    ? `API limit (${dailyLimit}) reached. Saved ${leadsFound} leads. (${placesChecked} places checked, ${placesWithoutWebsite} without website)`
    : `Scrape completed. Saved ${leadsFound} leads. (${placesChecked} checked, ${placesWithoutWebsite} without website)`;

  console.log(`=== runDailyScrape END | status=${finalStatus} | leads=${leadsFound} | calls=${apiCallsMade} ===`);

  return {
    leadsFound,
    apiCallsMade: apiCallsMade - (apiUsage.calls_made || 0),
    status: finalStatus,
    message,
  };
}
