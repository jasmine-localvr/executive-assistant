import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status') || 'active';
  const category = searchParams.get('category');
  const priority = searchParams.get('priority');

  let query = supabase
    .from('agent_reminders')
    .select('*')
    .eq('team_member_id', session.user.teamMemberId)
    .order('priority', { ascending: true }) // high first (alphabetical: h < l < m, so we fix in client)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('status', status);
  }
  if (category) {
    query = query.eq('category', category);
  }
  if (priority) {
    query = query.eq('priority', priority);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sort by priority properly: high > medium > low
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sorted = (data ?? []).sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 1;
    const pb = priorityOrder[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    // Then by due date (nulls last)
    if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
    if (a.due_at) return -1;
    if (b.due_at) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return NextResponse.json(sorted);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { title, description, notes, category, priority, due_at } = body as {
    title: string;
    description?: string;
    notes?: string;
    category?: string;
    priority?: string;
    due_at?: string;
  };

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('agent_reminders')
    .insert({
      team_member_id: session.user.teamMemberId,
      title: title.trim(),
      description: description?.trim() || null,
      notes: notes?.trim() || null,
      category: category || 'general',
      priority: priority || 'medium',
      due_at: due_at || null,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
