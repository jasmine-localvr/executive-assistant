import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: todo, error } = await supabase
    .from('agent_reminders')
    .select('*')
    .eq('id', id)
    .eq('team_member_id', session.user.teamMemberId)
    .single();

  if (error || !todo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  // Get member name for context
  const { data: member } = await supabase
    .from('team_members')
    .select('name, email')
    .eq('id', session.user.teamMemberId)
    .single();

  const now = new Date().toLocaleString('en-US', {
    timeZone: 'America/Denver',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `You are an executive assistant for ${member?.name ?? 'the user'}. Current time: ${now} (Mountain Time).

Help with this todo item:
- Title: ${todo.title}
- Description: ${todo.description || '(none)'}
- Notes: ${todo.notes || '(none)'}
- Category: ${todo.category}
- Priority: ${todo.priority}
- Due: ${todo.due_at ? new Date(todo.due_at).toLocaleString('en-US', { timeZone: 'America/Denver', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No deadline'}

Provide practical help to get this done. Include:
1. A brief breakdown of steps to complete this task
2. Any templates, draft text, or scripts that would save time (e.g. if it's "email John about Q2", draft the email)
3. A suggested time estimate
4. If it's overdue or due soon, a recommended approach to handle urgency

Keep it concise and actionable. Format with markdown.`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  return NextResponse.json({ todoId: id, assistance: text });
}
