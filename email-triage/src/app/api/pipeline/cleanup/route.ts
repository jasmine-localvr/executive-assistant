import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runTriagePipeline } from '@/lib/pipeline';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const emailCount = Math.min(body.emailCount ?? 50, 100);

    const result = await runTriagePipeline(session.user.teamMemberId, {
      emailCount,
      dryRun: false,
      skipDigest: true,
      cleanupMode: true,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('Cleanup run error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cleanup failed' },
      { status: 500 }
    );
  }
}
