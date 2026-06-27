import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

async function handleScrape(request: NextRequest): Promise<NextResponse> {
  try {
    // Validate Authorization header
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid or missing CRON_SECRET.' },
        { status: 401 }
      );
    }

    console.log('Automated daily scraping is disabled. Skipping runDailyScrape.');
    return NextResponse.json({
      success: true,
      status: 'disabled',
      message: 'Automated daily scraping is currently disabled.',
      leadsFound: 0,
      apiCallsMade: 0
    });
  } catch (error) {
    console.error('Daily scrape cron error:', error);
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Daily scrape failed: ${message}`, status: 'failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleScrape(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleScrape(request);
}
