import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getTodayIST } from '@/lib/utils/dateUtils';
import type { DashboardStats } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createServerClient();
    const todayIST = getTodayIST();

    // Run all count queries in parallel
    const [
      totalResult,
      toCallResult,
      calledResult,
      rejectedResult,
      followUpResult,
      todayCountResult,
      followUpTodayResult,
      apiUsageResult,
    ] = await Promise.all([
      // Total leads
      supabase.from('leads').select('*', { count: 'exact', head: true }),

      // To call count
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'to_call'),

      // Called count
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'called'),

      // Rejected count
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'rejected'),

      // Follow up count
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'follow_up'),

      // Today's leads count
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('scraped_date', todayIST),

      // Follow ups due today
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'follow_up')
        .gte('follow_up_datetime', `${todayIST}T00:00:00`)
        .lt('follow_up_datetime', `${todayIST}T23:59:59.999`),

      // API usage today
      supabase
        .from('api_usage')
        .select('calls_made, daily_limit, is_limit_reached')
        .eq('usage_date', todayIST)
        .maybeSingle(),
    ]);

    // Check for errors
    const errors = [
      totalResult.error,
      toCallResult.error,
      calledResult.error,
      rejectedResult.error,
      followUpResult.error,
      todayCountResult.error,
      followUpTodayResult.error,
      apiUsageResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error('Stats query errors:', errors);
      return NextResponse.json(
        { error: `Failed to fetch stats: ${errors[0]?.message}` },
        { status: 500 }
      );
    }

    const stats: DashboardStats = {
      total: totalResult.count || 0,
      toCall: toCallResult.count || 0,
      called: calledResult.count || 0,
      rejected: rejectedResult.count || 0,
      followUp: followUpResult.count || 0,
      todayCount: todayCountResult.count || 0,
      followUpToday: followUpTodayResult.count || 0,
      apiUsageToday: apiUsageResult.data
        ? {
            calls_made: apiUsageResult.data.calls_made,
            daily_limit: apiUsageResult.data.daily_limit,
            is_limit_reached: apiUsageResult.data.is_limit_reached,
          }
        : {
            calls_made: 0,
            daily_limit: 100,
            is_limit_reached: false,
          },
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Stats API error:', error);
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch stats: ${message}` },
      { status: 500 }
    );
  }
}
