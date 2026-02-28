import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { archiveMessage, ensureLabel, addLabel } from '@/lib/gmail';
import type { TeamMember } from '@/types';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Get the classified email — scoped to the authenticated user
  const { data: email, error: emailError } = await supabase
    .from('classified_emails')
    .select('*, team_members(*)')
    .eq('id', id)
    .eq('team_member_id', session.user.teamMemberId)
    .single();

  if (emailError || !email) {
    return NextResponse.json(
      { error: 'Email not found' },
      { status: 404 }
    );
  }

  try {
    const member = email.team_members as unknown as TeamMember;
    const labelId = await ensureLabel(member, 'auto-filtered');
    await addLabel(member, email.gmail_message_id, labelId);
    await archiveMessage(member, email.gmail_message_id);

    await supabase
      .from('classified_emails')
      .update({ archived: true })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Archive error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Archive failed' },
      { status: 500 }
    );
  }
}
