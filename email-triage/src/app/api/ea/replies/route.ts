import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  console.log('[EA replies] GET request received');

  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  try {
    const { data, error, count } = await supabase
      .from('ea_replies')
      .select(
        '*, team_members(name, email)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[EA replies] Supabase error:', error.message, error.details, error.hint);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Flatten the joined team member name
    const replies = (data ?? []).map((row: Record<string, unknown>) => {
      const member = row.team_members as { name: string; email: string } | null;
      return {
        ...row,
        team_member_name: member?.name ?? 'Unknown',
        team_member_email: member?.email ?? '',
        team_members: undefined,
      };
    });

    return NextResponse.json({ replies, total: count });
  } catch (err) {
    console.error('[EA replies] Unexpected error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch replies' },
      { status: 500 }
    );
  }
}
