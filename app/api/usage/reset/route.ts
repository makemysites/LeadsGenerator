import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodayIST } from '@/lib/utils/dateUtils';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Missing Supabase environment variables.' },
        { status: 500 }
      );
    }

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const todayIST = getTodayIST();

    // 1. Reset today's api_usage row (usage_date column)
    const { error: resetError } = await db
      .from('api_usage')
      .update({
        calls_made: 0,
        is_limit_reached: false,
        updated_at: new Date().toISOString(),
      })
      .eq('usage_date', todayIST);

    if (resetError) {
      console.error('Usage reset error:', JSON.stringify(resetError));
      return NextResponse.json(
        { error: `Failed to reset API counter: ${resetError.message}` },
        { status: 500 }
      );
    }

    // 2. Delete today's scrape_run record so the scraper can run again fresh
    const { error: runDeleteError } = await db
      .from('scrape_runs')
      .delete()
      .eq('run_date', todayIST);

    if (runDeleteError) {
      console.error('Scrape run delete error:', JSON.stringify(runDeleteError));
      // Non-fatal — continue
    }

    // 3. Clean up test leads inserted via /api/test-insert
    const { error: testDeleteError } = await db
      .from('leads')
      .delete()
      .or("place_id.eq.test_insert_001,doctor_name.ilike.%Test Doctor%");

    if (testDeleteError) {
      console.error('Test lead delete error:', JSON.stringify(testDeleteError));
      // Non-fatal — continue
    }

    console.log(`API usage reset for ${todayIST}. Test leads cleaned up.`);

    return NextResponse.json({
      success: true,
      message: 'API counter reset. You can scrape again.',
    });
  } catch (error) {
    console.error('Usage reset fatal error:', JSON.stringify(error));
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to reset: ${message}` },
      { status: 500 }
    );
  }
}
