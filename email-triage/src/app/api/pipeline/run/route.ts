import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runTriagePipeline } from '@/lib/pipeline';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { emailCount, dryRun } = body;

    const result = await runTriagePipeline(session.user.teamMemberId, {
      emailCount: emailCount ?? 20,
      dryRun: dryRun ?? false,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('Pipeline run error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Pipeline failed' },
      { status: 500 }
    );
  }
}
