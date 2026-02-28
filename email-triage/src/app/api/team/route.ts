import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('team_members')
    .select('id, name, email, slack_user_id, role, is_active, created_at, gmail_token_expiry, scheduling_link, feature_calendar_scheduling')
    .order('name');

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch team members' },
      { status: 500 }
    );
  }

  // Attach gmail_connected status without exposing tokens
  const members = (data ?? []).map((m) => ({
    ...m,
    gmail_connected: !!m.gmail_token_expiry,
  }));

  return NextResponse.json(members);
}
