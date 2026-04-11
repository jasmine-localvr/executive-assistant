'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import type { Todo, TodoPriority, TodoCategory } from '@/types';
import { TODO_CATEGORY_OPTIONS, TODO_PRIORITY_OPTIONS } from '@/types';

const PRIORITY_BADGES: Record<string, { bg: string; text: string; dot: string }> = {
  high: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  low: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
};

function emptyForm() {
  return {
    title: '',
    description: '',
    notes: '',
    category: 'general' as TodoCategory,
    priority: 'medium' as TodoPriority,
    due_at: '',
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

export default function TodosPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'active' | 'completed' | 'all'>('active');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [prioritizing, setPrioritizing] = useState(false);
  const [assistingId, setAssistingId] = useState<string | null>(null);
  const [assistResult, setAssistResult] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const loadTodos = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('status', filterStatus);
    if (filterCategory) params.set('category', filterCategory);

    const res = await fetch(`/api/todos?${params}`);
    if (res.ok) {
      setTodos(await res.json());
    }
    setLoading(false);
  }, [filterStatus, filterCategory]);

  useEffect(() => {
    if (session) loadTodos();
  }, [session, loadTodos]);

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

  const handleAssist = async (todoId: string) => {
    setAssistingId(todoId);
    setAssistResult(null);
    try {
      const res = await fetch(`/api/todos/${todoId}/assist`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAssistResult({ id: todoId, text: data.assistance });
      }
    } finally {
      setAssistingId(null);
    }
  };

  const activeTodos = todos.filter((t) => t.status === 'active');
  const completedTodos = todos.filter((t) => t.status === 'completed');

  // Stats
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

  if (status === 'loading' || loading) {
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
          {activeTodos.length >= 2 && (
            <button
              onClick={handlePrioritize}
              disabled={prioritizing}
              className="rounded-lg border border-brand-border bg-white px-4 py-2.5 text-sm font-medium text-charcoal transition-colors hover:bg-cream disabled:opacity-40"
            >
              {prioritizing ? 'Prioritizing...' : 'AI Prioritize'}
            </button>
          )}
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
        </div>
      </div>

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

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
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
          <button
            onClick={() => setFilterCategory('')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !filterCategory
                ? 'bg-navy text-white'
                : 'bg-cream text-dark-gray hover:bg-tan-light'
            }`}
          >
            All
          </button>
          {TODO_CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(cat.value)}
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
                      </div>
                      {todo.description && (
                        <p className="mt-1 text-xs text-dark-gray">{todo.description}</p>
                      )}
                      {todo.ai_priority_reason && (
                        <p className="mt-1 text-[11px] italic text-medium-gray">
                          AI: {todo.ai_priority_reason}
                        </p>
                      )}

                      {/* AI Assist result */}
                      {assistResult?.id === todo.id && (
                        <div className="mt-3 rounded-lg border border-tan bg-cream p-3">
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-tan-dark">
                            AI Assistance
                          </div>
                          <div className="prose prose-sm max-w-none text-xs text-charcoal whitespace-pre-wrap">
                            {assistResult.text}
                          </div>
                          <button
                            onClick={() => setAssistResult(null)}
                            className="mt-2 text-[11px] text-medium-gray hover:text-charcoal"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="ml-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => handleAssist(todo.id)}
                        disabled={assistingId === todo.id}
                        className="rounded p-1.5 text-medium-gray transition-colors hover:bg-tan-light hover:text-tan-dark"
                        title="AI Assist"
                      >
                        {assistingId === todo.id ? (
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
    </div>
  );
}
