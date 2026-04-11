import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import type { Todo } from '@/types';

const client = new Anthropic();

export async function POST() {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch all active todos
  const { data: todos, error } = await supabase
    .from('agent_reminders')
    .select('*')
    .eq('team_member_id', session.user.teamMemberId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!todos || todos.length === 0) {
    return NextResponse.json({ message: 'No active todos to prioritize', todos: [] });
  }

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

  const todoList = (todos as Todo[]).map((t, i) => ({
    index: i,
    id: t.id,
    title: t.title,
    description: t.description,
    notes: t.notes,
    category: t.category,
    current_priority: t.priority,
    due_at: t.due_at,
  }));

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `You are an executive assistant helping prioritize a to-do list. Current time: ${now} (Mountain Time).

Here are the active todos:
${JSON.stringify(todoList, null, 2)}

For each todo, determine the appropriate priority (high, medium, or low) based on:
- Due date urgency (overdue = high, due today/tomorrow = high, due this week = medium)
- Category importance (work follow-ups tend to be higher)
- Whether the title/description suggests time-sensitivity
- Overall balance (not everything can be high priority)

Respond with a JSON array of objects with these fields:
- id: the todo ID
- priority: "high" | "medium" | "low"
- reason: one-sentence explanation of why this priority

Respond ONLY with the JSON array, no other text.`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  let priorities: { id: string; priority: string; reason: string }[];
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    priorities = JSON.parse(jsonMatch?.[0] ?? '[]');
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
  }

  // Apply priority updates
  const updates = [];
  for (const item of priorities) {
    if (!['high', 'medium', 'low'].includes(item.priority)) continue;

    const { data: updated } = await supabase
      .from('agent_reminders')
      .update({
        priority: item.priority,
        ai_priority_reason: item.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('team_member_id', session.user.teamMemberId)
      .select()
      .single();

    if (updated) updates.push(updated);
  }

  return NextResponse.json({ message: `Prioritized ${updates.length} todos`, todos: updates });
}
