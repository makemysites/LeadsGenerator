import { NextResponse } from 'next/server';
import { runDailyScrape } from '@/lib/scraper/dailyScrape';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  try {
    const result = await runDailyScrape();
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
