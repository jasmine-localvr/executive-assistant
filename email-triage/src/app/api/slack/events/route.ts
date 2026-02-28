import { NextResponse } from 'next/server';
import { getTeamMemberBySlackId } from '@/lib/override-rules';
import {
  handleTierCorrection,
  handleShowRules,
  handleDeleteRule,
} from '@/lib/slack-feedback';
import { WebClient } from '@slack/web-api';

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

  // Parse the correction with Claude
  await handleTierCorrection(channelId, member.id, messageText);

  return new Response('OK', { status: 200 });
}
