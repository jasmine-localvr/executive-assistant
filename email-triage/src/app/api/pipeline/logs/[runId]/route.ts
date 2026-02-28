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

  // Verify the run belongs to the authenticated user
  const { data: run } = await supabase
    .from('triage_runs')
    .select('id')
    .eq('id', runId)
    .eq('team_member_id', session.user.teamMemberId)
    .single();

  if (!run) {
    return NextResponse.json(
      { error: 'Triage run not found' },
      { status: 404 }
    );
  }

  const { data: logs, error } = await supabase
    .from('pipeline_logs')
    .select('*')
    .eq('triage_run_id', runId)
    .order('timestamp', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 }
    );
  }

  return NextResponse.json(logs ?? []);
}
