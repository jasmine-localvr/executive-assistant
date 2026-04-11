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
  if (body.recurrence_type !== undefined) updates.recurrence_type = body.recurrence_type;
  if (body.recurrence_interval !== undefined) updates.recurrence_interval = body.recurrence_interval;
  if (body.recurrence_day_of_week !== undefined) updates.recurrence_day_of_week = body.recurrence_day_of_week;
  if (body.recurrence_day_of_month !== undefined) updates.recurrence_day_of_month = body.recurrence_day_of_month;
  if (body.recurrence_month !== undefined) updates.recurrence_month = body.recurrence_month;
  if (body.advance_notice_days !== undefined) updates.advance_notice_days = body.advance_notice_days;
  if (body.next_due_at !== undefined) updates.next_due_at = body.next_due_at;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { data, error } = await supabase
    .from('recurring_todos')
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
    .from('recurring_todos')
    .delete()
    .eq('id', id)
    .eq('team_member_id', session.user.teamMemberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
