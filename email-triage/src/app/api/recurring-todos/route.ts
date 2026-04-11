import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { computeNextDue } from '@/lib/recurrence';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const activeOnly = searchParams.get('active') !== 'false';

  let query = supabase
    .from('recurring_todos')
    .select('*')
    .eq('team_member_id', session.user.teamMemberId)
    .order('next_due_at', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const {
    title,
    description,
    notes,
    category,
    priority,
    recurrence_type,
    recurrence_interval,
    recurrence_day_of_week,
    recurrence_day_of_month,
    recurrence_month,
    advance_notice_days,
    next_due_at,
  } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!recurrence_type) {
    return NextResponse.json({ error: 'Recurrence type is required' }, { status: 400 });
  }

  // If no explicit next_due_at, compute from today
  const startDate = next_due_at || computeNextDue({
    recurrence_type,
    recurrence_interval: recurrence_interval || 1,
    recurrence_day_of_week: recurrence_day_of_week ?? null,
    recurrence_day_of_month: recurrence_day_of_month ?? null,
    recurrence_month: recurrence_month ?? null,
  }, new Date());

  const { data, error } = await supabase
    .from('recurring_todos')
    .insert({
      team_member_id: session.user.teamMemberId,
      title: title.trim(),
      description: description?.trim() || null,
      notes: notes?.trim() || null,
      category: category || 'personal',
      priority: priority || 'medium',
      recurrence_type,
      recurrence_interval: recurrence_interval || 1,
      recurrence_day_of_week: recurrence_day_of_week ?? null,
      recurrence_day_of_month: recurrence_day_of_month ?? null,
      recurrence_month: recurrence_month ?? null,
      advance_notice_days: advance_notice_days ?? 0,
      next_due_at: startDate,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
