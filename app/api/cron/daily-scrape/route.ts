import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { runDailyScrape } from '@/lib/scraper/dailyScrape';

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

    const result = await runDailyScrape();

    return NextResponse.json(result, {
      status: result.status === 'failed' ? 500 : 200,
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
