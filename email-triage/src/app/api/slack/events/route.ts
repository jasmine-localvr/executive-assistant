import { NextResponse, after } from 'next/server';
import { getTeamMemberBySlackId } from '@/lib/override-rules';
import {
  handleShowRules,
  handleDeleteRule,
  handleTriageNow,
  handleCalendarPrep,
} from '@/lib/slack-feedback';
import { runAgent } from '@/lib/agent';
import { supabase } from '@/lib/supabase';
import { WebClient } from '@slack/web-api';
import type Anthropic from '@anthropic-ai/sdk';
import type { TeamMember } from '@/types';

export const maxDuration = 300; // 5 minutes — agent + pipeline runs in after()

function getSlackClient() {
  return new WebClient(process.env.SLACK_BOT_TOKEN);
}

async function sendSlackMessage(channelId: string, text: string): Promise<void> {
  const client = getSlackClient();
  await client.chat.postMessage({ channel: channelId, text });
}

/** Load the full team member record (needed by the agent for OAuth tokens, etc.) */
async function getFullMember(memberId: string): Promise<TeamMember | null> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('id', memberId)
    .single();

  if (error || !data) return null;
  return data as TeamMember;
}

/** Load or create a Slack conversation for persistent context across DMs. */
async function getSlackConversation(
  memberId: string
): Promise<{ id: string; messages: Anthropic.MessageParam[] }> {
  // Look for the most recent Slack conversation (title starts with "[slack]")
  const { data: existing } = await supabase
    .from('agent_conversations')
    .select('id, messages')
    .eq('team_member_id', memberId)
    .like('title', '[slack]%')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return {
      id: existing.id,
      messages: (existing.messages ?? []) as Anthropic.MessageParam[],
    };
  }

  // Create a new Slack conversation
  const { data: newConv } = await supabase
    .from('agent_conversations')
    .insert({
      team_member_id: memberId,
      title: '[slack] EA conversation',
      messages: [],
      message_count: 0,
    })
    .select('id')
    .single();

  return { id: newConv?.id ?? '', messages: [] };
}

/** Keep only the last N message pairs to avoid unbounded context growth. */
function trimHistory(
  messages: Anthropic.MessageParam[],
  maxPairs: number = 20
): Anthropic.MessageParam[] {
  // Each user+assistant exchange is roughly 2 entries, but tool rounds add more.
  // Keep the last maxPairs * 2 entries.
  const maxEntries = maxPairs * 2;
  if (messages.length <= maxEntries) return messages;
  return messages.slice(-maxEntries);
}

/** Run the agent and send its response back to the Slack DM. */
async function handleAgentMessage(
  channelId: string,
  memberId: string,
  messageText: string
): Promise<void> {
  const member = await getFullMember(memberId);
  if (!member) {
    await sendSlackMessage(channelId, 'Could not load your account. Please try again.');
    return;
  }

  try {
    // Load conversation history for context continuity
    const conv = await getSlackConversation(memberId);
    const history = trimHistory(conv.messages);

    const result = await runAgent(member, history, messageText);

    // Save updated conversation
    await supabase
      .from('agent_conversations')
      .update({
        messages: trimHistory(result.messages),
        message_count: result.messages.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id);

    if (result.response) {
      await sendSlackMessage(channelId, result.response);
    } else {
      await sendSlackMessage(channelId, "I processed your request but didn't have anything to say back.");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Agent] Slack handler error for member ${memberId}:`, msg);
    await sendSlackMessage(
      channelId,
      `Something went wrong: ${msg}`
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json();

  // Handle Slack URL verification challenge
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Only process DM messages to the bot
  if (body.event?.type !== 'message' || body.event?.channel_type !== 'im') {
    return new Response('OK', { status: 200 });
  }

  // Ignore bot's own messages to prevent loops
  if (body.event?.bot_id || body.event?.subtype === 'bot_message') {
    return new Response('OK', { status: 200 });
  }

  // Ignore message edits and other subtypes
  if (body.event?.subtype) {
    return new Response('OK', { status: 200 });
  }

  const userSlackId: string = body.event.user;
  const messageText: string = body.event.text ?? '';
  const channelId: string = body.event.channel;

  // Look up the team member by Slack ID
  const member = await getTeamMemberBySlackId(userSlackId);
  if (!member) {
    await sendSlackMessage(
      channelId,
      "I don't recognize your account. Ask an admin to link your Slack ID in the settings page."
    );
    return new Response('OK', { status: 200 });
  }

  const trimmed = messageText.toLowerCase().trim();

  // ── Fast-path commands (no agent needed) ──

  if (trimmed === 'show rules') {
    await handleShowRules(channelId, member.id);
    return new Response('OK', { status: 200 });
  }

  if (trimmed.startsWith('delete rule')) {
    await handleDeleteRule(channelId, member.id, messageText);
    return new Response('OK', { status: 200 });
  }

  if (trimmed === 'triage' || trimmed === 'triage now' || trimmed === 'check inbox') {
    await sendSlackMessage(channelId, 'Got it! Triaging your inbox now...');
    after(async () => {
      await handleTriageNow(channelId, member.id);
    });
    return new Response('OK', { status: 200 });
  }

  if (trimmed === 'help') {
    await sendSlackMessage(
      channelId,
      '*I\'m your EA — just ask me anything!*\n\n' +
        'Some things I can do:\n' +
        '\u2022 Check your calendar — "what\'s on my schedule today?" or "what does my week look like?"\n' +
        '\u2022 Search email — "find the invoice from Acme"\n' +
        '\u2022 Draft & send emails — "draft a reply to Sarah about the Q2 report"\n' +
        '\u2022 Book appointments — "book my annual physical with Dr. Kim"\n' +
        '\u2022 Manage contacts — "add Dr. Sarah Kim as my doctor"\n' +
        '\u2022 Set reminders — "remind me to call John tomorrow at 2pm"\n' +
        '\u2022 Manage todos — "what\'s on my todo list?" or "prioritize my tasks"\n' +
        '\u2022 Send Slack messages — "message #general that the meeting is moved"\n' +
        '\u2022 Find free time — "when am I free this afternoon?"\n\n' +
        '*Quick commands:*\n' +
        '\u2022 *triage* — Run inbox triage now\n' +
        '\u2022 *show rules* / *delete rule [#]* — Manage tier overrides\n\n' +
        'Or just tell me what you need in plain English.'
    );
    return new Response('OK', { status: 200 });
  }

  // ── Everything else goes to the agent ──
  // Respond immediately so Slack doesn't timeout, then run agent in background.
  after(async () => {
    await handleAgentMessage(channelId, member.id, messageText);
  });

  return new Response('OK', { status: 200 });
}
