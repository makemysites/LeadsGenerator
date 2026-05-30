import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getTodayIST } from '@/lib/utils/dateUtils';
import type { ScrapeStatus } from '@/types';

export const dynamic = 'force-dynamic';

const FALLBACK: ScrapeStatus = {
  scrapeRun: null,
  apiUsage: null,
  lastRuns: [],
};

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createServerClient();
    const todayIST = getTodayIST();

    const [scrapeRunResult, apiUsageResult, lastRunsResult] = await Promise.all([
      supabase
        .from('scrape_runs')
        .select('*')
        .eq('run_date', todayIST)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('api_usage')
        .select('*')
        .eq('usage_date', todayIST)
        .maybeSingle(),
      supabase
        .from('scrape_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(7),
    ]);

    if (scrapeRunResult.error)  console.error('Status error [scrapeRun]:', JSON.stringify(scrapeRunResult.error));
    if (apiUsageResult.error)   console.error('Status error [apiUsage]:', JSON.stringify(apiUsageResult.error));
    if (lastRunsResult.error)   console.error('Status error [lastRuns]:', JSON.stringify(lastRunsResult.error));

    const response: ScrapeStatus = {
      scrapeRun: scrapeRunResult.data  || null,
      apiUsage:  apiUsageResult.data   || null,
      lastRuns:  lastRunsResult.data   || [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Scrape status API fatal error:', JSON.stringify(error));
    return NextResponse.json(FALLBACK);
  }
}
