import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { setupEaWatch } from '@/lib/ea-gmail';

export async function POST(request: NextRequest) {
  // Auth: CRON_SECRET (Vercel cron) or session
  const authHeader = request.headers.get('authorization');
  const cronAuthed =
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!cronAuthed) {
    const session = await auth();
    if (!session?.user?.teamMemberId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!projectId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLOUD_PROJECT_ID is not set' },
      { status: 500 }
    );
  }

  try {
    const topicName = `projects/${projectId}/topics/ea-inbox-notifications`;
    const result = await setupEaWatch(topicName);
    return NextResponse.json({
      success: true,
      historyId: result.historyId,
      expiration: result.expiration,
    });
  } catch (err) {
    console.error('EA watch setup error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Watch setup failed' },
      { status: 500 }
    );
  }
}
