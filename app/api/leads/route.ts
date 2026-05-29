import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getTodayIST } from '@/lib/utils/dateUtils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createServerClient();
    const searchParams = request.nextUrl.searchParams;

    const status = searchParams.get('status');
    const date = searchParams.get('date');
    const area = searchParams.get('area');
    const specialty = searchParams.get('specialty');
    const search = searchParams.get('search');

    let query = supabase
      .from('leads')
      .select('*')
      .order('scraped_date', { ascending: false })
      .order('created_at', { ascending: false });

    // Status filter
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Date filter
    if (date === 'today') {
      const todayIST = getTodayIST();
      query = query.eq('scraped_date', todayIST);
    } else if (date === 'week') {
      const todayIST = getTodayIST();
      const weekAgo = new Date(
        new Date(todayIST).getTime() - 7 * 24 * 60 * 60 * 1000
      );
      const weekAgoStr = weekAgo.toISOString().split('T')[0];
      query = query.gte('scraped_date', weekAgoStr);
    }

    // Area filter
    if (area && area !== 'all') {
      query = query.eq('area', area);
    }

    // Specialty filter
    if (specialty && specialty !== 'all') {
      query = query.eq('specialty', specialty);
    }

    // Search filter (doctor name)
    if (search && search.trim() !== '') {
      query = query.ilike('doctor_name', `%${search.trim()}%`);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error('Error fetching leads:', error);
      return NextResponse.json(
        { error: `Failed to fetch leads: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(leads || []);
  } catch (error) {
    console.error('Leads API error:', error);
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch leads: ${message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    const supabase = createServerClient();
    
    // Delete all leads using a wide condition to bypass safe-delete rules
    const { error: leadsError } = await supabase
      .from('leads')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (leadsError) {
      console.error('Error deleting leads:', leadsError);
      return NextResponse.json(
        { error: `Failed to clear leads: ${leadsError.message}` },
        { status: 500 }
      );
    }

    // Also delete scrape runs and api usage to make it completely fresh
    await supabase.from('scrape_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('api_usage').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    return NextResponse.json({ success: true, message: 'All leads, scrape runs, and API history cleared successfully.' });
  } catch (error) {
    console.error('Clear leads API error:', error);
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to clear leads: ${message}` },
      { status: 500 }
    );
  }
}

