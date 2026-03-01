import Anthropic from '@anthropic-ai/sdk';
import { WebClient } from '@slack/web-api';
import {
  getActiveOverrideRules,
  upsertOverrideRule,
  deactivateOverrideRule,
} from './override-rules';
import { supabase } from './supabase';
import { runTriagePipeline } from './pipeline';
import type { ParsedOverrideRule, TierOverrideRule } from '@/types';

const anthropic = new Anthropic();

function getSlackClient() {
  return new WebClient(process.env.SLACK_BOT_TOKEN);
}

async function sendSlackMessage(channelId: string, text: string): Promise<void> {
  const client = getSlackClient();
  await client.chat.postMessage({ channel: channelId, text });
}

// ─── Parse Tier Correction with Claude ───

const TIER_NAMES: Record<number, string> = {
  1: 'Tier 1 (Noise)',
  2: 'Tier 2 (Low Priority)',
  3: 'Tier 3 (For Visibility)',
  4: 'Tier 4 (High Priority)',
};

async function parseTierCorrection(
  userMessage: string
): Promise<ParsedOverrideRule[]> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    temperature: 0,
    system: `You parse email triage correction requests into structured rules.

The tier system:
- Tier 1: Noise (auto-archive, never show)
- Tier 2: Low Priority (archive, brief summary)
- Tier 3: For Visibility (keep in inbox, summary list)
- Tier 4: High Priority (keep in inbox, full summary + draft reply)

Extract one or more rules from the user's message. Return ONLY valid JSON, no markdown:
[
  {
    "match_type": "sender" | "domain" | "subject" | "keyword",
    "match_value": "the pattern to match (lowercase)",
    "forced_tier": 1 | 2 | 3 | 4,
    "description": "human-readable summary of the rule"
  }
]

Guidelines for match_type:
- "sender": matches against the From name or email (e.g. "roku", "noreply@roku.com")
- "domain": matches against the sender's email domain (e.g. "roku.com", "netsuite.com")
- "subject": matches against the email subject line (e.g. "SANDBOX", "bank data import")
- "keyword": matches against any part of the email — from, subject, or body (e.g. "roku")

Choose the most specific match_type that captures the user's intent. Prefer "sender" or "domain" over "keyword" when the user references a specific sender. Use "keyword" as a catch-all when the user is vague.

If the message is not a tier correction (e.g. a question, greeting, or unrelated message), return an empty array [].`,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '[]';
  const cleaned = text.replace(/```json?|```/g, '').trim();
  return JSON.parse(cleaned) as ParsedOverrideRule[];
}

// ─── Handle Tier Correction ───

export async function handleTierCorrection(
  channelId: string,
  memberId: string,
  messageText: string
): Promise<void> {
  const rules = await parseTierCorrection(messageText);

  if (rules.length === 0) {
    await sendSlackMessage(
      channelId,
      "I wasn't sure what to do with that. You can tell me things like:\n" +
        '\u2022 "Roku emails \u2192 Tier 1"\n' +
        '\u2022 "move NetSuite alerts to low priority"\n' +
        '\u2022 "anything from @notifications.slack.com should be noise"\n\n' +
        'Or type *show rules* to see your current overrides.'
    );
    return;
  }

  const confirmLines: string[] = [];

  for (const rule of rules) {
    await upsertOverrideRule(memberId, rule, messageText);

    const matchDesc =
      rule.match_type === 'sender'
        ? `emails from "${rule.match_value}"`
        : rule.match_type === 'domain'
          ? `emails from *@${rule.match_value}`
          : rule.match_type === 'subject'
            ? `emails with "${rule.match_value}" in subject`
            : `emails matching "${rule.match_value}"`;

    confirmLines.push(
      `\u2713 ${matchDesc} \u2192 always *${TIER_NAMES[rule.forced_tier]}*`
    );
  }

  await sendSlackMessage(
    channelId,
    "Got it! I've updated your rules:\n\n" +
      confirmLines.join('\n') +
      '\n\nThese apply to your inbox only. Type *show rules* to see all your overrides, or *delete rule [number]* to remove one.'
  );
}

// ─── Show Rules ───

export async function handleShowRules(
  channelId: string,
  memberId: string
): Promise<void> {
  const rules = await getActiveOverrideRules(memberId);

  if (rules.length === 0) {
    await sendSlackMessage(
      channelId,
      'You don\'t have any override rules yet. Reply to any digest with a correction like "Roku emails \u2192 Tier 1" to create one.'
    );
    return;
  }

  const lines = rules.map((r: TierOverrideRule, i: number) => {
    const matchDesc =
      r.match_type === 'sender'
        ? `from "${r.match_value}"`
        : r.match_type === 'domain'
          ? `from *@${r.match_value}`
          : r.match_type === 'subject'
            ? `subject contains "${r.match_value}"`
            : `matches "${r.match_value}"`;
    return `${i + 1}. ${matchDesc} \u2192 *${TIER_NAMES[r.forced_tier]}*`;
  });

  await sendSlackMessage(
    channelId,
    `*Your Override Rules (${rules.length}):*\n\n${lines.join('\n')}\n\nTo remove a rule, type *delete rule [number]*.`
  );
}

// ─── Delete Rule ───

export async function handleDeleteRule(
  channelId: string,
  memberId: string,
  messageText: string
): Promise<void> {
  const match = messageText.match(/delete rule #?(\d+)/i);
  if (!match) {
    await sendSlackMessage(
      channelId,
      'To delete a rule, type *delete rule [number]*. Type *show rules* to see your rules with their numbers.'
    );
    return;
  }

  const ruleIndex = parseInt(match[1]) - 1;
  const rules = await getActiveOverrideRules(memberId);

  if (ruleIndex < 0 || ruleIndex >= rules.length) {
    await sendSlackMessage(
      channelId,
      `Rule number ${ruleIndex + 1} doesn't exist. Type *show rules* to see your current rules.`
    );
    return;
  }

  await deactivateOverrideRule(rules[ruleIndex].id);
  await sendSlackMessage(
    channelId,
    `\u2713 Rule ${ruleIndex + 1} deleted. Type *show rules* to see your remaining rules.`
  );
}

// ─── Triage Now (on-demand pipeline run) ───

export async function handleTriageNow(
  channelId: string,
  memberId: string
): Promise<void> {
  // Prevent overlapping runs
  const { data: running } = await supabase
    .from('triage_runs')
    .select('id')
    .eq('team_member_id', memberId)
    .eq('status', 'running')
    .limit(1);

  if (running && running.length > 0) {
    await sendSlackMessage(
      channelId,
      'A triage is already running for your inbox. Hang tight — you\'ll get a summary when it\'s done.'
    );
    return;
  }

  try {
    const result = await runTriagePipeline(memberId, {
      emailCount: 50,
      skipDigest: false,
    });

    if (result.emailsClassified === 0) {
      await sendSlackMessage(
        channelId,
        'All caught up — no new emails to triage.'
      );
    } else {
      const parts: string[] = [];
      parts.push(`${result.emailsClassified} emails classified`);
      if (result.archivedCount > 0) parts.push(`${result.archivedCount} archived`);
      if (result.draftsCreated > 0) parts.push(`${result.draftsCreated} drafts created`);
      await sendSlackMessage(channelId, `Done — ${parts.join(', ')}.`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Slack triage-now failed for member ${memberId}:`, msg);
    await sendSlackMessage(
      channelId,
      `Something went wrong: ${msg}`
    );
  }
}
