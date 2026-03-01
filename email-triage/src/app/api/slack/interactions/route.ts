import { after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { rsvpToEvent } from '@/lib/calendar';
import type { TeamMember } from '@/types';

export const maxDuration = 30;

export async function POST(req: Request) {
  // Slack sends application/x-www-form-urlencoded with a "payload" field
  const body = await req.text();
  const params = new URLSearchParams(body);
  const raw = params.get('payload');
  if (!raw) {
    return new Response('Missing payload', { status: 400 });
  }

  const payload = JSON.parse(raw);

  // Only handle block_actions (button clicks)
  if (payload.type !== 'block_actions') {
    return new Response('OK', { status: 200 });
  }

  const action = payload.actions?.[0];
  if (!action) return new Response('OK', { status: 200 });

  const actionId: string = action.action_id ?? '';
  const isAccept = actionId.startsWith('calendar_accept_');
  const isDecline = actionId.startsWith('calendar_decline_');

  if (!isAccept && !isDecline) {
    return new Response('OK', { status: 200 });
  }

  // Parse value: "eventId|memberId"
  const [eventId, memberId] = (action.value ?? '').split('|');
  if (!eventId || !memberId) {
    return new Response('OK', { status: 200 });
  }

  const rsvpResponse = isAccept ? 'accepted' as const : 'declined' as const;
  const responseUrl: string | undefined = payload.response_url;

  // Run RSVP work after response using Next.js after() so Vercel keeps the function alive
  after(async () => {
    try {
      const { data: member, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('id', memberId)
        .single();

      if (error || !member) {
        console.error('RSVP: member not found', memberId);
        return;
      }

      await rsvpToEvent(member as TeamMember, eventId, rsvpResponse);

      // Send confirmation via response_url
      if (responseUrl) {
        const emoji = isAccept ? '✅' : '❌';
        const label = isAccept ? 'Accepted' : 'Declined';
        const eventName = (action.text?.text ?? 'event').replace(/^[✓✗] /, '');
        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replace_original: false,
            text: `${emoji} ${label}: ${eventName}`,
          }),
        });
      }
    } catch (err) {
      console.error('RSVP error:', err);
      if (responseUrl) {
        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replace_original: false,
            text: `⚠️ Failed to RSVP: ${err instanceof Error ? err.message : 'Unknown error'}`,
          }),
        }).catch(() => {});
      }
    }
  });

  // Acknowledge immediately (Slack requires response within 3 seconds)
  return new Response('', { status: 200 });
}
