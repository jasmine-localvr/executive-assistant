'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import type { WeeklySchedule, DailySummary, UpdateFrequency } from '@/types';
import {
  WEEKLY_SCHEDULE_OPTIONS,
  DAILY_SUMMARY_OPTIONS,
  UPDATE_FREQUENCY_OPTIONS,
} from '@/types';

interface FeatureState {
  feature_inbox_management: boolean;
  feature_inbox_summaries: boolean;
  summary_weekly_schedule: WeeklySchedule;
  summary_daily_summaries: DailySummary[];
  summary_update_frequency: UpdateFrequency;
  feature_inbox_drafting: boolean;
  email_style: string;
  feature_calendar_scheduling: boolean;
  scheduling_link: string;
  ea_custom_instructions: string;
  sms_phone_number: string;
}

// ─── Toggle Switch ───

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-tan' : 'bg-brand-border'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ─── Feature Card Wrapper ───

function FeatureCard({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-brand-border bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-serif text-lg text-charcoal">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-medium-gray">
            {description}
          </p>
        </div>
        <ToggleSwitch checked={enabled} onChange={onToggle} />
      </div>
      {enabled && children && (
        <div className="mt-4 border-t border-brand-border pt-4">{children}</div>
      )}
    </div>
  );
}

// ─── Main Component ───

