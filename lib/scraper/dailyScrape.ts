import { createServerClient } from '@/lib/supabase/server';
import { getTodayIST } from '@/lib/utils/dateUtils';
import { formatPhone } from '@/lib/utils/formatPhone';
import { generateCombinations, TOTAL_COMBINATIONS } from './constants';
import { searchFoursquarePlaces } from './foursquare';
import { scrapeOverpass } from './overpass';
import type { ScrapeResult } from '@/types';

const MAX_LEADS_PER_RUN = 50;
const SEARCH_DELAY_MS = 500;
const OVERPASS_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Core daily scrape algorithm.
 *
 * 1. Check if already ran today successfully
 * 2. Check Foursquare API usage limits (daily limit is 900)
 * 3. Iterate specialty+area combos starting from pointer (Foursquare API)
 * 4. For each combo, search and collect leads without websites
 * 5. Run backup Overpass API (OpenStreetMap) to fill in extra Hyderabad leads
 * 6. Save new leads to database
 */
export async function runDailyScrape(): Promise<ScrapeResult> {
  const supabase = createServerClient();
  const todayIST = getTodayIST();

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

  // 2. Check/create api_usage record for today (default limit = 900)
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

    const dailyLimit = config?.daily_limit || 900;

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

  // 3. If Foursquare limit already reached, return early for Foursquare, but we still might want to run Overpass if desired
  // However, normally we just stop the whole run or skip Foursquare if limit is reached.
  // Let's keep the logic consistent: if limit is reached, we still let it skip Foursquare.
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
      pointer_start: pointerStart,
      pointer_end: pointerStart,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError || !scrapeRun) {
    console.error('Failed to create scrape_run record:', runError);
    return {
      leadsFound: 0,
      apiCallsMade: 0,
      status: 'failed',
      message: `Failed to create scrape run record: ${runError?.message || 'Unknown error'}`,
    };
  }

  // 5. Generate combinations and start scraping Foursquare
  const combinations = generateCombinations();
  let leadsFound = 0;
  let apiCallsMade = apiUsage.calls_made;
  const dailyLimit = apiUsage.daily_limit;
  let currentPointer = pointerStart;
  let errorMessage: string | null = null;

  try {
    if (!foursquareLimitReached) {
      for (let i = 0; i < TOTAL_COMBINATIONS; i++) {
        // Stop conditions
        if (leadsFound >= MAX_LEADS_PER_RUN) {
          break;
        }

        if (apiCallsMade >= dailyLimit) {
          // Mark limit reached
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

        // Call Foursquare API
        const searchResults = await searchFoursquarePlaces(combo.specialty, combo.area);
        apiCallsMade++;

        // Update api_usage after each call
        await supabase
          .from('api_usage')
          .update({
            calls_made: apiCallsMade,
            updated_at: new Date().toISOString(),
          })
          .eq('id', apiUsage.id);

        // Process Foursquare results - check for websites
        for (const place of searchResults) {
          if (leadsFound >= MAX_LEADS_PER_RUN) {
            break;
          }

          // No-Website Check
          const hasWebsite = place.website && place.website.trim() !== '';
          if (!hasWebsite) {
            // Check if place_id already exists in leads
            const { data: existingLead } = await supabase
              .from('leads')
              .select('id')
              .eq('place_id', place.fsq_id)
              .maybeSingle();

            if (!existingLead) {
              const doctorName = place.name || 'Unknown Doctor';
              const phone = formatPhone(place.tel || null);
              const formattedAddress = place.location?.formatted_address || '';
              const mappedArea =
                place.location?.locality ||
                (place.location?.neighborhood && place.location.neighborhood[0]) ||
                combo.area;
              const rating = place.rating !== undefined ? place.rating / 2 : null;
              const ratingCount = place.stats?.total_ratings || null;
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                doctorName + ' ' + formattedAddress
              )}`;

              const { error: insertError } = await supabase
                .from('leads')
                .insert({
                  place_id: place.fsq_id,
                  doctor_name: doctorName,
                  specialty: combo.specialty,
                  area: mappedArea,
                  address: formattedAddress,
                  phone: phone,
                  website: null,
                  google_maps_url: mapsUrl,
                  rating: rating,
                  rating_count: ratingCount,
                  status: 'to_call',
                  scraped_date: todayIST,
                });

              if (insertError) {
                console.error(
                  `Failed to insert Foursquare lead for ${doctorName}:`,
                  insertError
                );
              } else {
                leadsFound++;
              }
            }
          }
        }

        // Increment pointer and wrap around
        currentPointer = (currentPointer + 1) % TOTAL_COMBINATIONS;

        // Update pointer in search_config
        await supabase
          .from('search_config')
          .update({
            pointer_index: currentPointer,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        // Wait between searches (500ms delay)
        await sleep(SEARCH_DELAY_MS);
      }
    }
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : 'Unknown error during Foursquare scrape';
    console.error('Foursquare scrape error:', error);
  }

  // 6. Run backup source — Overpass API (OpenStreetMap)
  // Runs after Foursquare scraper finishes. Add a 2-second delay.
  // Overpass does NOT count toward the Foursquare API limit.
  try {
    console.log('Foursquare scraper finished. Waiting 2 seconds before running Overpass scraper...');
    await sleep(OVERPASS_DELAY_MS);

    console.log('Running Overpass scraper...');
    const osmElements = await scrapeOverpass();
    console.log(`Overpass scraper fetched ${osmElements.length} elements.`);

    let osmLeadsAdded = 0;

    for (const element of osmElements) {
      const placeId = `osm_${element.id}`;

      // Only add entries where place_id doesn't already exist in the DB
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('place_id', placeId)
        .maybeSingle();

      if (!existingLead) {
        // No-website check: Tags website is empty AND contact:website is empty
        const websiteTag = element.tags?.website;
        const contactWebsiteTag = element.tags?.['contact:website'];
        const hasWebsite =
          (websiteTag && websiteTag.trim() !== '') ||
          (contactWebsiteTag && contactWebsiteTag.trim() !== '');

        if (!hasWebsite) {
          const doctorName = element.tags?.name || 'Unknown Doctor';
          const rawPhone = element.tags?.phone || element.tags?.['contact:phone'] || null;
          const phone = formatPhone(rawPhone);

          const street = element.tags?.['addr:street'];
          const suburb = element.tags?.['addr:suburb'];
          const address = [street, suburb].filter(Boolean).join(', ') || 'Hyderabad, India';

          const area = element.tags?.['addr:suburb'] || element.tags?.['addr:city'] || 'Hyderabad';

          // Specialty: healthcare:speciality or amenity
          const rawSpecialty = element.tags?.['healthcare:speciality'] || element.tags?.amenity || 'General Physician';
          // Capitalize first letter of raw specialty for a clean look
          const specialty = rawSpecialty.charAt(0).toUpperCase() + rawSpecialty.slice(1);

          // Get lat/lon for maps URL
          const lat = element.lat !== undefined ? element.lat : element.center?.lat;
          const lon = element.lon !== undefined ? element.lon : element.center?.lon;
          const mapsUrl = (lat !== undefined && lon !== undefined)
            ? `https://www.google.com/maps?q=${lat},${lon}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                doctorName + ' ' + address
              )}`;

          const { error: insertError } = await supabase
            .from('leads')
            .insert({
              place_id: placeId,
              doctor_name: doctorName,
              specialty: specialty,
              area: area,
              address: address,
              phone: phone,
              website: null,
              google_maps_url: mapsUrl,
              rating: null,
              rating_count: null,
              status: 'to_call',
              scraped_date: todayIST,
            });

          if (insertError) {
            console.error(
              `Failed to insert Overpass lead for ${doctorName}:`,
              insertError
            );
          } else {
            leadsFound++;
            osmLeadsAdded++;
          }
        }
      }
    }
    console.log(`Overpass scraper completed. Added ${osmLeadsAdded} new leads.`);
  } catch (error) {
    const osmError =
      error instanceof Error ? error.message : 'Unknown error during Overpass scrape';
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
    : (apiCallsMade >= dailyLimit && !foursquareLimitReached)
      ? 'partial'
      : 'completed';

  await supabase
    .from('scrape_runs')
    .update({
      status: finalStatus,
      leads_found: leadsFound,
      api_calls_made: apiCallsMade - (apiUsage.calls_made || 0), // Only Foursquare calls made in this run
      pointer_end: currentPointer,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', scrapeRun.id);

  const message = errorMessage
    ? `Scrape failed or partially errored: ${errorMessage}. Found ${leadsFound} leads.`
    : (apiCallsMade >= dailyLimit && !foursquareLimitReached)
      ? `Scrape stopped: Foursquare API limit reached. Found ${leadsFound} leads.`
      : `Scrape completed successfully. Found ${leadsFound} leads from Foursquare & OpenStreetMap.`;

  return {
    leadsFound,
    apiCallsMade: apiCallsMade - (apiUsage.calls_made || 0),
    status: finalStatus,
    message,
  };
}
