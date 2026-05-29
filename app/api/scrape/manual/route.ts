import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodayIST } from '@/lib/utils/dateUtils';
import { runDailyScrape } from '@/lib/scraper/dailyScrape';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  try {
    // Reset the API counter inline so a manual trigger always works,
    // even if the daily limit was already hit
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const todayIST = getTodayIST();
    await db
      .from('api_usage')
      .update({ calls_made: 0, is_limit_reached: false, updated_at: new Date().toISOString() })
      .eq('usage_date', todayIST);

    console.log('Manual scrape: API counter reset. Starting force scrape...');

    // force=true bypasses the "already completed today" guard
    const result = await runDailyScrape(true);

    return NextResponse.json({
      success: result.status !== 'failed',
      message: result.message || 'Scrape completed!',
      leadsFound: result.leadsFound,
    });
  } catch (error) {
    console.error('Manual scrape route error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, message: `Manual scrape failed: ${message}`, leadsFound: 0 },
      { status: 500 }
    );
  }
}
