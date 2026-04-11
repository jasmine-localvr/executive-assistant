'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

interface Contact {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  last_appointment: string | null;
  created_at: string;
  updated_at: string;
}

const CONTACT_TYPES = [
  'doctor',
  'dentist',
  'vet',
  'therapist',
  'lawyer',
  'accountant',
  'vendor',
  'contractor',
  'other',
];

const TYPE_LABELS: Record<string, string> = {
  doctor: 'Doctors',
  dentist: 'Dentists',
  vet: 'Veterinarians',
  therapist: 'Therapists',
  lawyer: 'Lawyers',
  accountant: 'Accountants',
  vendor: 'Vendors',
  contractor: 'Contractors',
  other: 'Other',
};

function emptyForm() {
  return { name: '', type: 'doctor', email: '', phone: '', address: '', notes: '' };
}

export default function ContactsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const loadContacts = useCallback(async () => {
    const res = await fetch('/api/contacts');
    if (res.ok) {
      const data = await res.json();
      setContacts(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) loadContacts();
  }, [session, loadContacts]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.type.trim()) return;
    setSaving(true);

    try {
      if (editingId) {
        const res = await fetch(`/api/contacts/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          await loadContacts();
          setEditingId(null);
          setShowForm(false);
          setForm(emptyForm());
        }
      } else {
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          await loadContacts();
          setShowForm(false);
          setForm(emptyForm());
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (contact: Contact) => {
    setForm({
      name: contact.name,
      type: contact.type,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      address: contact.address ?? '',
      notes: contact.notes ?? '',
    });
    setEditingId(contact.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setContacts((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  // Group contacts by type
  const grouped: Record<string, Contact[]> = {};
  const filtered = filterType === 'all' ? contacts : contacts.filter((c) => c.type === filterType);
  for (const contact of filtered) {
    const key = contact.type;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(contact);
  }

  // Determine which types are present for the filter
  const presentTypes = [...new Set(contacts.map((c) => c.type))].sort();

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-medium-gray">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[32px] text-charcoal">Contacts</h1>
          <p className="mt-1 text-sm text-medium-gray">
            People your EA knows — doctors, vets, vendors, and more
          </p>
        </div>
        <button
          onClick={() => {
            setForm(emptyForm());
            setEditingId(null);
            setShowForm(true);
          }}
          className="rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy/90"
        >
          + Add Contact
        </button>
      </div>

      {/* Type filter pills */}
      {presentTypes.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-navy text-white'
                : 'bg-cream text-dark-gray hover:bg-tan-light'
            }`}
          >
            All ({contacts.length})
          </button>
          {presentTypes.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                filterType === t
                  ? 'bg-navy text-white'
                  : 'bg-cream text-dark-gray hover:bg-tan-light'
              }`}
            >
              {t} ({contacts.filter((c) => c.type === t).length})
            </button>
          ))}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-brand-border bg-white p-6">
          <h2 className="mb-4 font-serif text-lg text-charcoal">
            {editingId ? 'Edit Contact' : 'New Contact'}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-dark-gray">
                Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Dr. Sarah Kim"
                className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-dark-gray">
                Type *
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal focus:border-tan focus:outline-none"
              >
                {CONTACT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-dark-gray">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="office@example.com"
                className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-dark-gray">
                Phone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(303) 555-1234"
                className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-dark-gray">
                Address
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="1234 Main St, Denver, CO 80202"
                className="w-full rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-dark-gray">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Scheduling preferences, office hours, special instructions..."
                rows={2}
                className="w-full resize-none rounded-lg border border-brand-border bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || saving}
              className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy/90 disabled:opacity-40"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Contact'}
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

      {/* Contact list grouped by type */}
      {Object.keys(grouped).length === 0 && !showForm && (
        <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-lg border border-brand-border bg-white">
          <p className="text-medium-gray">No contacts yet</p>
          <p className="mt-1 text-sm text-light-gray">
            Add contacts here or ask your EA to save them during chat
          </p>
        </div>
      )}

      {Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([type, items]) => (
          <div key={type} className="mb-6">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-medium-gray">
              {TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1)}
            </h2>
            <div className="space-y-2">
              {items.map((contact) => (
                <div
                  key={contact.id}
                  className="group rounded-lg border border-brand-border bg-white p-4 transition-colors hover:border-tan"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-medium text-charcoal">
                          {contact.name}
                        </h3>
                        {contact.last_appointment && (
                          <span className="text-[11px] text-light-gray">
                            Last visit:{' '}
                            {new Date(contact.last_appointment + 'T00:00:00').toLocaleDateString(
                              'en-US',
                              { month: 'short', day: 'numeric', year: 'numeric' }
                            )}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dark-gray">
                        {contact.email && (
                          <span className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-light-gray"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                            {contact.email}
                          </span>
                        )}
                        {contact.phone && (
                          <span className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-light-gray"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            {contact.phone}
                          </span>
                        )}
                        {contact.address && (
                          <span className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-light-gray"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                            {contact.address}
                          </span>
                        )}
                      </div>
                      {contact.notes && (
                        <p className="mt-2 text-xs text-medium-gray italic">
                          {contact.notes}
                        </p>
                      )}
                    </div>
                    <div className="ml-4 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => handleEdit(contact)}
                        className="rounded p-1.5 text-medium-gray transition-colors hover:bg-cream hover:text-charcoal"
                        title="Edit"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button
                        onClick={() => handleDelete(contact.id)}
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
        ))}
    </div>
  );
}
