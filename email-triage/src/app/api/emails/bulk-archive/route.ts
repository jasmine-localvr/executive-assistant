import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { batchModifyMessages, ensureLabel } from '@/lib/gmail';
import type { TeamMember } from '@/types';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { emailIds } = await request.json();

    if (!Array.isArray(emailIds) || emailIds.length === 0) {
      return NextResponse.json({ error: 'emailIds array required' }, { status: 400 });
    }

    if (emailIds.length > 200) {
      return NextResponse.json({ error: 'Maximum 200 emails per batch' }, { status: 400 });
    }

    const { data: emails, error: fetchError } = await supabase
      .from('classified_emails')
      .select('id, gmail_message_id')
      .eq('team_member_id', session.user.teamMemberId)
      .eq('archived', false)
      .in('id', emailIds);

    if (fetchError || !emails || emails.length === 0) {
      return NextResponse.json({ error: 'No matching emails found' }, { status: 404 });
    }

    const { data: member } = await supabase
      .from('team_members')
      .select('*')
      .eq('id', session.user.teamMemberId)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    const gmailMessageIds = emails.map((e: { gmail_message_id: string }) => e.gmail_message_id);
    const labelId = await ensureLabel(member as TeamMember, 'EA-Reviewed');

    await batchModifyMessages(member as TeamMember, gmailMessageIds, {
      addLabelIds: [labelId],
      removeLabelIds: ['INBOX', 'UNREAD'],
    });

    const dbIds = emails.map((e: { id: string }) => e.id);
    await supabase
      .from('classified_emails')
      .update({ archived: true })
      .in('id', dbIds);

    return NextResponse.json({ success: true, archivedCount: emails.length });
  } catch (err) {
    console.error('Bulk archive error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bulk archive failed' },
      { status: 500 }
    );
  }
}
