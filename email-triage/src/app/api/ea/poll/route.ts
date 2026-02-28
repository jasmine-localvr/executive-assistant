import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { processEaInbox } from '@/lib/ea-processor';

export async function POST(request: NextRequest) {
  console.log('[EA poll] POST request received');
  // Dual auth: session OR CRON_SECRET bearer token
  const session = await auth();
  const authHeader = request.headers.get('authorization');
  const cronAuthed =
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!session?.user?.teamMemberId && !cronAuthed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processEaInbox();
    return NextResponse.json(result);
  } catch (err) {
    console.error('EA poll error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'EA polling failed' },
      { status: 500 }
    );
  }
}
