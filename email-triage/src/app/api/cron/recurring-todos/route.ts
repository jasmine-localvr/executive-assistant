import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { advanceDueDate } from '@/lib/recurrence';
import type { RecurringTodo } from '@/types';

/**
 * Cron job: generate todo instances from recurring templates.
 * Runs daily at 6am Mountain Time.
 *
 * For each active recurring_todo where next_due_at minus advance_notice_days <= today:
 *   1. Create an agent_reminders row with due_at = next_due_at
 *   2. Advance next_due_at to the following occurrence
 *   3. Update last_generated_at
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Denver' }); // YYYY-MM-DD

  // Find recurring todos that are ready to generate:
  // next_due_at - advance_notice_days <= today
  // We fetch all active ones and filter in code since Postgres date arithmetic
  // with a per-row column is simpler this way.
  const { data: templates, error } = await supabase
    .from('recurring_todos')
    .select('*')
    .eq('is_active', true)
    .lte('next_due_at', todayStr) // First pass: at minimum, next_due_at must be <= today + max possible advance
    .order('next_due_at', { ascending: true });

  if (error) {
    console.error('Recurring todos cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!templates || templates.length === 0) {
    // Also check templates with advance notice that haven't hit their due date yet
    const { data: advanceTemplates, error: advError } = await supabase
      .from('recurring_todos')
      .select('*')
      .eq('is_active', true)
      .gt('next_due_at', todayStr)
      .gt('advance_notice_days', 0);

    if (advError) {
      console.error('Recurring todos advance check error:', advError);
      return NextResponse.json({ error: advError.message }, { status: 500 });
    }

    const readyAdvance = (advanceTemplates ?? []).filter((t) => {
      const dueDate = new Date(t.next_due_at + 'T12:00:00');
      const generateDate = new Date(dueDate);
      generateDate.setDate(generateDate.getDate() - (t.advance_notice_days || 0));
      return generateDate <= now;
    }) as RecurringTodo[];

    if (readyAdvance.length === 0) {
      return NextResponse.json({ message: 'No recurring todos to generate', generated: [] });
    }

    const results = await generateTodos(readyAdvance, now);
    return NextResponse.json({ generated: results });
  }

  // Combine: templates where due date has passed + advance notice templates
  const readyTemplates = templates as RecurringTodo[];

  // Also grab advance-notice ones
  const { data: advanceTemplates2 } = await supabase
    .from('recurring_todos')
    .select('*')
    .eq('is_active', true)
    .gt('next_due_at', todayStr)
    .gt('advance_notice_days', 0);

  const readyAdvance2 = (advanceTemplates2 ?? []).filter((t) => {
    const dueDate = new Date(t.next_due_at + 'T12:00:00');
    const generateDate = new Date(dueDate);
    generateDate.setDate(generateDate.getDate() - (t.advance_notice_days || 0));
    return generateDate <= now;
  }) as RecurringTodo[];

  const allReady = [...readyTemplates, ...readyAdvance2];
  const results = await generateTodos(allReady, now);

  return NextResponse.json({ generated: results });
}

async function generateTodos(
  templates: RecurringTodo[],
  now: Date
): Promise<{ templateId: string; title: string; dueAt: string }[]> {
  const results: { templateId: string; title: string; dueAt: string }[] = [];

  for (const tmpl of templates) {
    // Check if we already generated a todo for this occurrence
    // (idempotency: avoid duplicates if cron runs multiple times)
    const { data: existing } = await supabase
      .from('agent_reminders')
      .select('id')
      .eq('recurring_todo_id', tmpl.id)
      .eq('due_at', tmpl.next_due_at + 'T09:00:00.000Z')
      .limit(1);

    if (existing && existing.length > 0) {
      // Already generated — just advance the date
      const nextDue = advanceDueDate(tmpl.next_due_at, tmpl);
      await supabase
        .from('recurring_todos')
        .update({
          next_due_at: nextDue,
          last_generated_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', tmpl.id);
      continue;
    }

    // Create the todo instance
    const dueAtTimestamp = tmpl.next_due_at + 'T09:00:00.000Z'; // 9am UTC ≈ morning MT
    const { error: insertError } = await supabase
      .from('agent_reminders')
      .insert({
        team_member_id: tmpl.team_member_id,
        title: tmpl.title,
        description: tmpl.description,
        notes: tmpl.notes,
        category: tmpl.category,
        priority: tmpl.priority,
        due_at: dueAtTimestamp,
        status: 'active',
        recurring_todo_id: tmpl.id,
      });

    if (insertError) {
      console.error(`Failed to generate todo from recurring ${tmpl.id}:`, insertError);
      continue;
    }

    // Advance the next due date
    const nextDue = advanceDueDate(tmpl.next_due_at, tmpl);
    await supabase
      .from('recurring_todos')
      .update({
        next_due_at: nextDue,
        last_generated_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', tmpl.id);

    results.push({
      templateId: tmpl.id,
      title: tmpl.title,
      dueAt: tmpl.next_due_at,
    });
  }

  return results;
}
