'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Todo, TodoPriority, TodoCategory, RecurringTodo, RecurrenceType } from '@/types';
import { TODO_CATEGORY_OPTIONS, TODO_PRIORITY_OPTIONS, RECURRENCE_TYPE_OPTIONS } from '@/types';
import ReactMarkdown from 'react-markdown';

const TOOL_LABELS: Record<string, string> = {
  gmail_search: 'Searching email',
  gmail_read: 'Reading email',
  gmail_send: 'Sending email',
  gmail_draft: 'Creating draft',
  gmail_archive: 'Archiving emails',
  calendar_today: 'Checking calendar',
  calendar_range: 'Checking week',
  calendar_create: 'Creating event',
  calendar_find_free_time: 'Finding free time',
  calendar_rsvp: 'Updating RSVP',
  slack_send: 'Sending Slack message',
  contact_lookup: 'Looking up contact',
  contact_add: 'Adding contact',
  contact_update: 'Updating contact',
  reminder_create: 'Creating todo',
  reminder_list: 'Listing todos',
  reminder_complete: 'Completing todo',
  todo_prioritize: 'Prioritizing todos',
  get_current_time: 'Checking time',
  note_to_self: 'Saving note',
  browser_navigate: 'Opening webpage',
  browser_click: 'Clicking element',
  browser_type: 'Typing in field',
  browser_select: 'Selecting option',
  browser_scroll: 'Scrolling page',
  browser_close: 'Closing browser',
};

interface AssistMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistThread {
  todoId: string;
  messages: AssistMessage[];
  conversationId: string | null;
  loading: boolean;
  activeToolCalls: string[];
}

const PRIORITY_BADGES: Record<string, { bg: string; text: string; dot: string }> = {
  high: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  low: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function emptyForm() {
  return {
    title: '',
    description: '',
    notes: '',
    category: 'work' as TodoCategory,
    priority: 'medium' as TodoPriority,
    due_at: '',
  };
}

function emptyRecurringForm() {
  return {
    title: '',
    description: '',
    notes: '',
    category: 'personal' as TodoCategory,
    priority: 'medium' as TodoPriority,
    recurrence_type: 'monthly' as RecurrenceType,
    recurrence_interval: 1,
    recurrence_day_of_week: '' as string,
    recurrence_day_of_month: '' as string,
    recurrence_month: '' as string,
    advance_notice_days: 0,
    next_due_at: '',
  };
}

function formatDueLabel(dueAt: string): { text: string; urgent: boolean } {
  const due = new Date(dueAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < -24) {
    const days = Math.floor(Math.abs(diffHours) / 24);
    return { text: `${days}d overdue`, urgent: true };
  }
  if (diffHours < 0) return { text: 'Overdue', urgent: true };
  if (diffHours < 1) return { text: `${Math.max(1, Math.round(diffMs / 60000))}m`, urgent: true };
  if (diffHours < 24) return { text: `${Math.round(diffHours)}h`, urgent: diffHours < 4 };
  if (diffHours < 48) return { text: 'Tomorrow', urgent: false };
  return {
    text: due.toLocaleDateString('en-US', {
      timeZone: 'America/Denver',
      month: 'short',
      day: 'numeric',
    }),
    urgent: false,
  };
}

function formatRecurrenceLabel(r: RecurringTodo): string {
  const interval = r.recurrence_interval;
  switch (r.recurrence_type) {
    case 'daily':
      return interval === 1 ? 'Every day' : `Every ${interval} days`;
    case 'weekly': {
      const dayLabel = r.recurrence_day_of_week != null ? ` on ${DAY_NAMES[r.recurrence_day_of_week]}` : '';
      return interval === 1 ? `Every week${dayLabel}` : `Every ${interval} weeks${dayLabel}`;
    }
    case 'monthly': {
      const domLabel = r.recurrence_day_of_month ? ` on the ${ordinal(r.recurrence_day_of_month)}` : '';
      return interval === 1 ? `Every month${domLabel}` : `Every ${interval} months${domLabel}`;
    }
    case 'yearly': {
      const mLabel = r.recurrence_month != null ? MONTH_NAMES[r.recurrence_month - 1] : '';
      const dLabel = r.recurrence_day_of_month ?? '';
      const dateStr = mLabel && dLabel ? ` on ${mLabel} ${dLabel}` : mLabel ? ` in ${mLabel}` : '';
      return interval === 1 ? `Every year${dateStr}` : `Every ${interval} years${dateStr}`;
    }
    default:
      return 'Custom schedule';
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

type Tab = 'tasks' | 'recurring';
type ViewMode = 'list' | 'calendar';

// ── Calendar helpers ──

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const days: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = [];

  // Previous month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    days.push({ day: d, month: m, year: y, isCurrentMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ day: d, month, year, isCurrentMonth: true });
  }

  // Next month padding (fill to 6 rows = 42 cells, or at least complete the last row)
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    const nextM = month === 11 ? 0 : month + 1;
    const nextY = month === 11 ? year + 1 : year;
    for (let d = 1; d <= remaining; d++) {
      days.push({ day: d, month: nextM, year: nextY, isCurrentMonth: false });
    }
  }

  return days;
}

