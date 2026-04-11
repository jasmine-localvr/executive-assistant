import { after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { runAgent } from '@/lib/agent';
import { sendSmsReply } from '@/lib/sms';
import type Anthropic from '@anthropic-ai/sdk';
import type { TeamMember } from '@/types';

export const maxDuration = 300; // agent may need time for tool calls

/** Look up team member by their registered phone number. */
async function getMemberByPhone(
  phone: string
): Promise<TeamMember | null> {
  // Normalize: strip spaces/dashes, keep +country code
  const normalized = phone.replace(/[\s\-()]/g, '');

  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('sms_phone_number', normalized)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return data as TeamMember;
}

/** Load or create an SMS conversation for persistent context. */
async function getSmsConversation(
  memberId: string
): Promise<{ id: string; messages: Anthropic.MessageParam[] }> {
  const { data: existing } = await supabase
    .from('agent_conversations')
    .select('id, messages')
    .eq('team_member_id', memberId)
    .eq('channel', 'sms')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return {
      id: existing.id,
      messages: (existing.messages ?? []) as Anthropic.MessageParam[],
    };
  }

  const { data: newConv } = await supabase
    .from('agent_conversations')
    .insert({
      team_member_id: memberId,
      title: '[sms] EA conversation',
      messages: [],
      message_count: 0,
      channel: 'sms',
    })
    .select('id')
    .single();

  return { id: newConv?.id ?? '', messages: [] };
}

/** Keep conversation history bounded. */
function trimHistory(
  messages: Anthropic.MessageParam[],
  maxPairs: number = 20
): Anthropic.MessageParam[] {
  const maxEntries = maxPairs * 2;
  if (messages.length <= maxEntries) return messages;
  return messages.slice(-maxEntries);
}

/** Process the inbound SMS through the agent and reply via Twilio. */
async function handleSmsMessage(
  member: TeamMember,
  messageText: string
): Promise<void> {
  try {
    const conv = await getSmsConversation(member.id);
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

    const reply =
      result.response || "Done — I processed your request but didn't have anything to add.";

    await sendSmsReply(member.sms_phone_number!, reply);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SMS] Agent error for member ${member.id}:`, msg);
    await sendSmsReply(
      member.sms_phone_number!,
      `Something went wrong: ${msg}`
    );
  }
}

/**
 * Twilio webhook for inbound SMS.
 * Responds with 200 immediately, then processes asynchronously via after().
 *
 * Configure your Twilio phone number's "A message comes in" webhook to:
 *   POST https://your-domain.com/api/sms/webhook
 */
export async function POST(req: Request) {
  // Twilio sends form-encoded POST data
  const formData = await req.formData();
  const from = (formData.get('From') as string) ?? '';
  const body = (formData.get('Body') as string) ?? '';

  if (!from || !body.trim()) {
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    );
  }

  const member = await getMemberByPhone(from);
  if (!member) {
    // Unknown number — don't reply (avoids charges to random senders)
    console.warn(`[SMS] Inbound from unrecognized number: ${from}`);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    );
  }

  // Respond to Twilio immediately, process in background
  after(async () => {
    try {
      await handleSmsMessage(member, body.trim());
    } catch (err) {
      console.error('[SMS] Unhandled error in after():', err instanceof Error ? err.message : String(err));
    }
  });

  // Also send an immediate TwiML reply as a fallback test
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>EA received: "${body.trim().slice(0, 40)}"</Message></Response>`,
    { status: 200, headers: { 'Content-Type': 'text/xml' } }
  );
}
