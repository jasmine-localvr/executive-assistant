import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.category !== undefined) updates.category = body.category;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.due_at !== undefined) updates.due_at = body.due_at || null;
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === 'completed') {
      updates.completed_at = new Date().toISOString();
    } else {
      updates.completed_at = null;
    }
  }
  if (body.ai_priority_reason !== undefined) updates.ai_priority_reason = body.ai_priority_reason;
  if (body.snoozed_until !== undefined) updates.snoozed_until = body.snoozed_until || null;

  const { data, error } = await supabase
    .from('agent_reminders')
    .update(updates)
    .eq('id', id)
    .eq('team_member_id', session.user.teamMemberId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await supabase
    .from('agent_reminders')
    .delete()
    .eq('id', id)
    .eq('team_member_id', session.user.teamMemberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