function todoDateKey(dueAt: string): string {
  const d = new Date(dueAt);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function calendarDateKey(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function TodosPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // ── Tasks state ──
  const [todos, setTodos] = useState<Todo[]>([]);
  const [allTodos, setAllTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'active' | 'completed' | 'all'>('active');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [prioritizing, setPrioritizing] = useState(false);
  const [assistThread, setAssistThread] = useState<AssistThread | null>(null);
  const [assistReply, setAssistReply] = useState('');
  const assistInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Recurring state ──
  const [recurringTodos, setRecurringTodos] = useState<RecurringTodo[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(true);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [recurringForm, setRecurringForm] = useState(emptyRecurringForm());
  const [recurringSaving, setRecurringSaving] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // ── Load tasks ──
  const loadTodos = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('status', filterStatus);
    if (filterCategory) params.set('category', filterCategory);

    const [filteredRes, allRes] = await Promise.all([
      fetch(`/api/todos?${params}`),
      fetch('/api/todos?status=all'),
    ]);
    if (filteredRes.ok) setTodos(await filteredRes.json());
    if (allRes.ok) setAllTodos(await allRes.json());
    setLoading(false);
  }, [filterStatus, filterCategory]);

  // ── Load recurring ──
  const loadRecurring = useCallback(async () => {
    const res = await fetch('/api/recurring-todos');
    if (res.ok) {
      setRecurringTodos(await res.json());
    }
    setRecurringLoading(false);
  }, []);

  useEffect(() => {
    if (session) {
      loadTodos();
      loadRecurring();
    }
  }, [session, loadTodos, loadRecurring]);

  // ── Task handlers ──
  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/todos/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
          }),
        });
        if (res.ok) {
          await loadTodos();
          setEditingId(null);
          setShowForm(false);
          setForm(emptyForm());
        }
      } else {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
          }),
        });
        if (res.ok) {
          await loadTodos();
          setShowForm(false);
          setForm(emptyForm());
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (id: string) => {
    await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    await loadTodos();
  };

  const handleReopen = async (id: string) => {
    await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    await loadTodos();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const handleEdit = (todo: Todo) => {
    setForm({
      title: todo.title,
      description: todo.description ?? '',
      notes: todo.notes ?? '',
      category: todo.category,
      priority: todo.priority,
      due_at: todo.due_at
        ? new Date(todo.due_at).toLocaleString('sv-SE', { timeZone: 'America/Denver' }).slice(0, 16)
        : '',
    });
    setEditingId(todo.id);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const handlePrioritize = async () => {
    setPrioritizing(true);
    try {
      const res = await fetch('/api/todos/prioritize', { method: 'POST' });
      if (res.ok) {
        await loadTodos();
      }
    } finally {
      setPrioritizing(false);
    }
  };

  // ── Shared SSE streaming helper for assist thread ──
  const streamAssistMessage = async (
    message: string,
    todoId: string,
    existingConversationId: string | null,
    currentMessages: AssistMessage[]
  ) => {
    setAssistThread((prev) => ({
      todoId,
      messages: currentMessages,
      conversationId: prev?.conversationId ?? existingConversationId,
      loading: true,
      activeToolCalls: [],
    }));

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversationId: existingConversationId,
          stream: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Request failed');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ') && eventType) {
            const data = JSON.parse(line.slice(6));

            if (eventType === 'tool_call') {
              setAssistThread((prev) =>
                prev ? { ...prev, activeToolCalls: [...prev.activeToolCalls, data.name] } : prev
              );
            } else if (eventType === 'done') {
              const assistantMsg: AssistMessage = {
                role: 'assistant',
                content: data.response,
              };
              setAssistThread((prev) =>
                prev
                  ? {
                      ...prev,
                      messages: [...prev.messages, assistantMsg],
                      conversationId: data.conversationId ?? prev.conversationId,
                      loading: false,
                      activeToolCalls: [],
                    }
                  : prev
              );
            } else if (eventType === 'error') {
              throw new Error(data.error);
            }
          }
        }
      }
    } catch (err) {
      const errorMsg: AssistMessage = {
        role: 'assistant',
        content: `Sorry, something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
      setAssistThread((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, errorMsg], loading: false, activeToolCalls: [] }
          : prev
      );
    }
  };

  const handleAssist = async (todoId: string) => {
    const todo = todos.find((t) => t.id === todoId);
    if (!todo) return;

    const dueLabel = todo.due_at
      ? new Date(todo.due_at).toLocaleString('en-US', {
          timeZone: 'America/Denver',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'No deadline';

    const message = `Help me with this todo:\n- Title: ${todo.title}\n- Description: ${todo.description || '(none)'}\n- Notes: ${todo.notes || '(none)'}\n- Category: ${todo.category}\n- Priority: ${todo.priority}\n- Due: ${dueLabel}\n\nProvide practical help to get this done. Include a brief breakdown of steps, any draft text or templates that would save time (e.g. if it involves sending an email, draft it), and a time estimate. Keep it concise and actionable.`;

    const userMsg: AssistMessage = { role: 'user', content: message };
    setAssistThread({
      todoId,
      messages: [userMsg],
      conversationId: null,
      loading: true,
      activeToolCalls: [],
    });
    setAssistReply('');

    await streamAssistMessage(message, todoId, null, [userMsg]);
    setTimeout(() => assistInputRef.current?.focus(), 100);
  };

  const handleAssistReply = async () => {
    const trimmed = assistReply.trim();
    if (!trimmed || !assistThread || assistThread.loading) return;

    const userMsg: AssistMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...assistThread.messages, userMsg];
    setAssistThread((prev) => (prev ? { ...prev, messages: updatedMessages } : prev));
    setAssistReply('');

    await streamAssistMessage(trimmed, assistThread.todoId, assistThread.conversationId, updatedMessages);
    setTimeout(() => assistInputRef.current?.focus(), 100);
  };

  // ── Recurring handlers ──
  const handleRecurringSave = async () => {
    if (!recurringForm.title.trim()) return;
    setRecurringSaving(true);
    try {
      const payload = {
        title: recurringForm.title,
        description: recurringForm.description || null,
        notes: recurringForm.notes || null,
        category: recurringForm.category,
        priority: recurringForm.priority,
        recurrence_type: recurringForm.recurrence_type,
        recurrence_interval: recurringForm.recurrence_interval,
        recurrence_day_of_week: recurringForm.recurrence_day_of_week ? Number(recurringForm.recurrence_day_of_week) : null,
        recurrence_day_of_month: recurringForm.recurrence_day_of_month ? Number(recurringForm.recurrence_day_of_month) : null,
        recurrence_month: recurringForm.recurrence_month ? Number(recurringForm.recurrence_month) : null,
        advance_notice_days: recurringForm.advance_notice_days,
        next_due_at: recurringForm.next_due_at || undefined,
      };

      if (editingRecurringId) {
        const res = await fetch(`/api/recurring-todos/${editingRecurringId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          await loadRecurring();
          setEditingRecurringId(null);
          setShowRecurringForm(false);
          setRecurringForm(emptyRecurringForm());
        }
      } else {
        const res = await fetch('/api/recurring-todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          await loadRecurring();
          setShowRecurringForm(false);
          setRecurringForm(emptyRecurringForm());
        }
      }
    } finally {
      setRecurringSaving(false);
    }
  };

  const handleRecurringEdit = (r: RecurringTodo) => {
    setRecurringForm({
      title: r.title,
      description: r.description ?? '',
      notes: r.notes ?? '',
      category: r.category,
      priority: r.priority,
      recurrence_type: r.recurrence_type,
      recurrence_interval: r.recurrence_interval,
      recurrence_day_of_week: r.recurrence_day_of_week != null ? String(r.recurrence_day_of_week) : '',
      recurrence_day_of_month: r.recurrence_day_of_month != null ? String(r.recurrence_day_of_month) : '',
      recurrence_month: r.recurrence_month != null ? String(r.recurrence_month) : '',
      advance_notice_days: r.advance_notice_days,
      next_due_at: r.next_due_at,
    });
    setEditingRecurringId(r.id);
    setShowRecurringForm(true);
  };

  const handleRecurringDelete = async (id: string) => {
    await fetch(`/api/recurring-todos/${id}`, { method: 'DELETE' });
    setRecurringTodos((prev) => prev.filter((r) => r.id !== id));
  };

  const handleRecurringToggle = async (id: string, currentlyActive: boolean) => {
    await fetch(`/api/recurring-todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentlyActive }),
    });
    await loadRecurring();
  };

  const handleRecurringCancel = () => {
    setShowRecurringForm(false);
    setEditingRecurringId(null);
    setRecurringForm(emptyRecurringForm());
  };

  // ── Derived data ──
  const activeTodos = todos.filter((t) => t.status === 'active');
  const completedTodos = todos.filter((t) => t.status === 'completed');

  const highCount = activeTodos.filter((t) => t.priority === 'high').length;
  const overdueCount = activeTodos.filter(
    (t) => t.due_at && new Date(t.due_at) < new Date()
  ).length;
  const dueTodayCount = activeTodos.filter((t) => {
    if (!t.due_at) return false;
    const due = new Date(t.due_at);
    const now = new Date();
    return due.toDateString() === now.toDateString() && due >= now;
  }).length;

  if (status === 'loading' || (loading && recurringLoading)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-medium-gray">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[32px] text-charcoal">Todos</h1>
          <p className="mt-1 text-sm text-medium-gray">
            Your personal task list — AI-prioritized with Slack reminders
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'tasks' && activeTodos.length >= 2 && (
            <button
              onClick={handlePrioritize}
              disabled={prioritizing}
              className="rounded-lg border border-brand-border bg-white px-4 py-2.5 text-sm font-medium text-charcoal transition-colors hover:bg-cream disabled:opacity-40"
            >
              {prioritizing ? 'Prioritizing...' : 'AI Prioritize'}
            </button>
          )}
          {activeTab === 'tasks' ? (
            <button
              onClick={() => {
                setForm(emptyForm());
                setEditingId(null);
                setShowForm(true);
              }}
              className="rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy/90"
            >
              + Add Todo
            </button>
          ) : (
            <button
              onClick={() => {
                setRecurringForm(emptyRecurringForm());
                setEditingRecurringId(null);
                setShowRecurringForm(true);
              }}
              className="rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy/90"
            >
              + Add Recurring
            </button>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="mb-6 flex border-b border-brand-border">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'tasks'
              ? 'border-b-2 border-navy text-charcoal'
              : 'text-medium-gray hover:text-dark-gray'
          }`}
        >
          Tasks
          {activeTodos.length > 0 && (
            <span className="ml-1.5 rounded-full bg-cream px-1.5 py-0.5 text-[10px] font-semibold text-dark-gray">
              {activeTodos.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('recurring')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'recurring'
              ? 'border-b-2 border-navy text-charcoal'
              : 'text-medium-gray hover:text-dark-gray'
          }`}
        >
          Recurring
          {recurringTodos.length > 0 && (
            <span className="ml-1.5 rounded-full bg-cream px-1.5 py-0.5 text-[10px] font-semibold text-dark-gray">
              {recurringTodos.length}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════════ TASKS TAB ═══════════════════ */}
      {activeTab === 'tasks' && (
        <>
          {/* Stats bar */}
          {activeTodos.length > 0 && (
            <div className="mb-6 flex gap-4">
              <div className="rounded-lg border border-brand-border bg-white px-4 py-2.5">
                <span className="text-2xl font-semibold text-charcoal">{activeTodos.length}</span>
                <span className="ml-2 text-xs text-medium-gray">active</span>
              </div>
              {overdueCount > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
                  <span className="text-2xl font-semibold text-red-700">{overdueCount}</span>
                  <span className="ml-2 text-xs text-red-600">overdue</span>
                </div>
              )}
              {dueTodayCount > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2.5">
                  <span className="text-2xl font-semibold text-yellow-700">{dueTodayCount}</span>
                  <span className="ml-2 text-xs text-yellow-600">due today</span>
                </div>
              )}
              {highCount > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5">
                  <span className="text-2xl font-semibold text-red-700">{highCount}</span>
                  <span className="ml-2 text-xs text-red-600">high priority</span>
                </div>
              )}
            </div>
          )}

          {/* Filters + View toggle */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex gap-1">
                {(['active', 'completed', 'all'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                      filterStatus === s
                        ? 'bg-navy text-white'
                        : 'bg-cream text-dark-gray hover:bg-tan-light'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {TODO_CATEGORY_OPTIONS.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setFilterCategory(filterCategory === cat.value ? '' : cat.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      filterCategory === cat.value
                        ? 'bg-navy text-white'
                        : 'bg-cream text-dark-gray hover:bg-tan-light'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* View mode toggle */}
            <div className="flex rounded-lg border border-brand-border bg-white">
              <button
                onClick={() => setViewMode('list')}
                className={`rounded-l-lg px-2.5 py-1.5 transition-colors ${
                  viewMode === 'list' ? 'bg-navy text-white' : 'text-medium-gray hover:text-charcoal'
                }`}
                title="List view"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`rounded-r-lg px-2.5 py-1.5 transition-colors ${
                  viewMode === 'calendar' ? 'bg-navy text-white' : 'text-medium-gray hover:text-charcoal'
                }`}
                title="Calendar view"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
              </button>
            </div>
          </div>

          {/* Create/Edit Form */}
          {showForm && (
            <div className="mb-6 rounded-lg border border-brand-border bg-white p-6">
              <h2 className="mb-4 font-serif text-lg text-charcoal">
                {editingId ? 'Edit Todo' : 'New Todo'}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-dark-gray">Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="What needs to be done?"
                    className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
                    autoFocus
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-dark-gray">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="More details about this task..."
                    rows={2}
                    className="w-full resize-none rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-dark-gray">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as TodoPriority })}
                    className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal focus:border-tan focus:outline-none"
                  >
                    {TODO_PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-dark-gray">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as TodoCategory })}
                    className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal focus:border-tan focus:outline-none"
                  >
                    {TODO_CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-dark-gray">Due Date</label>
                  <input
                    type="datetime-local"
                    value={form.due_at}
                    onChange={(e) => setForm({ ...form, due_at: e.target.value })}
                    className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal focus:border-tan focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-dark-gray">Notes</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Quick notes..."
                    className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={!form.title.trim() || saving}
                  className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy/90 disabled:opacity-40"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Todo'}
                </button>
                <button
                  onClick={handleCancel}
                  className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-dark-gray transition-colors hover:bg-cream"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Calendar View ── */}
          {viewMode === 'calendar' && (
            <div className="rounded-lg border border-brand-border bg-white">
              {/* Calendar header */}
              <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
                <button
                  onClick={() => {
                    setCalendarMonth((prev) => {
                      const d = new Date(prev.year, prev.month - 1, 1);
                      return { year: d.getFullYear(), month: d.getMonth() };
                    });
                  }}
                  className="rounded p-1 text-medium-gray transition-colors hover:bg-cream hover:text-charcoal"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <div className="flex items-center gap-3">
                  <h2 className="font-serif text-lg text-charcoal">
                    {MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}
                  </h2>
                  <button
                    onClick={() => {
                      const now = new Date();
                      setCalendarMonth({ year: now.getFullYear(), month: now.getMonth() });
                    }}
                    className="rounded-full bg-cream px-2.5 py-0.5 text-[10px] font-medium text-medium-gray transition-colors hover:bg-tan-light"
                  >
                    Today
                  </button>
                </div>
                <button
                  onClick={() => {
                    setCalendarMonth((prev) => {
                      const d = new Date(prev.year, prev.month + 1, 1);
                      return { year: d.getFullYear(), month: d.getMonth() };
                    });
                  }}
                  className="rounded p-1 text-medium-gray transition-colors hover:bg-cream hover:text-charcoal"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-brand-border">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-medium-gray">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              {(() => {
                const days = getCalendarDays(calendarMonth.year, calendarMonth.month);
                const today = new Date();
                const todayKey = calendarDateKey(today.getDate(), today.getMonth(), today.getFullYear());

                // Build a map of date -> todos
                const todosByDate: Record<string, Todo[]> = {};
                for (const todo of allTodos) {
                  if (!todo.due_at) continue;
                  const key = todoDateKey(todo.due_at);
                  if (!todosByDate[key]) todosByDate[key] = [];
                  todosByDate[key].push(todo);
                }

                const rows: typeof days[] = [];
                for (let i = 0; i < days.length; i += 7) {
                  rows.push(days.slice(i, i + 7));
                }

                return (
                  <div>
                    {rows.map((row, rowIdx) => (
                      <div key={rowIdx} className={`grid grid-cols-7 ${rowIdx < rows.length - 1 ? 'border-b border-brand-border' : ''}`}>
                        {row.map((cell, cellIdx) => {
                          const key = calendarDateKey(cell.day, cell.month, cell.year);
                          const isToday = key === todayKey;
                          const cellTodos = todosByDate[key] ?? [];

                          return (
                            <div
                              key={cellIdx}
                              className={`min-h-[90px] border-r border-brand-border p-1.5 last:border-r-0 ${
                                !cell.isCurrentMonth ? 'bg-cream/50' : ''
                              } ${isToday ? 'bg-blue-50/50' : ''}`}
                            >
                              <div className={`mb-1 text-right text-xs ${
                                isToday
                                  ? 'inline-flex float-right h-5 w-5 items-center justify-center rounded-full bg-navy text-white font-semibold'
                                  : cell.isCurrentMonth
                                    ? 'font-medium text-charcoal'
                                    : 'text-light-gray'
                              }`}>
                                {cell.day}
                              </div>
                              <div className="space-y-0.5 clear-both">
                                {cellTodos.slice(0, 3).map((todo) => {
                                  const dotColor = todo.status === 'completed'
                                    ? 'bg-gray-300'
                                    : PRIORITY_BADGES[todo.priority]?.dot ?? 'bg-yellow-500';
                                  return (
                                    <button
                                      key={todo.id}
                                      onClick={() => {
                                        handleEdit(todo);
                                        setViewMode('list');
                                      }}
                                      className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-cream ${
                                        todo.status === 'completed' ? 'opacity-50' : ''
                                      }`}
                                      title={todo.title}
                                    >
                                      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotColor}`} />
                                      <span className={`truncate text-[10px] ${
                                        todo.status === 'completed' ? 'text-medium-gray line-through' : 'text-charcoal'
                                      }`}>
                                        {todo.title}
                                      </span>
                                    </button>
                                  );
                                })}
                                {cellTodos.length > 3 && (
                                  <span className="block px-1 text-[9px] text-medium-gray">
                                    +{cellTodos.length - 3} more
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── List View ── */}
          {viewMode === 'list' && (
            <>
              {/* Empty state */}
              {todos.length === 0 && !showForm && (
                <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-lg border border-brand-border bg-white">
                  <p className="text-medium-gray">
                    {filterStatus === 'completed' ? 'No completed todos' : 'No todos yet'}
                  </p>
                  <p className="mt-1 text-sm text-light-gray">
                    Add todos here or tell your EA &ldquo;remind me to...&rdquo;
                  </p>
                </div>
              )}

              {/* Active todos */}
              {activeTodos.length > 0 && filterStatus !== 'completed' && (
                <div className="mb-8 space-y-2">
                  {activeTodos.map((todo) => {
                    const badge = PRIORITY_BADGES[todo.priority] ?? PRIORITY_BADGES.medium;
                    const due = todo.due_at ? formatDueLabel(todo.due_at) : null;

                    return (
                      <div key={todo.id}>
                        <div className="group rounded-lg border border-brand-border bg-white p-4 transition-colors hover:border-tan">
                          <div className="flex items-start gap-3">
                            {/* Checkbox */}
                            <button
                              onClick={() => handleComplete(todo.id)}
                              className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 border-brand-border text-transparent transition-colors hover:border-navy hover:text-navy"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            </button>

                            {/* Content */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-medium text-charcoal">{todo.title}</h3>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                                  {todo.priority}
                                </span>
                                <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium text-medium-gray">
                                  {todo.category}
                                </span>
                                {due && (
                                  <span className={`text-[11px] font-medium ${due.urgent ? 'text-red-600' : 'text-medium-gray'}`}>
                                    {due.text}
                                  </span>
                                )}
                                {todo.recurring_todo_id && (
                                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                                    recurring
                                  </span>
                                )}
                                {todo.email_status && (
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    todo.email_status === 'awaiting_reply' ? 'bg-amber-50 text-amber-700' :
                                    todo.email_status === 'replied' ? 'bg-blue-50 text-blue-700' :
                                    todo.email_status === 'draft_ready' ? 'bg-purple-50 text-purple-700' :
                                    todo.email_status === 'scheduled' ? 'bg-green-50 text-green-700' :
                                    todo.email_status === 'resolved' ? 'bg-gray-100 text-gray-600' :
                                    'bg-gray-50 text-gray-600'
                                  }`}>
                                    {todo.email_status === 'awaiting_reply' ? 'awaiting reply' : todo.email_status.replace('_', ' ')}
                                  </span>
                                )}
                              </div>
                              {todo.description && (
                                <p className="mt-1 text-xs text-dark-gray">{todo.description}</p>
                              )}
                              {todo.email_subject && (
                                <p className="mt-1 flex items-center gap-1 text-[11px] text-medium-gray">
                                  <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                                  {todo.email_subject}
                                  {todo.email_from && <span className="text-tan-dark">from {todo.email_from}</span>}
                                </p>
                              )}
                              {todo.ai_priority_reason && (
                                <p className="mt-1 text-[11px] italic text-medium-gray">
                                  AI: {todo.ai_priority_reason}
                                </p>
                              )}

                              {/* AI Assist chat thread */}
                              {assistThread?.todoId === todo.id && (
                                <div className="mt-3 rounded-lg border border-tan bg-cream p-3">
                                  <div className="mb-2 flex items-center justify-between">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-tan-dark">
                                      AI Assistance
                                    </div>
                                    <button
                                      onClick={() => { setAssistThread(null); setAssistReply(''); }}
                                      className="text-[11px] text-medium-gray hover:text-charcoal"
                                    >
                                      Close
                                    </button>
                                  </div>

                                  {/* Conversation messages (skip first auto-generated user message) */}
                                  <div className="space-y-3">
                                    {assistThread.messages.slice(1).map((msg, i) => (
                                      <div key={i}>
                                        {msg.role === 'user' ? (
                                          <div className="rounded bg-white/60 px-2.5 py-1.5 text-xs text-charcoal">
                                            {msg.content}
                                          </div>
                                        ) : (
                                          <div className="prose prose-sm max-w-none text-xs text-charcoal [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0">
                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>

                                  {/* Active tool calls */}
                                  {assistThread.activeToolCalls.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {assistThread.activeToolCalls.map((tool, i) => (
                                        <span
                                          key={i}
                                          className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-medium-gray"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                          {TOOL_LABELS[tool] || tool}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Loading indicator */}
                                  {assistThread.loading && assistThread.activeToolCalls.length === 0 && (
                                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-medium-gray">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                      Thinking...
                                    </div>
                                  )}

                                  {/* Reply input */}
                                  {!assistThread.loading && (
                                    <div className="mt-3 flex gap-2">
                                      <textarea
                                        ref={assistInputRef}
                                        value={assistReply}
                                        onChange={(e) => setAssistReply(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleAssistReply();
                                          }
                                        }}
                                        placeholder="Reply... e.g. &quot;Draft that email for me&quot;"
                                        rows={1}
                                        className="flex-1 resize-none rounded border border-brand-border bg-white px-2.5 py-1.5 text-xs text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
                                      />
                                      <button
                                        onClick={handleAssistReply}
                                        disabled={!assistReply.trim()}
                                        className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-navy/90 disabled:opacity-40"
                                      >
                                        Send
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="ml-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                onClick={() => handleAssist(todo.id)}
                                disabled={assistThread?.todoId === todo.id && assistThread.loading}
                                className="rounded p-1.5 text-medium-gray transition-colors hover:bg-tan-light hover:text-tan-dark"
                                title="AI Assist"
                              >
                                {assistThread?.todoId === todo.id && assistThread.loading ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>
                                )}
                              </button>
                              <button
                                onClick={() => handleEdit(todo)}
                                className="rounded p-1.5 text-medium-gray transition-colors hover:bg-cream hover:text-charcoal"
                                title="Edit"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                              </button>
                              <button
                                onClick={() => handleDelete(todo.id)}
                                className="rounded p-1.5 text-medium-gray transition-colors hover:bg-red-50 hover:text-red-500"
                                title="Delete"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Completed todos */}
              {completedTodos.length > 0 && filterStatus !== 'active' && (
                <div>
                  {filterStatus === 'all' && (
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-medium-gray">
                      Completed ({completedTodos.length})
                    </h2>
                  )}
                  <div className="space-y-2">
                    {completedTodos.map((todo) => (
                      <div
                        key={todo.id}
                        className="group rounded-lg border border-brand-border bg-white p-4 opacity-60 transition-all hover:opacity-100"
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => handleReopen(todo.id)}
                            className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 border-navy bg-navy text-white transition-colors hover:bg-transparent hover:text-transparent"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </button>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm text-medium-gray line-through">{todo.title}</h3>
                            {todo.completed_at && (
                              <p className="mt-0.5 text-[11px] text-light-gray">
                                Completed{' '}
                                {new Date(todo.completed_at).toLocaleDateString('en-US', {
                                  timeZone: 'America/Denver',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </p>
                            )}
                          </div>
                          <div className="ml-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => handleDelete(todo.id)}
                              className="rounded p-1.5 text-medium-gray transition-colors hover:bg-red-50 hover:text-red-500"
                              title="Delete"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════════════ RECURRING TAB ═══════════════════ */}
      {activeTab === 'recurring' && (
        <>
          {/* Recurring form */}
          {showRecurringForm && (
            <div className="mb-6 rounded-lg border border-brand-border bg-white p-6">
              <h2 className="mb-4 font-serif text-lg text-charcoal">
                {editingRecurringId ? 'Edit Recurring Todo' : 'New Recurring Todo'}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-dark-gray">Title *</label>
                  <input
                    type="text"
                    value={recurringForm.title}
                    onChange={(e) => setRecurringForm({ ...recurringForm, title: e.target.value })}
                    placeholder="e.g. Give Finley heartworm pill, Change HVAC filter..."
                    className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
                    autoFocus
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-dark-gray">Description</label>
                  <textarea
                    value={recurringForm.description}
                    onChange={(e) => setRecurringForm({ ...recurringForm, description: e.target.value })}
                    placeholder="More details..."
                    rows={2}
                    className="w-full resize-none rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
                  />
                </div>

                {/* Schedule section */}
                <div className="sm:col-span-2">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-medium-gray">
                    Schedule
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-dark-gray">Repeats</label>
                      <select
                        value={recurringForm.recurrence_type}
                        onChange={(e) => setRecurringForm({ ...recurringForm, recurrence_type: e.target.value as RecurrenceType })}
                        className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal focus:border-tan focus:outline-none"
                      >
                        {RECURRENCE_TYPE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-dark-gray">Every</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={recurringForm.recurrence_interval}
                          onChange={(e) => setRecurringForm({ ...recurringForm, recurrence_interval: parseInt(e.target.value) || 1 })}
                          className="w-20 rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal focus:border-tan focus:outline-none"
                        />
                        <span className="text-xs text-medium-gray">
                          {recurringForm.recurrence_type === 'daily' && (recurringForm.recurrence_interval === 1 ? 'day' : 'days')}
                          {recurringForm.recurrence_type === 'weekly' && (recurringForm.recurrence_interval === 1 ? 'week' : 'weeks')}
                          {recurringForm.recurrence_type === 'monthly' && (recurringForm.recurrence_interval === 1 ? 'month' : 'months')}
                          {recurringForm.recurrence_type === 'yearly' && (recurringForm.recurrence_interval === 1 ? 'year' : 'years')}
                        </span>
                      </div>
                    </div>
                    {recurringForm.recurrence_type === 'weekly' && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-dark-gray">Day of Week</label>
                        <select
                          value={recurringForm.recurrence_day_of_week}
                          onChange={(e) => setRecurringForm({ ...recurringForm, recurrence_day_of_week: e.target.value })}
                          className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal focus:border-tan focus:outline-none"
                        >
                          <option value="">Any</option>
                          {DAY_NAMES.map((d, i) => (
                            <option key={i} value={i}>{d}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {(recurringForm.recurrence_type === 'monthly' || recurringForm.recurrence_type === 'yearly') && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-dark-gray">Day of Month</label>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={recurringForm.recurrence_day_of_month}
                          onChange={(e) => setRecurringForm({ ...recurringForm, recurrence_day_of_month: e.target.value })}
                          placeholder="1-31"
                          className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
                        />
                      </div>
                    )}
                    {recurringForm.recurrence_type === 'yearly' && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-dark-gray">Month</label>
                        <select
                          value={recurringForm.recurrence_month}
                          onChange={(e) => setRecurringForm({ ...recurringForm, recurrence_month: e.target.value })}
                          className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal focus:border-tan focus:outline-none"
                        >
                          <option value="">Select month</option>
                          {MONTH_NAMES.map((m, i) => (
                            <option key={i} value={i + 1}>{m}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-dark-gray">First Due Date</label>
                  <input
                    type="date"
                    value={recurringForm.next_due_at}
                    onChange={(e) => setRecurringForm({ ...recurringForm, next_due_at: e.target.value })}
                    className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal focus:border-tan focus:outline-none"
                  />
                  <p className="mt-0.5 text-[10px] text-light-gray">Leave blank to auto-compute from today</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-dark-gray">Advance Notice (days)</label>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={recurringForm.advance_notice_days}
                    onChange={(e) => setRecurringForm({ ...recurringForm, advance_notice_days: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal focus:border-tan focus:outline-none"
                  />
                  <p className="mt-0.5 text-[10px] text-light-gray">Create todo this many days before due date</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-dark-gray">Priority</label>
                  <select
                    value={recurringForm.priority}
                    onChange={(e) => setRecurringForm({ ...recurringForm, priority: e.target.value as TodoPriority })}
                    className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal focus:border-tan focus:outline-none"
                  >
                    {TODO_PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-dark-gray">Category</label>
                  <select
                    value={recurringForm.category}
                    onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value as TodoCategory })}
                    className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal focus:border-tan focus:outline-none"
                  >
                    {TODO_CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-dark-gray">Notes</label>
                  <input
                    type="text"
                    value={recurringForm.notes}
                    onChange={(e) => setRecurringForm({ ...recurringForm, notes: e.target.value })}
                    placeholder="Quick notes..."
                    className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleRecurringSave}
                  disabled={!recurringForm.title.trim() || recurringSaving}
                  className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy/90 disabled:opacity-40"
                >
                  {recurringSaving ? 'Saving...' : editingRecurringId ? 'Save Changes' : 'Add Recurring Todo'}
                </button>
                <button
                  onClick={handleRecurringCancel}
                  className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-dark-gray transition-colors hover:bg-cream"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {recurringTodos.length === 0 && !showRecurringForm && (
            <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-lg border border-brand-border bg-white">
              <p className="text-medium-gray">No recurring todos yet</p>
              <p className="mt-1 text-sm text-light-gray">
                Set up repeating tasks like pet care, home maintenance, or vehicle upkeep
              </p>
            </div>
          )}

          {/* Recurring list */}
          {recurringTodos.length > 0 && (
            <div className="space-y-2">
              {recurringTodos.map((r) => {
                const badge = PRIORITY_BADGES[r.priority] ?? PRIORITY_BADGES.medium;
                const nextDue = new Date(r.next_due_at + 'T12:00:00');
                const now = new Date();
                const daysUntil = Math.ceil((nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                return (
                  <div
                    key={r.id}
                    className={`group rounded-lg border border-brand-border bg-white p-4 transition-colors hover:border-tan ${
                      !r.is_active ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Repeat icon */}
                      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center text-blue-500">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-charcoal">{r.title}</h3>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.bg} ${badge.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                            {r.priority}
                          </span>
                          <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium text-medium-gray">
                            {r.category}
                          </span>
                          {!r.is_active && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                              paused
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-dark-gray">
                          <span className="font-medium text-blue-600">{formatRecurrenceLabel(r)}</span>
                          <span className="text-medium-gray">
                            Next:{' '}
                            {nextDue.toLocaleDateString('en-US', {
                              timeZone: 'America/Denver',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                            {daysUntil >= 0 && (
                              <span className="ml-1 text-light-gray">
                                ({daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`})
                              </span>
                            )}
                          </span>
                          {r.advance_notice_days > 0 && (
                            <span className="text-light-gray">
                              {r.advance_notice_days}d advance notice
                            </span>
                          )}
                        </div>
                        {r.description && (
                          <p className="mt-1 text-xs text-dark-gray">{r.description}</p>
                        )}
                        {r.notes && (
                          <p className="mt-0.5 text-[11px] italic text-medium-gray">{r.notes}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="ml-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => handleRecurringToggle(r.id, r.is_active)}
                          className="rounded p-1.5 text-medium-gray transition-colors hover:bg-cream hover:text-charcoal"
                          title={r.is_active ? 'Pause' : 'Resume'}
                        >
                          {r.is_active ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          )}
                        </button>
                        <button
                          onClick={() => handleRecurringEdit(r)}
                          className="rounded p-1.5 text-medium-gray transition-colors hover:bg-cream hover:text-charcoal"
                          title="Edit"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button
                          onClick={() => handleRecurringDelete(r.id)}
                          className="rounded p-1.5 text-medium-gray transition-colors hover:bg-red-50 hover:text-red-500"
                          title="Delete"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
