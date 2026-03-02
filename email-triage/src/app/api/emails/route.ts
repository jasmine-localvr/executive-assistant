import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tier = searchParams.get('tier');
  const runId = searchParams.get('runId');
  const archived = searchParams.get('archived');
  const limit = searchParams.get('limit');

  let query = supabase
    .from('classified_emails')
    .select('*')
    .eq('team_member_id', session.user.teamMemberId)
    .order('classified_at', { ascending: false });

  if (tier) query = query.eq('tier', parseInt(tier));
  if (runId) query = query.eq('triage_run_id', runId);
  if (archived !== null) query = query.eq('archived', archived === 'true');

  const { data, error } = await query.limit(limit ? parseInt(limit) : 100);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch emails' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
