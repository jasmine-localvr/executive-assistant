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

NEEDS_REPLY RULES — set needs_reply to true ONLY when a human reply is clearly expected:
- Someone asked a direct question or made a request
- A conversation thread where the exec is expected to respond
- A partner, client, or colleague waiting on a response
Set needs_reply to FALSE for:
- Transactional notices (payment receipts, billing alerts, failed charges)
- System alerts (login failures, security warnings, deployment notices)
- Automated notifications (device setup, form submissions, health alerts)
- Anything where no human is waiting for a response

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

const DRAFT_REPLY_PROMPT = `You are drafting an email reply on behalf of a vacation rental property management executive at LocalVR.

Write a professional, complete reply that:
- Directly addresses the sender's question or request
- Is warm but efficient
- Includes a proper greeting and sign-off
- Includes concrete next steps where appropriate
- Is ready to send with minimal editing
- Do NOT include an email signature block (name, title, phone number, company info, etc.) — the user's email client handles signatures automatically

{STYLE_GUIDE}

Return ONLY the email body text. No JSON, no subject line, no metadata. Start with the greeting.`;

function buildDraftSystemPrompt(emailStyle?: string | null): string {
  const styleSection = emailStyle
    ? `Write a reply matching this person's email style:\n\n${emailStyle}`
    : 'Use a professional, friendly tone.';

  return DRAFT_REPLY_PROMPT.replace('{STYLE_GUIDE}', styleSection);
}

export async function generateDraftReply(
  email: GmailMessage,
  classification: ClassificationResult,
  emailStyle?: string | null
): Promise<string> {
  const systemPrompt = buildDraftSystemPrompt(emailStyle);

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
