import { NextRequest, NextResponse } from 'next/server';
import { processEaInbox } from '@/lib/ea-processor';

export async function POST(request: NextRequest) {
  // Verify webhook authenticity via CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Pub/Sub sends a base64-encoded notification — we acknowledge it
    // and process the inbox regardless of the payload contents
    const result = await processEaInbox();
    return NextResponse.json(result);
  } catch (err) {
    console.error('EA webhook error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'EA processing failed' },
      { status: 500 }
    );
  }
}
