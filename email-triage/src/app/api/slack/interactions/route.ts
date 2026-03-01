import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { rsvpToEvent } from '@/lib/calendar';
import type { TeamMember } from '@/types';

export const maxDuration = 30;

export async function POST(req: Request) {
  const formData = await req.formData();
  const raw = formData.get('payload');
  if (!raw || typeof raw !== 'string') {
    return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
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

  const response = isAccept ? 'accepted' : 'declined';
  const responseUrl: string | undefined = payload.response_url;

  // Acknowledge immediately, then process in background
  // Slack requires a response within 3 seconds
  const ack = new Response('', { status: 200 });

  // Process RSVP async (fire-and-forget, errors logged)
  (async () => {
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

      await rsvpToEvent(member as TeamMember, eventId, response);

      // Send confirmation via response_url
      if (responseUrl) {
        const emoji = isAccept ? '✅' : '❌';
        const label = isAccept ? 'Accepted' : 'Declined';
        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replace_original: false,
            text: `${emoji} ${label}: ${action.text?.text?.replace(/^[✓✗] /, '') ?? 'event'}`,
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
  })();

  return ack;
}
