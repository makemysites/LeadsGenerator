import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getTodayIST } from '@/lib/utils/dateUtils';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createServerClient();

    const { data: config, error } = await supabase
      .from('search_config')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching search config:', error);
      return NextResponse.json(
        { error: `Failed to fetch settings: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error('Settings GET API error:', error);
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch settings: ${message}` },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { daily_limit } = body;

    if (daily_limit === undefined || daily_limit === null) {
      return NextResponse.json(
        { error: 'daily_limit is required.' },
        { status: 400 }
      );
    }

    if (typeof daily_limit !== 'number' || daily_limit < 1 || daily_limit > 10000) {
      return NextResponse.json(
        { error: 'daily_limit must be a number between 1 and 10000.' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Update search_config
    const { data: config, error: configError } = await supabase
      .from('search_config')
      .update({
        daily_limit,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (configError) {
      // If .single() fails because there's no row, select the first row instead
      console.error('Error updating search config:', configError);
      return NextResponse.json(
        { error: `Failed to update settings: ${configError.message}` },
        { status: 500 }
      );
    }

    // Also update today's api_usage daily_limit if a record exists
    const todayIST = getTodayIST();
    const { error: usageError } = await supabase
      .from('api_usage')
      .update({
        daily_limit,
        updated_at: new Date().toISOString(),
      })
      .eq('usage_date', todayIST);

    if (usageError) {
      console.error(
        'Warning: Failed to update today\'s api_usage daily_limit:',
        usageError
      );
      // Don't fail the request — config was already updated
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error('Settings PATCH API error:', error);
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to update settings: ${message}` },
      { status: 500 }
    );
  }
}