export default function FeatureSettings() {
  const { data: session } = useSession();
  const memberId = session?.user?.teamMemberId ?? null;
  const [features, setFeatures] = useState<FeatureState | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);

  // Draft state for text fields (save on button click, not on every keystroke)
  const [draftEmailStyle, setDraftEmailStyle] = useState('');
  const [draftSchedulingLink, setDraftSchedulingLink] = useState('');
  const [draftCustomInstructions, setDraftCustomInstructions] = useState('');
  const [draftPhoneNumber, setDraftPhoneNumber] = useState('');
  const [analyzingStyle, setAnalyzingStyle] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [draftWeeklySchedule, setDraftWeeklySchedule] = useState<WeeklySchedule>('weekday');
  const [draftDailySummaries, setDraftDailySummaries] = useState<DailySummary[]>(['morning']);
  const [draftUpdateFrequency, setDraftUpdateFrequency] = useState<UpdateFrequency>('every_2_hours');

  // Load feature settings for the current user
  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    fetch(`/api/team/${memberId}/features`)
      .then((r) => r.json())
      .then((data) => {
        const state: FeatureState = {
          feature_inbox_management: data.feature_inbox_management ?? false,
          feature_inbox_summaries: data.feature_inbox_summaries ?? false,
          summary_weekly_schedule: data.summary_weekly_schedule ?? 'weekday',
          summary_daily_summaries: data.summary_daily_summaries ?? ['morning'],
          summary_update_frequency: data.summary_update_frequency ?? 'every_2_hours',
          feature_inbox_drafting: data.feature_inbox_drafting ?? false,
          email_style: data.email_style ?? '',
          feature_calendar_scheduling: data.feature_calendar_scheduling ?? false,
          scheduling_link: data.scheduling_link ?? '',
          ea_custom_instructions: data.ea_custom_instructions ?? '',
          sms_phone_number: data.sms_phone_number ?? '',
        };
        setFeatures(state);
        setDraftEmailStyle(state.email_style);
        setDraftSchedulingLink(state.scheduling_link);
        setDraftCustomInstructions(state.ea_custom_instructions);
        setDraftPhoneNumber(state.sms_phone_number);
        setDraftWeeklySchedule(state.summary_weekly_schedule);
        setDraftDailySummaries(state.summary_daily_summaries);
        setDraftUpdateFrequency(state.summary_update_frequency);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [memberId]);

  // Save helper
  const patchFeature = useCallback(
    async (updates: Partial<FeatureState>) => {
      if (!memberId) return;
      const res = await fetch(`/api/team/${memberId}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setFeatures((prev) => (prev ? { ...prev, ...updates } : prev));
        return data;
      }
    },
    [memberId]
  );

  // Toggle handler — saves immediately
  function handleToggle(field: keyof FeatureState, value: boolean) {
    setFeatures((prev) => (prev ? { ...prev, [field]: value } : prev));
    patchFeature({ [field]: value });
    showSaved(field);
  }

  function showSaved(field: string) {
    setSavedField(field);
    setTimeout(() => setSavedField(null), 2000);
  }

  async function saveCadenceSettings() {
    await patchFeature({
      summary_weekly_schedule: draftWeeklySchedule,
      summary_daily_summaries: draftDailySummaries,
      summary_update_frequency: draftUpdateFrequency,
    });
    showSaved('cadence');
  }

  function toggleDailySummary(value: DailySummary) {
    setDraftDailySummaries((prev) => {
      if (prev.includes(value)) {
        // Don't allow empty — keep at least one
        if (prev.length === 1) return prev;
        return prev.filter((v) => v !== value);
      }
      return [...prev, value];
    });
  }

  const cadenceChanged = features
    ? draftWeeklySchedule !== features.summary_weekly_schedule ||
      draftUpdateFrequency !== features.summary_update_frequency ||
      JSON.stringify([...draftDailySummaries].sort()) !==
        JSON.stringify([...features.summary_daily_summaries].sort())
    : false;

  async function analyzeStyle() {
    if (!memberId) return;
    setAnalyzingStyle(true);
    setAnalyzeError(null);
    try {
      const res = await fetch(`/api/team/${memberId}/analyze-style`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Analysis failed');
      }
      const data = await res.json();
      setDraftEmailStyle(data.style);
    } catch (err) {
      setAnalyzeError(
        err instanceof Error ? err.message : 'Failed to analyze email style'
      );
    } finally {
      setAnalyzingStyle(false);
    }
  }

  async function saveEmailStyle() {
    await patchFeature({ email_style: draftEmailStyle });
    showSaved('email_style');
  }

  async function saveSchedulingLink() {
    await patchFeature({ scheduling_link: draftSchedulingLink });
    showSaved('scheduling_link');
  }

  async function saveCustomInstructions() {
    await patchFeature({ ea_custom_instructions: draftCustomInstructions });
    showSaved('ea_custom_instructions');
  }

  async function savePhoneNumber() {
    await patchFeature({ sms_phone_number: draftPhoneNumber });
    showSaved('sms_phone_number');
  }

  if (!memberId || loading || !features) {
    return (
      <p className="text-sm text-medium-gray">Loading feature settings...</p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Feature 1: Inbox Management */}
      <FeatureCard
        title="Inbox Management"
        description="Allow the EA to read, label, and auto-archive emails as they are received."
        enabled={features.feature_inbox_management}
        onToggle={(v) => handleToggle('feature_inbox_management', v)}
      />

      {/* Feature 2: Inbox Summaries */}
      <FeatureCard
        title="Inbox Summaries"
        description="Receive Inbox Summaries from the Slackbot on your chosen cadence."
        enabled={features.feature_inbox_summaries}
        onToggle={(v) => handleToggle('feature_inbox_summaries', v)}
      >
        <div className="space-y-6">
          {/* Weekly Schedule */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
              Weekly Schedule
            </label>
            <div className="mt-2 flex gap-3">
              {WEEKLY_SCHEDULE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDraftWeeklySchedule(opt.value)}
                  className={`rounded border px-4 py-2 text-sm transition-colors ${
                    draftWeeklySchedule === opt.value
                      ? 'border-tan bg-tan/10 font-medium text-charcoal'
                      : 'border-brand-border bg-white text-medium-gray hover:border-tan'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Daily Summaries — multi-select checklist */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
              Daily Summaries
            </label>
            <p className="mt-1 text-xs text-light-gray">
              Select which summaries to receive each day.
            </p>
            <div className="mt-2 space-y-2">
              {DAILY_SUMMARY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-3 rounded border border-brand-border bg-white px-4 py-3 transition-colors hover:border-tan"
                >
                  <input
                    type="checkbox"
                    checked={draftDailySummaries.includes(opt.value)}
                    onChange={() => toggleDailySummary(opt.value)}
                    className="h-4 w-4 rounded border-brand-border text-tan accent-tan"
                  />
                  <span className="text-sm text-charcoal">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Update Frequency */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
              Update Frequency
            </label>
            <p className="mt-1 text-xs text-light-gray">
              How often to check for new emails during business hours.
            </p>
            <div className="mt-2 flex gap-3">
              {UPDATE_FREQUENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDraftUpdateFrequency(opt.value)}
                  className={`rounded border px-4 py-2 text-sm transition-colors ${
                    draftUpdateFrequency === opt.value
                      ? 'border-tan bg-tan/10 font-medium text-charcoal'
                      : 'border-brand-border bg-white text-medium-gray hover:border-tan'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={saveCadenceSettings}
              disabled={!cadenceChanged}
              className="rounded bg-tan px-4 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Cadence
            </button>
            {savedField === 'cadence' && (
              <span className="text-xs font-medium text-success">Saved</span>
            )}
          </div>
        </div>
      </FeatureCard>

      {/* Feature 3: Inbox Drafting */}
      <FeatureCard
        title="Inbox Drafting"
        description="The EA will suggest drafting replies. When approved, the EA drafts replies in Gmail matching your email style."
        enabled={features.feature_inbox_drafting}
        onToggle={(v) => handleToggle('feature_inbox_drafting', v)}
      >
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
              Your Email Style
            </label>
            <textarea
              value={draftEmailStyle}
              onChange={(e) => setDraftEmailStyle(e.target.value)}
              rows={6}
              placeholder="Describe your email tone, style, and structure. This helps the EA draft replies that sound like you. You can also let the EA analyze your last 50 sent emails to generate this automatically."
              className="mt-1 block w-full rounded border border-brand-border bg-white px-3 py-2 text-sm leading-relaxed text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
            />
            <p className="mt-1 text-xs text-light-gray">
              Edit this anytime to refine how the EA drafts on your behalf.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={analyzeStyle}
              disabled={analyzingStyle}
              className="rounded bg-tan px-4 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analyzingStyle ? 'Analyzing...' : 'Summarize Your Email Style'}
            </button>
            {analyzingStyle && (
              <span className="text-xs text-medium-gray">
                Reading your last 50 sent emails...
              </span>
            )}
            {analyzeError && (
              <span className="text-xs text-red-600">{analyzeError}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={saveEmailStyle}
              disabled={draftEmailStyle === (features.email_style ?? '')}
              className="rounded bg-tan px-4 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Email Style
            </button>
            {savedField === 'email_style' && (
              <span className="text-xs font-medium text-success">Saved</span>
            )}
          </div>
        </div>
      </FeatureCard>

      {/* Feature 4: Calendar Scheduling */}
      <FeatureCard
        title="Calendar Scheduling"
        description="CC ea@golocalvr.com on emails, and the EA will reply to schedule meetings using your scheduling link."
        enabled={features.feature_calendar_scheduling}
        onToggle={(v) => handleToggle('feature_calendar_scheduling', v)}
      >
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
              Your Scheduling Link
            </label>
            <input
              type="url"
              value={draftSchedulingLink}
              onChange={(e) => setDraftSchedulingLink(e.target.value)}
              placeholder="https://calendly.com/your-name"
              className="mt-1 block w-full max-w-md rounded border border-brand-border bg-white px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={saveSchedulingLink}
              disabled={draftSchedulingLink === (features.scheduling_link ?? '')}
              className="rounded bg-tan px-4 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Link
            </button>
            {savedField === 'scheduling_link' && (
              <span className="text-xs font-medium text-success">Saved</span>
            )}
          </div>
          <div className="mt-4 border-t border-brand-border pt-4">
            <label className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
              Custom Instructions
            </label>
            <textarea
              value={draftCustomInstructions}
              onChange={(e) => setDraftCustomInstructions(e.target.value)}
              rows={3}
              placeholder="Optional context for the EA when generating scheduling replies (e.g., 'I prefer 30-minute calls' or 'Mention that I handle the Telluride market')"
              className="mt-1 block w-full rounded border border-brand-border bg-white px-3 py-2 text-sm leading-relaxed text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={saveCustomInstructions}
                disabled={
                  draftCustomInstructions ===
                  (features.ea_custom_instructions ?? '')
                }
                className="rounded bg-tan px-4 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Instructions
              </button>
              {savedField === 'ea_custom_instructions' && (
                <span className="text-xs font-medium text-success">Saved</span>
              )}
            </div>
          </div>
        </div>
      </FeatureCard>

      {/* Feature 5: Text Your EA */}
      <div className="rounded-md border border-brand-border bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
        <h3 className="font-serif text-lg text-charcoal">Text Your EA</h3>
        <p className="mt-1 text-sm leading-relaxed text-medium-gray">
          Text your Twilio number to add todos, send emails, check your calendar, and more — all the same things you can do in the chat.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[1.5px] text-tan-dark">
              Your Phone Number
            </label>
            <input
              type="tel"
              value={draftPhoneNumber}
              onChange={(e) => setDraftPhoneNumber(e.target.value)}
              placeholder="+15551234567"
              className="mt-1 block w-full max-w-md rounded border border-brand-border bg-white px-3 py-2 text-sm text-charcoal placeholder:text-light-gray focus:border-tan focus:outline-none"
            />
            <p className="mt-1 text-xs text-light-gray">
              E.164 format (e.g. +15551234567). This links your phone to your account so the EA knows who&apos;s texting.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={savePhoneNumber}
              disabled={draftPhoneNumber === (features.sms_phone_number ?? '')}
              className="rounded bg-tan px-4 py-1.5 text-xs font-medium text-charcoal transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save Phone Number
            </button>
            {savedField === 'sms_phone_number' && (
              <span className="text-xs font-medium text-success">Saved</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
