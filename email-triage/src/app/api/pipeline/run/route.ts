import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runTriagePipeline } from '@/lib/pipeline';

// The pipeline classifies many emails and then runs per-email Gmail + Claude
// draft calls; the default function duration is too short for larger batches.
export const maxDuration = 300;

// Upper bound on a single run. PHASE 3 does sequential per-email Gmail actions
// plus a Claude draft call per reply-worthy email, so a too-large batch blows
// past maxDuration and strands the run in 'running'.
const MAX_EMAIL_COUNT = 30;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { emailCount, dryRun } = body;

    const result = await runTriagePipeline(session.user.teamMemberId, {
      emailCount: Math.min(emailCount ?? 20, MAX_EMAIL_COUNT),
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
