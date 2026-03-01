import Anthropic from '@anthropic-ai/sdk';
import type { GmailMessage, ClassificationResult } from '@/types';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an email triage assistant for LocalVR, a vacation rental property management company managing 533+ properties across Telluride, Park City, Lake Tahoe, Breckenridge, 30A Florida, and other markets.

CRITICAL RULE: Any email where the sender address ends in @golocalvr.com MUST be classified as Tier 4, regardless of content.

Classify each email into exactly ONE tier:

TIER 1 - NOISE (auto-archive, mark read):
- Marketing newsletters, vendor promos, SaaS product updates
- Automated notifications (social media, app alerts, subscription receipts)
- Cold outreach / sales pitches
- Bulk promotional emails

TIER 2 - LOW PRIORITY (archive, mark read):
- FYI-only CCs, internal tool notifications
- Non-urgent vendor updates, routine confirmations
- Industry newsletters with genuinely useful content
- Informational updates that don't require action

TIER 3 - FOR VISIBILITY (keep in inbox, keep unread):
- Worth being aware of but rarely needs action
- Not time-sensitive
- Business updates, non-urgent client comms, team status updates
- Industry changes, permit/compliance reminders
- User scans these to stay informed

TIER 4 - HIGH PRIORITY (keep in inbox, keep unread):
- Any email from an @golocalvr.com address (ALWAYS Tier 4)
- External emails with clear active business, strategic, or project topics
- Property owner communications, guest escalations
- Financial, legal, or compliance matters
- Partnership or contract discussions
- Direct requests requiring executive attention

NEEDS_REPLY RULES — set needs_reply to true ONLY when ALL of these are true:
1. A specific human (not a system) sent the email and is waiting for a response
2. There is a clear, explicit question or request directed at the recipient
3. Failing to reply would leave that person without an answer they need

Set needs_reply to FALSE for (ALWAYS false, no exceptions):
- Any sender address containing "noreply", "no-reply", "notifications", "alerts", "system", "mailer-daemon"
- Calendar invitations (subject starts with "Invitation:", "Updated Invitation:", "Canceled:", or contains .ics attachments) — accept/decline via calendar UI, not email
- Payment/billing notices (failed charges, receipts, balance updates, subscription changes)
- System/platform alerts (import failures, deployment notices, security warnings, health alerts)
- Automated notifications (form submissions, device setup, usage reports, threshold alerts)
- FYI/informational emails where no one is waiting for your response
- Internal tool notifications (NetSuite, Rippling, Mercury, Google Workspace, etc.)
- Emails that describe a problem but don't ask YOU to reply (e.g. "your payment failed" — you fix it in a dashboard, not by replying)

Respond ONLY with valid JSON, no markdown fences:
{
  "tier": 1 | 2 | 3 | 4,
  "label": "short label for Gmail (2-4 words)",
  "summary": "2-3 sentence summary of the email",
  "summary_oneline": "single sentence, max 100 chars, for Slack digest",
  "priority_reason": "why this tier was assigned",
  "suggested_action": "what the exec should do, if anything",
  "suggested_assignee": "who on the team should handle this, or null",
  "needs_reply": true | false,
  "draft_reply": "rough draft reply if needs_reply is true, else null"
}`;

// ─── Email Style Analysis ───

const STYLE_ANALYSIS_PROMPT = `Analyze the sent emails below and produce a concise email style guide that an AI assistant will use to draft replies matching this person's voice.

Output ONLY these sections in this exact format. Be specific — use actual phrases and patterns from their emails, not generic descriptions. Keep total output under 100 words.

GREETINGS: How they open emails. List the 2-3 most common patterns with examples.
CLOSINGS: How they sign off (e.g. "Thanks," "Best,"). Do NOT include email signature blocks (name, title, phone, logo, etc.).
TONE: 1-2 sentences max. Focus on what makes their voice distinctive.
LENGTH: Typical email length and structure preference (bullets vs prose, short vs detailed).
QUIRKS: Distinctive patterns — repeated phrases, punctuation habits, specific words they favor.

