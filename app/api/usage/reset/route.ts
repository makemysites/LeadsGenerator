import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTodayIST } from '@/lib/utils/dateUtils';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  try {
    // Explicitly use service role key — this must bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Missing Supabase environment variables.' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const todayIST = getTodayIST();

    // Reset today's api_usage row
    const { error: updateError } = await supabaseAdmin
      .from('api_usage')
      .update({
        calls_made: 0,
        is_limit_reached: false,
        updated_at: new Date().toISOString(),
      })
      .eq('usage_date', todayIST);

    if (updateError) {
      console.error('Usage reset error:', JSON.stringify(updateError));
      return NextResponse.json(
        { error: `Failed to reset API counter: ${updateError.message}` },
        { status: 500 }
      );
    }

    console.log(`API usage counter reset for ${todayIST}`);
    return NextResponse.json({
      success: true,
      message: 'API counter reset. You can scrape again.',
    });
  } catch (error) {
    console.error('Usage reset fatal error:', JSON.stringify(error));
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to reset API counter: ${message}` },
      { status: 500 }
    );
  }
}
