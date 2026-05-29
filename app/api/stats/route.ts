import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getTodayIST } from '@/lib/utils/dateUtils';
import type { DashboardStats } from '@/types';

export const dynamic = 'force-dynamic';

const FALLBACK_STATS: DashboardStats = {
  total: 0,
  toCall: 0,
  called: 0,
  rejected: 0,
  followUp: 0,
  todayCount: 0,
  followUpToday: 0,
  apiUsageToday: { calls_made: 0, daily_limit: 100, is_limit_reached: false },
};

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createServerClient();
    const todayIST = getTodayIST();

    // Run all count queries in parallel — each is independently safe
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
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'to_call'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'called'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'follow_up'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).eq('scraped_date', todayIST),
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'follow_up')
        .gte('follow_up_datetime', `${todayIST}T00:00:00`)
        .lt('follow_up_datetime', `${todayIST}T23:59:59.999`),
      supabase
        .from('api_usage')
        .select('calls_made, daily_limit, is_limit_reached')
        .eq('usage_date', todayIST)
        .maybeSingle(),
    ]);

    // Log individual query errors — never throw, always return safe data
    if (totalResult.error)         console.error('Stats error [total]:', JSON.stringify(totalResult.error));
    if (toCallResult.error)        console.error('Stats error [toCall]:', JSON.stringify(toCallResult.error));
    if (calledResult.error)        console.error('Stats error [called]:', JSON.stringify(calledResult.error));
    if (rejectedResult.error)      console.error('Stats error [rejected]:', JSON.stringify(rejectedResult.error));
    if (followUpResult.error)      console.error('Stats error [followUp]:', JSON.stringify(followUpResult.error));
    if (todayCountResult.error)    console.error('Stats error [todayCount]:', JSON.stringify(todayCountResult.error));
    if (followUpTodayResult.error) console.error('Stats error [followUpToday]:', JSON.stringify(followUpTodayResult.error));
    if (apiUsageResult.error)      console.error('Stats error [apiUsage]:', JSON.stringify(apiUsageResult.error));

    const stats: DashboardStats = {
      total:         totalResult.count        ?? 0,
      toCall:        toCallResult.count       ?? 0,
      called:        calledResult.count       ?? 0,
      rejected:      rejectedResult.count     ?? 0,
      followUp:      followUpResult.count     ?? 0,
      todayCount:    todayCountResult.count   ?? 0,
      followUpToday: followUpTodayResult.count ?? 0,
      apiUsageToday: apiUsageResult.data
        ? {
            calls_made:       apiUsageResult.data.calls_made,
            daily_limit:      apiUsageResult.data.daily_limit,
            is_limit_reached: apiUsageResult.data.is_limit_reached,
          }
        : { calls_made: 0, daily_limit: 100, is_limit_reached: false },
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Stats API fatal error:', JSON.stringify(error));
    // Always return a renderable object — never crash the dashboard
    return NextResponse.json(FALLBACK_STATS);
  }
}