Do NOT include generic observations like "professional but accessible" or "clear communicator." Only include patterns specific enough to reproduce their writing style.`;

export async function analyzeEmailStyle(
  emails: { subject: string; to?: string; body: string }[]
): Promise<string> {
  const emailTexts = emails
    .map(
      (e, i) =>
        `--- Email ${i + 1} (To: ${e.to ?? 'unknown'}, Subject: ${e.subject}) ---\n${e.body}`
    )
    .join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    temperature: 0.3,
    system: STYLE_ANALYSIS_PROMPT,
    messages: [{ role: 'user', content: emailTexts }],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';

  return text.trim();
}

// ─── Email Classification ───

export async function classifyEmail(
  email: GmailMessage
): Promise<ClassificationResult> {
  const userMessage = `From: ${email.from}
Subject: ${email.subject}
Date: ${email.receivedAt}

${email.body}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';

  // Strip markdown fences if present
  const cleaned = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
  const parsed: ClassificationResult = JSON.parse(cleaned);

  // Validate tier value
  if (![1, 2, 3, 4].includes(parsed.tier)) {
    throw new Error(`Invalid tier value: ${parsed.tier}`);
  }

  // HARD RULE: @golocalvr.com senders are always Tier 4
  const senderEmail = email.from.match(/<([^>]+)>/)?.[1] ?? email.from;
  if (senderEmail.toLowerCase().endsWith('@golocalvr.com') && parsed.tier !== 4) {
    parsed.tier = 4;
    parsed.priority_reason = `Overridden to Tier 4: sender is @golocalvr.com. ${parsed.priority_reason}`;
  }

  // Ensure new fields have defaults
  parsed.summary_oneline = parsed.summary_oneline ?? parsed.summary.slice(0, 100);
  parsed.needs_reply = parsed.needs_reply ?? false;
  parsed.draft_reply = parsed.draft_reply ?? null;

  return parsed;
}

// ─── Draft Reply Generation ───

const DRAFT_REPLY_PROMPT = `You are drafting an email reply on behalf of {USER_NAME}, a vacation rental property management executive at LocalVR.

Write a professional, complete reply that:
- Directly addresses the sender's question or request
- Is warm but efficient
- Includes concrete next steps where appropriate
- Is ready to send with minimal editing

SIGNATURE RULES (CRITICAL — follow exactly):
- End the email with ONLY the closing phrase from the style guide (e.g. "Best,")
- Do NOT add anything after the closing — no name, no title, no phone, no company, no links
- The user's email client adds their signature automatically
- If you add a name or signature block, the email will have a duplicate signature

{STYLE_GUIDE}

Return ONLY the email body text. No JSON, no subject line, no metadata. Start with the greeting.`;

function buildDraftSystemPrompt(userName: string, emailStyle?: string | null): string {
  const styleSection = emailStyle
    ? `Write a reply matching this person's email style:\n\n${emailStyle}`
    : 'Use a professional, friendly tone.';

  return DRAFT_REPLY_PROMPT
    .replace('{USER_NAME}', userName)
    .replace('{STYLE_GUIDE}', styleSection);
}

export async function generateDraftReply(
  email: GmailMessage,
  classification: ClassificationResult,
  emailStyle?: string | null,
  userName?: string | null
): Promise<string> {
  const systemPrompt = buildDraftSystemPrompt(userName ?? 'the executive', emailStyle);

  const userMessage = `Original email to reply to:
From: ${email.from}
Subject: ${email.subject}
Date: ${email.receivedAt}

${email.body}

---
Classification summary: ${classification.summary}
Suggested action: ${classification.suggested_action ?? 'Reply appropriately'}
Rough draft idea: ${classification.draft_reply ?? 'No rough draft provided'}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';

  return text.trim();
}
