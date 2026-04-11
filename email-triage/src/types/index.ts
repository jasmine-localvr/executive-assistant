// ─── Database Row Types ───

// ─── Cadence Types ───

export type WeeklySchedule = 'weekday' | 'daily';
export type DailySummary = 'morning' | 'end_of_day';
export type UpdateFrequency = 'hourly' | 'every_2_hours' | 'every_4_hours';

export const WEEKLY_SCHEDULE_OPTIONS: { value: WeeklySchedule; label: string }[] = [
  { value: 'weekday', label: 'Monday – Friday' },
  { value: 'daily', label: 'Every Day' },
];

export const DAILY_SUMMARY_OPTIONS: { value: DailySummary; label: string }[] = [
  { value: 'morning', label: 'Morning at 8am' },
  { value: 'end_of_day', label: 'End-of-day at 5pm' },
];

export const UPDATE_FREQUENCY_OPTIONS: { value: UpdateFrequency; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'every_2_hours', label: 'Every 2 hours' },
  { value: 'every_4_hours', label: 'Every 4 hours' },
];

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  slack_user_id: string | null;
  gmail_refresh_token: string | null;
  gmail_access_token: string | null;
  gmail_token_expiry: string | null;
  role: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  // Feature settings
  feature_inbox_management: boolean;
  feature_inbox_summaries: boolean;
  summary_weekly_schedule: WeeklySchedule;
  summary_daily_summaries: DailySummary[];
  summary_update_frequency: UpdateFrequency;
  feature_inbox_drafting: boolean;
  email_style: string | null;
  feature_calendar_scheduling: boolean;
  scheduling_link: string | null;
  ea_custom_instructions: string | null;
  sms_phone_number: string | null;
  home_address: string | null;
  work_address: string | null;
  investment_property_addresses: string[];
}

export interface TriageRun {
  id: string;
  team_member_id: string;
  started_at: string;
  completed_at: string | null;
  emails_fetched: number;
  emails_classified: number;
  tier1_count: number;
  tier2_count: number;
  tier3_count: number;
  tier4_count: number;
  archived_count: number;
  slack_dms_sent: number;
  drafts_created: number;
  slack_digest_sent: boolean;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
}

export interface ClassifiedEmail {
  id: string;
  triage_run_id: string;
  team_member_id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  from_address: string | null;
  subject: string | null;
  snippet: string | null;
  received_at: string | null;
  tier: 1 | 2 | 3 | 4;
  label: string;
  summary: string;
  summary_oneline: string | null;
  priority_reason: string;
  suggested_action: string | null;
  suggested_assignee: string | null;
  needs_reply: boolean;
  draft_reply_text: string | null;
  gmail_draft_id: string | null;
  draft_created: boolean;
  archived: boolean;
  slack_dm_sent: boolean;
  classified_at: string;
}

export interface PipelineLog {
  id: string;
  triage_run_id: string;
  timestamp: string;
  level: 'info' | 'success' | 'error' | 'warn';
  step: 'fetch' | 'classify' | 'archive' | 'slack' | 'parse' | 'pipeline' | 'complete' | 'draft' | 'digest';
  message: string;
  metadata: Record<string, unknown> | null;
}

// ─── Claude Classification Response ───

export interface ClassificationResult {
  tier: 1 | 2 | 3 | 4;
  label: string;
  summary: string;
  summary_oneline: string;
  priority_reason: string;
  suggested_action: string | null;
  suggested_assignee: string | null;
  needs_reply: boolean;
  draft_reply: string | null;
}

// ─── Gmail Types ───

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to?: string;
  cc?: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string;
  messageIdHeader?: string;
}

// ─── Pipeline Types ───

export type LogLevel = PipelineLog['level'];
export type PipelineStep = PipelineLog['step'];

// ─── EA Scheduling Types ───

export interface EaReply {
  id: string;
  team_member_id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  from_address: string;
  to_addresses: string | null;
  cc_addresses: string | null;
  subject: string | null;
  snippet: string | null;
  reply_text: string;
  reply_sent: boolean;
  sent_at: string | null;
  reply_gmail_message_id: string | null;
  error_message: string | null;
  created_at: string;
  // Joined fields
  team_member_name?: string;
}

