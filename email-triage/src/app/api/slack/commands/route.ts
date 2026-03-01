import { after } from 'next/server';
import { getTeamMemberBySlackId } from '@/lib/override-rules';
import { handleTriageNow } from '@/lib/slack-feedback';
import { WebClient } from '@slack/web-api';

export const maxDuration = 300; // 5 minutes — pipeline classifies many emails

function getSlackClient() {
  return new WebClient(process.env.SLACK_BOT_TOKEN);
}

/**
 * Slack slash command handler.
 *
 * Slack sends POST with application/x-www-form-urlencoded body containing:
 *   command, text, user_id, channel_id, response_url, trigger_id
 *
 * Must respond within 3 seconds — pipeline runs in background via after().
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const command = (form.get('command') as string) ?? '';
  const userSlackId = (form.get('user_id') as string) ?? '';

  if (command !== '/triage') {
    return new Response('Unknown command', { status: 200 });
  }

  const member = await getTeamMemberBySlackId(userSlackId);
  if (!member) {
    return new Response(
      "I don't recognize your account. Ask an admin to link your Slack ID in the settings page.",
      { status: 200 }
    );
  }

  // Open a DM channel to send results to
  const slack = getSlackClient();
  const dm = await slack.conversations.open({ users: userSlackId });
  const channelId = dm.channel?.id;

  if (!channelId) {
    return new Response('Could not open a DM channel.', { status: 200 });
  }

  after(async () => {
    await handleTriageNow(channelId, member.id);
  });

  return new Response('Got it! Triaging your inbox now... You\'ll get a DM with the results.', {
    status: 200,
  });
}
