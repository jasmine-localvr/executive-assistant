import { after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { rsvpToEvent } from '@/lib/calendar';
import type { TeamMember } from '@/types';

export const maxDuration = 30;

/**
 * Modify the original calendar summary message after an RSVP action.
 * - Accept: replace ⏳ with ✅ on the matching bullet line
 * - Decline: remove the matching bullet line entirely
 * - Remove the actions block for this event
 * - Remove the "Needs RSVP" header if no actions blocks remain
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function updateMessageBlocks(blocks: any[], eventId: string, eventTitle: string, isAccept: boolean): any[] {
  // 1. Update the bullet list in the main section block
  const mainSection = blocks.find(
    (b: any) => b.type === 'section' && b.text?.text?.includes('Your Day')
  );
  if (mainSection?.text?.text) {
    const lines: string[] = mainSection.text.text.split('\n');
    const updatedLines = lines.filter((line) => {
      if (!line.includes('⏳')) return true;
      if (!line.includes(eventTitle)) return true;
      if (isAccept) return true;
      return false; // decline: remove line
    }).map((line) => {
      if (isAccept && line.includes('⏳') && line.includes(eventTitle)) {
        return line.replace(' ⏳', ' ✅');
      }
      return line;
    });
    mainSection.text.text = updatedLines.join('\n');
  }

  // 2. Remove the actions block for this event
  let updated = blocks.filter(
    (b: any) => !(b.type === 'actions' && b.block_id === `rsvp_${eventId}`)
  );

  // 3. If no more RSVP actions blocks remain, remove the "Needs RSVP" context header
  const hasMoreRsvp = updated.some(
    (b: any) => b.type === 'actions' && b.block_id?.startsWith('rsvp_')
  );
  if (!hasMoreRsvp) {
    updated = updated.filter(
      (b: any) => !(b.type === 'context' && b.elements?.[0]?.text?.includes('Needs RSVP'))
    );
  }

  return updated;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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

  // Parse value: "eventId|memberId|eventTitle"
  const parts = (action.value ?? '').split('|');
  const eventId = parts[0];
  const memberId = parts[1];
  const eventTitle = parts.slice(2).join('|'); // title may contain |
  if (!eventId || !memberId) {
    return new Response('OK', { status: 200 });
  }

  const rsvpResponse = isAccept ? 'accepted' as const : 'declined' as const;
  const responseUrl: string | undefined = payload.response_url;
  const originalBlocks = payload.message?.blocks;

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

      // Update the original message to reflect the RSVP
      if (responseUrl && originalBlocks) {
        const updatedBlocks = updateMessageBlocks(originalBlocks, eventId, eventTitle, isAccept);
        await fetch(responseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replace_original: true,
            blocks: updatedBlocks,
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
