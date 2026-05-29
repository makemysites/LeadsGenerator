import { createServerClient } from '@/lib/supabase/server';
import { getTodayIST } from '@/lib/utils/dateUtils';
import { formatPhone } from '@/lib/utils/formatPhone';
import { generateCombinations, TOTAL_COMBINATIONS } from './constants';
import { textSearch, getPlaceDetails } from './googlePlaces';
import type { ScrapeResult } from '@/types';

const MAX_LEADS_PER_RUN = 50;
const SEARCH_DELAY_MS = 500;
const DETAIL_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Core daily scrape algorithm.
 *
 * 1. Check if already ran today
 * 2. Check API usage limits
 * 3. Iterate specialty+area combos starting from pointer
 * 4. For each combo, search and collect leads without websites
 * 5. Insert new leads into the database
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

  // 2. Check/create api_usage record for today
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

  // 3. If limit already reached, return early
  if (apiUsage.is_limit_reached) {
    return {
      leadsFound: 0,
      apiCallsMade: apiUsage.calls_made,
      status: 'limit_reached',
      message: `API limit already reached today (${apiUsage.calls_made}/${apiUsage.daily_limit}).`,
    };
  }

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

  // 5. Generate combinations and start scraping
  const combinations = generateCombinations();
  let leadsFound = 0;
  let apiCallsMade = apiUsage.calls_made;
  const dailyLimit = apiUsage.daily_limit;
  let currentPointer = pointerStart;
  let errorMessage: string | null = null;

  try {
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

      // Text search
      const query = `${combo.specialty} in ${combo.area} Hyderabad`;
      const searchResults = await textSearch(query);
      apiCallsMade++;

      // Update api_usage after each call
      await supabase
        .from('api_usage')
        .update({
          calls_made: apiCallsMade,
          updated_at: new Date().toISOString(),
        })
        .eq('id', apiUsage.id);

      // Wait between searches
      await sleep(SEARCH_DELAY_MS);

      // Process results — only interested in places WITHOUT a website
      for (const place of searchResults) {
        if (leadsFound >= MAX_LEADS_PER_RUN) {
          break;
        }

        if (apiCallsMade >= dailyLimit) {
          await supabase
            .from('api_usage')
            .update({
              is_limit_reached: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', apiUsage.id);
          break;
        }

        // Skip places that already have a website from text search
        if (place.websiteUri) {
          continue;
        }

        // Get place details to confirm no website
        const details = await getPlaceDetails(place.id);
        apiCallsMade++;

        // Update api_usage after detail call
        await supabase
          .from('api_usage')
          .update({
            calls_made: apiCallsMade,
            updated_at: new Date().toISOString(),
          })
          .eq('id', apiUsage.id);

        await sleep(DETAIL_DELAY_MS);

        if (!details) {
          continue;
        }

        // If details still show no website, this is a valid lead
        if (!details.websiteUri) {
          // Check if place_id already exists in leads
          const { data: existingLead } = await supabase
            .from('leads')
            .select('id')
            .eq('place_id', place.id)
            .maybeSingle();

          if (!existingLead) {
            const doctorName =
              details.displayName?.text || place.displayName?.text || 'Unknown';
            const phone = formatPhone(
              details.nationalPhoneNumber || place.nationalPhoneNumber || null
            );

            const { error: insertError } = await supabase
              .from('leads')
              .insert({
                place_id: place.id,
                doctor_name: doctorName,
                specialty: combo.specialty,
                area: combo.area,
                address: details.formattedAddress || place.formattedAddress || '',
                phone: phone,
                website: null,
                google_maps_url: details.googleMapsUri || place.googleMapsUri || null,
                rating: details.rating || place.rating || null,
                rating_count: details.userRatingCount || place.userRatingCount || null,
                status: 'to_call',
                scraped_date: todayIST,
              });

            if (insertError) {
              console.error(
                `Failed to insert lead for ${doctorName}:`,
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
    }
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : 'Unknown error during scrape';
    console.error('Scrape error:', error);
  }

  // 6. Update scrape_runs with final status
  const finalStatus = errorMessage
    ? 'failed'
    : apiCallsMade >= dailyLimit
      ? 'partial'
      : 'completed';

  await supabase
    .from('scrape_runs')
    .update({
      status: finalStatus,
      leads_found: leadsFound,
      api_calls_made: apiCallsMade - (apiUsage.calls_made || 0), // Only calls made in this run
      pointer_end: currentPointer,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', scrapeRun.id);

  const message = errorMessage
    ? `Scrape failed: ${errorMessage}. Found ${leadsFound} leads before failure.`
    : apiCallsMade >= dailyLimit
      ? `Scrape stopped: API limit reached. Found ${leadsFound} leads.`
      : `Scrape completed successfully. Found ${leadsFound} leads.`;

  return {
    leadsFound,
    apiCallsMade: apiCallsMade - (apiUsage.calls_made || 0),
    status: finalStatus,
    message,
  };
}
