import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getTodayIST } from '@/lib/utils/dateUtils';
import type { ScrapeStatus } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createServerClient();
    const todayIST = getTodayIST();

    // Run queries in parallel
    const [scrapeRunResult, apiUsageResult, lastRunsResult] = await Promise.all([
      // Today's scrape run
      supabase
        .from('scrape_runs')
        .select('*')
        .eq('run_date', todayIST)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Today's API usage
      supabase
        .from('api_usage')
        .select('*')
        .eq('usage_date', todayIST)
        .maybeSingle(),

      // Last 7 scrape runs
      supabase
        .from('scrape_runs')
        .select('*')
        .order('run_date', { ascending: false })
        .limit(7),
    ]);

    // Check for errors
    if (scrapeRunResult.error) {
      console.error('Error fetching scrape run:', scrapeRunResult.error);
    }
    if (apiUsageResult.error) {
      console.error('Error fetching api usage:', apiUsageResult.error);
    }
    if (lastRunsResult.error) {
      console.error('Error fetching last runs:', lastRunsResult.error);
    }

    const response: ScrapeStatus = {
      scrapeRun: scrapeRunResult.data || null,
      apiUsage: apiUsageResult.data || null,
      lastRuns: lastRunsResult.data || [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Scrape status API error:', error);
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch scrape status: ${message}` },
      { status: 500 }
    );
  }
}
