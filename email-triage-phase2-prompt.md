# LocalVR Executive Email Triage — Phase 2 MVP

## Project Overview

Build a Next.js application that automatically triages executive team email inboxes. The app reads emails via the Gmail API, classifies them using Claude, auto-archives noise, and sends Slack DMs with summaries for high-priority messages. This replaces a Phase 1 prototype that validated the classification logic but was limited by MCP connector permissions.

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Database:** Supabase (Postgres)
- **AI:** Anthropic Claude API (claude-sonnet-4-20250514)
- **Email:** Gmail API (OAuth2, full read/modify scope)
- **Messaging:** Slack API (Bot with DM capability)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Next.js App                     │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Dashboard │  │ API      │  │ Cron/Webhook │  │
│  │ (React)  │  │ Routes   │  │ Triggers     │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │              │               │           │
│  ┌────┴──────────────┴───────────────┴───────┐  │
│  │           Triage Pipeline Engine           │  │
│  │  1. Fetch → 2. Classify → 3. Act → 4. Log │  │
│  └────┬──────────┬───────────┬───────────┬───┘  │
│       │          │           │           │       │
│  ┌────┴───┐ ┌───┴────┐ ┌───┴────┐ ┌────┴───┐  │
│  │ Gmail  │ │ Claude │ │ Slack  │ │Supabase│  │
│  │ API    │ │ API    │ │ API    │ │  DB    │  │
│  └────────┘ └────────┘ └────────┘ └────────┘  │
└─────────────────────────────────────────────────┘
```

## Database Schema (Supabase)

### Table: `team_members`
```sql
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  slack_user_id TEXT,
  gmail_refresh_token TEXT, -- encrypted
  gmail_access_token TEXT,  -- encrypted
  gmail_token_expiry TIMESTAMPTZ,
  role TEXT, -- 'exec', 'ops_lead', 'finance', etc.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Table: `triage_runs`
```sql
CREATE TABLE triage_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID REFERENCES team_members(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  emails_fetched INT DEFAULT 0,
  emails_classified INT DEFAULT 0,
  tier1_count INT DEFAULT 0,
  tier2_count INT DEFAULT 0,
  tier3_count INT DEFAULT 0,
  archived_count INT DEFAULT 0,
  slack_dms_sent INT DEFAULT 0,
  status TEXT DEFAULT 'running', -- running, completed, failed
  error_message TEXT
);
```

### Table: `classified_emails`
```sql
CREATE TABLE classified_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triage_run_id UUID REFERENCES triage_runs(id),
  team_member_id UUID REFERENCES team_members(id),
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,
  from_address TEXT,
  subject TEXT,
  snippet TEXT,
  received_at TIMESTAMPTZ,
  tier INT NOT NULL CHECK (tier IN (1, 2, 3)),
  label TEXT,
  summary TEXT,
  priority_reason TEXT,
  suggested_action TEXT,
  suggested_assignee TEXT,
  archived BOOLEAN DEFAULT false,
  slack_dm_sent BOOLEAN DEFAULT false,
  classified_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_member_id, gmail_message_id) -- prevent re-processing
);
```

### Table: `pipeline_logs`
```sql
CREATE TABLE pipeline_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triage_run_id UUID REFERENCES triage_runs(id),
  timestamp TIMESTAMPTZ DEFAULT now(),
  level TEXT DEFAULT 'info', -- info, success, error, warn
  step TEXT, -- fetch, classify, archive, slack, parse
  message TEXT NOT NULL,
  metadata JSONB -- store raw API responses, error details, etc.
);
```

## Gmail API Integration

### OAuth2 Setup
- Create a Google Cloud project with Gmail API enabled
- Configure OAuth consent screen with scopes:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.modify` (for archiving and labeling)
  - `https://www.googleapis.com/auth/gmail.labels`
- Store credentials in environment variables

### Key Operations

**Fetch recent inbox emails:**
```typescript
// GET https://gmail.googleapis.com/gmail/v1/users/me/messages
// ?q=in:inbox&maxResults={count}
// Then GET each message by ID for full details
```

**Archive an email (remove INBOX label):**
```typescript
// POST https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}/modify
// Body: { "removeLabelIds": ["INBOX"] }
```

**Add a label:**
```typescript
// First create label if it doesn't exist:
// POST https://gmail.googleapis.com/gmail/v1/users/me/labels
// Body: { "name": "auto-filtered", "labelListVisibility": "labelShow" }
//
// Then apply:
// POST https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}/modify
// Body: { "addLabelIds": ["Label_123"] }
```

### Token Refresh
Gmail access tokens expire after 1 hour. Implement automatic refresh:
```typescript
async function getValidAccessToken(member: TeamMember): Promise<string> {
  if (member.gmail_token_expiry > new Date()) {
    return decrypt(member.gmail_access_token);
  }
  // Refresh using stored refresh_token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: decrypt(member.gmail_refresh_token),
      grant_type: 'refresh_token',
    }),
  });
  // Update stored tokens in Supabase
}
```

## Slack API Integration

