import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { runId } = await params;

  const { data: run, error } = await supabase
    .from('triage_runs')
    .select('*')
    .eq('id', runId)
    .eq('team_member_id', session.user.teamMemberId)
    .single();

  if (error || !run) {
    return NextResponse.json(
      { error: 'Triage run not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(run);
}
