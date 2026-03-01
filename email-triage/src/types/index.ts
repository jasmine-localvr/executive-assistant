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