### Bot Setup
- Create a Slack app at api.slack.com
- Add Bot Token Scopes: `chat:write`, `users:read`, `users:read.email`
- Install to workspace and store Bot User OAuth Token

### Send DM
```typescript
// 1. Open a DM channel
// POST https://slack.com/api/conversations.open
// Body: { "users": "U12345" }
//
// 2. Send message to the DM channel
// POST https://slack.com/api/chat.postMessage
// Body: {
//   "channel": "{dm_channel_id}",
//   "text": "fallback text",
//   "blocks": [...] // Rich Block Kit message
// }
```

### Slack Message Format (Block Kit)
```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🔴 High Priority Email" }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*From:*\nJohn Owner <john@example.com>" },
        { "type": "mrkdwn", "text": "*Date:*\nFeb 28, 2026" }
      ]
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*Subject:* Concern about maintenance timeline" }
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*Summary:* Owner is asking about delayed HVAC repair at Telluride property #247. Wants update by Friday." }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Suggested Action:*\nLoop in Ground-Ops lead" },
        { "type": "mrkdwn", "text": "*Assign To:*\nOps Team" }
      ]
    },
    { "type": "divider" }
  ]
}
```

## Claude Classification Prompt

This was validated during Phase 1 testing. Use this exact system prompt:

```
You are an email triage assistant for LocalVR, a vacation rental property management company managing 533+ properties across Telluride, Park City, Lake Tahoe, Breckenridge, 30A Florida, and other markets.

Classify each email into exactly ONE tier:

TIER 1 - NOISE (auto-archive):
- Marketing newsletters, vendor promos, SaaS product updates
- Automated notifications (social media, app alerts, subscription receipts)
- Cold outreach / sales pitches
- Bulk promotional emails

TIER 2 - LOW PRIORITY (daily digest):
- FYI-only CCs, internal tool notifications
- Non-urgent vendor updates, routine confirmations
- Industry newsletters with genuinely useful content
- Informational updates that don't require action

TIER 3 - HIGH PRIORITY (immediate Slack alert):
- Property owner communications
- Guest escalations or complaints
- Financial, legal, or compliance matters
- Direct requests from team members or clients
- Time-sensitive operational issues
- Messages from known key contacts

Respond ONLY with valid JSON, no markdown fences:
{
  "tier": 1 | 2 | 3,
  "label": "short label for Gmail",
  "summary": "2-3 sentence summary of the email",
  "priority_reason": "why this tier was assigned",
  "suggested_action": "what the exec should do, if anything",
  "suggested_assignee": "who on the team should handle this, or null"
}
```

For the Claude API call, use:
- Model: `claude-sonnet-4-20250514`
- Max tokens: 1000
- Temperature: 0 (deterministic classification)
- Include the full email body, not just the snippet, for better classification

## Pipeline Engine

The core triage pipeline runs as a single function that can be triggered from:
1. The dashboard UI (manual "Run Now" button)
2. A cron job (e.g., every 15 minutes via Vercel Cron)
3. Gmail Push Notifications (future: Google Pub/Sub webhook)

```typescript
async function runTriagePipeline(teamMemberId: string, emailCount: number = 20) {
  const run = await createTriageRun(teamMemberId);
  const pipelineLog = createLogger(run.id);

  try {
    // Step 1: Fetch
    pipelineLog('info', 'fetch', 'Fetching emails from Gmail...');
    const emails = await fetchInboxEmails(teamMemberId, emailCount);
    pipelineLog('success', 'fetch', `Fetched ${emails.length} emails`);

    // Step 2: Deduplicate (skip already-processed emails)
    const newEmails = await filterAlreadyProcessed(teamMemberId, emails);
    pipelineLog('info', 'fetch', `${newEmails.length} new emails to process`);

    // Step 3: Classify each email
    for (const email of newEmails) {
      pipelineLog('info', 'classify', `Classifying: ${email.subject?.slice(0, 50)}`);
      const classification = await classifyEmail(email);
      await saveClassifiedEmail(run.id, teamMemberId, email, classification);
      pipelineLog('success', 'classify', `Tier ${classification.tier}: ${classification.label}`);
    }

    // Step 4: Archive Tier 1
    const tier1 = await getTier1Emails(run.id);
    for (const email of tier1) {
      await archiveAndLabel(teamMemberId, email.gmail_message_id, email.label);
      await markArchived(email.id);
      pipelineLog('success', 'archive', `Archived: ${email.subject?.slice(0, 50)}`);
    }

    // Step 5: Send Slack DMs for Tier 3
    const tier3 = await getTier3Emails(run.id);
    const member = await getTeamMember(teamMemberId);
    for (const email of tier3) {
      await sendSlackDM(member.slack_user_id, email);
      await markSlackSent(email.id);
      pipelineLog('success', 'slack', `DM sent for: ${email.subject?.slice(0, 50)}`);
    }

    // Step 6: Complete
    await completeTriageRun(run.id);
    pipelineLog('success', 'complete', 'Pipeline complete');
  } catch (error) {
    await failTriageRun(run.id, error.message);
    pipelineLog('error', 'pipeline', `Pipeline failed: ${error.message}`);
    throw error;
  }
}
```

