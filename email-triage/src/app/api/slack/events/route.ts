import { NextResponse, after } from 'next/server';
import { getTeamMemberBySlackId } from '@/lib/override-rules';
import {
  handleTierCorrection,
  handleShowRules,
  handleDeleteRule,
  handleTriageNow,
  handleCalendarPrep,
} from '@/lib/slack-feedback';
import { WebClient } from '@slack/web-api';

export const maxDuration = 300; // 5 minutes — triage pipeline runs in after()

function getSlackClient() {
  return new WebClient(process.env.SLACK_BOT_TOKEN);
}

async function sendSlackMessage(channelId: string, text: string): Promise<void> {
  const client = getSlackClient();
  await client.chat.postMessage({ channel: channelId, text });
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

  // Handle special commands
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

  if (trimmed === 'prep' || trimmed.startsWith('prep ') ||
      trimmed === 'calendar' || trimmed.startsWith('calendar ') ||
      trimmed === 'agenda' || trimmed.startsWith('agenda ')) {
    const dateText = trimmed.replace(/^(prep|calendar|agenda)\s*/, '').trim();
    await handleCalendarPrep(channelId, member.id, userSlackId, dateText);
    return new Response('OK', { status: 200 });
  }

  if (trimmed === 'help') {
    await sendSlackMessage(
      channelId,
      '*Available commands:*\n\n' +
        '\u2022 *triage* — Run inbox triage now (classify, archive, draft replies, send summary)\n' +
        '\u2022 *prep [day]* — Get your calendar for today, tomorrow, Monday, next Friday, etc.\n' +
        '\u2022 *show rules* — List your tier override rules\n' +
        '\u2022 *delete rule [number]* — Remove an override rule\n' +
        '\u2022 *help* — Show this message\n\n' +
        'You can also send tier corrections like "Roku emails \u2192 Tier 1" and I\'ll create a rule for you.'
    );
    return new Response('OK', { status: 200 });
  }

  // Parse the correction with Claude
  await handleTierCorrection(channelId, member.id, messageText);

  return new Response('OK', { status: 200 });
}