export interface EaProcessResult {
  messagesFound: number;
  repliesSent: number;
  errors: number;
  skipped: number;
}

// ─── EA Gmail Message ───

export interface EaInboxMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string;
  messageIdHeader: string;
}

// ─── EA Contacts ───

export interface EaContact {
  id: string;
  team_member_id: string;
  name: string;
  type: string; // 'doctor' | 'vet' | 'dentist' | 'vendor' | etc.
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  last_appointment: string | null; // date string
  created_at: string;
  updated_at: string;
}

// ─── Tier Override Rules ───

export interface TierOverrideRule {
  id: string;
  team_member_id: string;
  match_type: 'sender' | 'domain' | 'subject' | 'keyword';
  match_value: string;
  forced_tier: 1 | 2 | 3 | 4;
  reason: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ParsedOverrideRule {
  match_type: 'sender' | 'domain' | 'subject' | 'keyword';
  match_value: string;
  forced_tier: 1 | 2 | 3 | 4;
  description: string;
}

// ─── Todos ───

export type TodoPriority = 'low' | 'medium' | 'high';
export type TodoStatus = 'active' | 'completed';
export type TodoCategory = 'work' | 'personal' | 'properties' | 'errands' | 'follow-up';

export const TODO_CATEGORY_OPTIONS: { value: TodoCategory; label: string }[] = [
  { value: 'work', label: 'Work' },
  { value: 'personal', label: 'Personal' },
  { value: 'properties', label: 'Properties' },
  { value: 'errands', label: 'Errands' },
  { value: 'follow-up', label: 'Follow-up' },
];

export const TODO_PRIORITY_OPTIONS: { value: TodoPriority; label: string; color: string }[] = [
  { value: 'high', label: 'High', color: 'text-red-600' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-600' },
  { value: 'low', label: 'Low', color: 'text-green-600' },
];

export type EmailStatus = 'awaiting_reply' | 'replied' | 'draft_ready' | 'scheduled' | 'resolved';
export type TodoSource = 'manual' | 'email' | 'agent' | 'triage';

export interface Todo {
  id: string;
  team_member_id: string;
  title: string;
  description: string | null;
  notes: string | null;
  category: TodoCategory;
  priority: TodoPriority;
  status: TodoStatus;
  due_at: string | null;
  snoozed_until: string | null;
  slack_reminded_at: string | null;
  ai_priority_reason: string | null;
  completed_at: string | null;
  recurring_todo_id: string | null;
  // Email linking
  email_thread_id: string | null;
  email_message_id: string | null;
  email_subject: string | null;
  email_from: string | null;
  email_status: EmailStatus | null;
  source: TodoSource;
  created_at: string;
  updated_at: string;
}

// ─── Email Actions ───

export type EmailActionType =
  | 'email_sent'
  | 'email_drafted'
  | 'reply_received'
  | 'follow_up_sent'
  | 'appointment_confirmed'
  | 'appointment_scheduled'
  | 'archived'
  | 'note';

export interface EmailAction {
  id: string;
  reminder_id: string | null;
  team_member_id: string;
  email_thread_id: string;
  gmail_message_id: string | null;
  action_type: EmailActionType;
  action_summary: string | null;
  action_details: Record<string, unknown> | null;
  created_at: string;
}

// ─── Recurring Todos ───

export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const RECURRENCE_TYPE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export interface RecurringTodo {
  id: string;
  team_member_id: string;
  title: string;
  description: string | null;
  notes: string | null;
  category: TodoCategory;
  priority: TodoPriority;
  recurrence_type: RecurrenceType;
  recurrence_interval: number;
  recurrence_day_of_week: number | null;
  recurrence_day_of_month: number | null;
  recurrence_month: number | null;
  advance_notice_days: number;
  next_due_at: string;
  last_generated_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PipelineRunResult {
  runId: string;
  status: 'completed' | 'failed';
  emailsFetched: number;
  emailsClassified: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  tier4Count: number;
  archivedCount: number;
  slackDmsSent: number;
  draftsCreated: number;
}
