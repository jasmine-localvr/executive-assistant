import { WebClient } from '@slack/web-api';
import type { ClassifiedEmail } from '@/types';

function getClient() {
  return new WebClient(process.env.SLACK_BOT_TOKEN);
}

// ─── Tier Helpers ───

function tierEmoji(tier: number): string {
  switch (tier) {
    case 4: return '🔴';
    case 3: return '👀';
    case 2: return '🟡';
    default: return '⚪';
  }
}

function tierLabel(tier: number): string {
  switch (tier) {
    case 4: return 'High Priority';
    case 3: return 'For Visibility';
    case 2: return 'Low Priority';
    default: return 'Noise';
  }
}

// ─── Single-Email DM (manual UI button) ───

export async function sendSlackDM(
  slackUserId: string,
  email: ClassifiedEmail
): Promise<void> {
  const client = getClient();

  const conversation = await client.conversations.open({
    users: slackUserId,
  });
  const channelId = conversation.channel?.id;
  if (!channelId) throw new Error('Failed to open DM channel');

  const receivedDate = email.received_at
    ? new Date(email.received_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Unknown date';

  const blocks = [
    {
      type: 'header' as const,
      text: {
        type: 'plain_text' as const,
        text: `${tierEmoji(email.tier)} ${tierLabel(email.tier)} Email`,
      },
    },
    {
      type: 'section' as const,
      fields: [
        { type: 'mrkdwn' as const, text: `*From:*\n${email.from_address ?? 'Unknown'}` },
        { type: 'mrkdwn' as const, text: `*Date:*\n${receivedDate}` },
      ],
    },
    {
      type: 'section' as const,
      text: { type: 'mrkdwn' as const, text: `*Subject:* ${email.subject ?? '(no subject)'}` },
    },
    {
      type: 'section' as const,
      text: { type: 'mrkdwn' as const, text: `*Summary:* ${email.summary}` },
    },
    {
      type: 'section' as const,
      fields: [
        { type: 'mrkdwn' as const, text: `*Suggested Action:*\n${email.suggested_action ?? 'None'}` },
        { type: 'mrkdwn' as const, text: `*Assign To:*\n${email.suggested_assignee ?? 'N/A'}` },
      ],
    },
    { type: 'divider' as const },
  ];

  await client.chat.postMessage({
    channel: channelId,
    text: `${tierEmoji(email.tier)} ${email.subject ?? 'Email'} — ${email.summary}`,
    blocks,
  });
}

// ─── Consolidated Triage Digest ───

interface DigestStats {
  totalClassified: number;
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  tier4Count: number;
  archivedCount: number;
  draftsCreated: number;
}

/** Extract display name from "Name <email>" or return the raw string */
function senderName(from: string | null): string {
  if (!from) return 'Unknown';
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  // No angle brackets — return part before @
  const atIdx = from.indexOf('@');
  return atIdx > 0 ? from.slice(0, atIdx) : from;
}

export async function sendTriageDigest(
  slackUserId: string,
  emails: ClassifiedEmail[],
  stats: DigestStats
): Promise<void> {
  const client = getClient();

  const conversation = await client.conversations.open({
    users: slackUserId,
  });
  const channelId = conversation.channel?.id;
  if (!channelId) throw new Error('Failed to open DM channel');

  const tier4Emails = emails.filter((e) => e.tier === 4);
  const tier3Emails = emails.filter((e) => e.tier === 3);
  const tier2Emails = emails.filter((e) => e.tier === 2);

  if (tier4Emails.length === 0 && tier3Emails.length === 0 && tier2Emails.length === 0) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [];

  // ── Title ──
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `📬 *Inbox Triage* — ${stats.totalClassified} emails` },
  });

  // ── Tier 4: High Priority — numbered, full detail ──
  if (tier4Emails.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `🔴 *High Priority — Left Unread (${tier4Emails.length})*` },
    });

    for (let i = 0; i < tier4Emails.length; i++) {
      const e = tier4Emails[i];
      const from = senderName(e.from_address);
      const subject = e.subject ?? '(no subject)';
      const summary = e.summary_oneline ?? e.summary;
      const draft = e.draft_created ? '\n📝 Draft reply created' : '';
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${i + 1}. ${subject}*\nFrom: ${from}\n${summary}${draft}` },
      });
    }
  }

  // ── Tier 3: For Visibility — bullet, subject + from + summary ──
  if (tier3Emails.length > 0) {
    const lines = tier3Emails.map((e) => {
      const from = senderName(e.from_address);
      const subject = e.subject ?? '(no subject)';
      const summary = e.summary_oneline ?? e.summary;
      return `• *${subject}* from ${from} — ${summary}`;
    }).join('\n');

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `👀 *For Visibility — Left Unread (${tier3Emails.length})*\n${lines}` },
    });
  }

  // ── Tier 2: Low Priority — per-email one-liners ──
  if (tier2Emails.length > 0) {
    const lines = tier2Emails.map((e) => {
      return `• ${e.summary_oneline ?? e.summary}`;
    }).join('\n');

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `🟡 *Low Priority — Archived (${tier2Emails.length})*\n${lines}` },
    });
  }

  // ── Footer ──
  const now = new Date().toLocaleString('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const footerParts = [now + ' MST'];
  if (stats.archivedCount > 0) footerParts.push(`${stats.archivedCount} archived`);
  if (stats.draftsCreated > 0) footerParts.push(`${stats.draftsCreated} drafts`);
  if (stats.tier1Count > 0) footerParts.push(`${stats.tier1Count} noise filtered`);

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: footerParts.join(' · ') }],
  });

  // Truncate if over Slack's 50-block limit
  const maxBlocks = 50;
  const finalBlocks = blocks.length > maxBlocks
    ? [
        ...blocks.slice(0, maxBlocks - 1),
        { type: 'context', elements: [{ type: 'mrkdwn', text: '_…see dashboard for full details_' }] },
      ]
    : blocks;

  const fallback = `Inbox triage: ${tier4Emails.length} high priority, ${tier3Emails.length} for visibility, ${tier2Emails.length} low priority`;

  await client.chat.postMessage({
    channel: channelId,
    text: fallback,
    blocks: finalBlocks,
  });
}