## Dashboard UI

### Pages

**`/` — Dashboard (main view)**
- Shows the most recent triage run stats (tier counts, emails processed)
- "Run Now" button to trigger a manual pipeline run
- List of classified emails grouped by tier (same layout as Phase 1 prototype)
- Each email expandable to show classification details + manual action buttons
- Live activity log panel (real-time via polling or Supabase Realtime)

**`/settings` — Team Configuration**
- Add/remove team members
- Connect Gmail (OAuth flow)
- Connect Slack (enter Slack user ID or search)
- Configure pipeline settings (email count, auto-run interval)
- Toggle auto-archive on/off per user

**`/history` — Run History**
- Table of past triage runs with stats
- Click into any run to see its full activity log and classified emails
- Filter by team member, date range

### Activity Log Component

This is critical for testing and debugging. Port the same logging pattern from Phase 1:

```typescript
// Real-time log display component
// Polls /api/pipeline/logs?runId={id} every 2 seconds during active runs
// Shows timestamp, level icon (→ info, ✓ success, ✗ error), step tag, message
// Color-coded: green for success, red for errors, gray for info
// Auto-scrolls to bottom
// Monospace font (JetBrains Mono)
```

## API Routes

```
POST   /api/auth/gmail/callback     — Gmail OAuth callback, store tokens
POST   /api/pipeline/run             — Trigger pipeline for a team member
GET    /api/pipeline/status/{runId}  — Get run status + stats
GET    /api/pipeline/logs/{runId}    — Get pipeline logs (for live display)
GET    /api/emails?memberId=X&tier=N — Get classified emails with filters
POST   /api/emails/{id}/archive      — Manually archive an email
POST   /api/emails/{id}/slack-dm     — Manually send Slack DM for an email
GET    /api/team                     — List team members
POST   /api/team                     — Add team member
DELETE /api/team/{id}                — Remove team member
```

## Cron Configuration (vercel.json)

```json
{
  "crons": [
    {
      "path": "/api/cron/triage",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

The cron endpoint iterates through all active team members and runs the pipeline for each.

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google OAuth / Gmail API
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/gmail/callback

# Anthropic
ANTHROPIC_API_KEY=

# Slack
SLACK_BOT_TOKEN=xoxb-...

# Encryption key for stored tokens
TOKEN_ENCRYPTION_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## File Structure

```
email-triage/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Dashboard
│   │   ├── settings/page.tsx           # Team config
│   │   ├── history/page.tsx            # Run history
│   │   └── api/
│   │       ├── auth/gmail/callback/route.ts
│   │       ├── pipeline/
│   │       │   ├── run/route.ts
│   │       │   ├── status/[runId]/route.ts
│   │       │   └── logs/[runId]/route.ts
│   │       ├── emails/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── archive/route.ts
│   │       │       └── slack-dm/route.ts
│   │       ├── team/
│   │       │   ├── route.ts
│   │       │   └── [id]/route.ts
│   │       └── cron/
│   │           └── triage/route.ts
│   ├── lib/
│   │   ├── gmail.ts                    # Gmail API client
│   │   ├── slack.ts                    # Slack API client
│   │   ├── claude.ts                   # Claude classification
│   │   ├── pipeline.ts                 # Core triage pipeline
│   │   ├── logger.ts                   # Pipeline logger
│   │   ├── supabase.ts                 # Supabase client
│   │   └── encryption.ts              # Token encryption/decryption
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── EmailCard.tsx
│   │   ├── ActivityLog.tsx             # Real-time log viewer
│   │   ├── TierStats.tsx
│   │   ├── PipelineControls.tsx
│   │   └── TeamSettings.tsx
│   └── types/
│       └── index.ts
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── vercel.json
├── .env.local
├── package.json
└── tsconfig.json
```

## Implementation Priority

1. **Database schema + Supabase setup** — Run migrations
2. **Gmail OAuth flow** — Get tokens stored and refreshing
3. **Pipeline engine** (`lib/pipeline.ts`, `lib/gmail.ts`, `lib/claude.ts`) — Core logic
4. **Pipeline logger** (`lib/logger.ts`) — Write to `pipeline_logs` table
5. **Dashboard page** — Display classified emails + live activity log
6. **Slack integration** (`lib/slack.ts`) — Send DMs with Block Kit formatting
7. **API routes** — Wire up manual triggers and status endpoints
8. **Settings page** — Team member management + OAuth connect buttons
9. **Cron job** — Automated 15-minute runs
10. **History page** — Past run browser

## Testing Notes

- Start with a single Gmail account (yours) before adding team members
- Use `emailCount: 5` during development to conserve Claude API calls
- The activity log should be functional from day 1 — it's how we validate everything
- Test classification accuracy by running the pipeline and reviewing tier assignments before enabling auto-archive
- Add a "dry run" mode that classifies but doesn't archive or send DMs
