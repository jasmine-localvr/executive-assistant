import { supabase } from './supabase';
import {
  fetchEaInboxEmails,
  sendEaReply,
  markEaMessageRead,
} from './ea-gmail';
import { generateEaReply } from './ea-claude';
import type { EaInboxMessage, EaProcessResult, TeamMember } from '@/types';

const EA_EMAIL = 'ea@golocalvr.com';

/** Extract email address from a "Name <email>" or bare "email" string. */
function extractEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

/** Extract display name from "Name <email>" or return the email. */
function extractName(raw: string): string {
  const match = raw.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : extractEmail(raw);
}

/** Parse a comma-separated address list into individual address strings. */
function parseAddressList(header: string): string[] {
  if (!header.trim()) return [];
  return header.split(',').map((a) => a.trim()).filter(Boolean);
}

/** Check if all participants are @golocalvr.com (internal-only). */
function isInternalOnly(from: string, to: string, cc: string): boolean {
  const all = [from, ...parseAddressList(to), ...parseAddressList(cc)];
  return all.every((addr) => extractEmail(addr).endsWith('@golocalvr.com'));
}

/** Find the @golocalvr.com user on the thread (excluding ea@). */
function findLocalvrUser(
  from: string,
  to: string,
  cc: string
): string | null {
  // Check From first — if the sender is a LocalVR user, they're the one who CC'd ea@
  const fromEmail = extractEmail(from);
  if (
    fromEmail.endsWith('@golocalvr.com') &&
    fromEmail !== EA_EMAIL
  ) {
    return fromEmail;
  }

  // Check To and CC for any @golocalvr.com address
  const allRecipients = [...parseAddressList(to), ...parseAddressList(cc)];
  for (const addr of allRecipients) {
    const email = extractEmail(addr);
    if (email.endsWith('@golocalvr.com') && email !== EA_EMAIL) {
      return email;
    }
  }

  return null;
}

/** Find the external sender (non-golocalvr.com). */
function findExternalSender(
  from: string,
  to: string,
  cc: string
): { email: string; name: string; raw: string } | null {
  // The From is most likely the external sender
  const fromEmail = extractEmail(from);
  if (!fromEmail.endsWith('@golocalvr.com')) {
    return { email: fromEmail, name: extractName(from), raw: from };
  }

  // If From is internal, look for external in To/CC
  const allRecipients = [...parseAddressList(to), ...parseAddressList(cc)];
  for (const addr of allRecipients) {
    const email = extractEmail(addr);
    if (!email.endsWith('@golocalvr.com')) {
      return { email, name: extractName(addr), raw: addr };
    }
  }

  return null;
}

/**
 * Core EA inbox processor. Called by both the webhook and poll routes.
 * Fetches unread messages from ea@golocalvr.com, matches to enrolled users,
 * generates Claude replies, and sends them.
 */
export async function processEaInbox(): Promise<EaProcessResult> {
  const result: EaProcessResult = {
    messagesFound: 0,
    repliesSent: 0,
    errors: 0,
    skipped: 0,
  };

  // Step 1: Fetch unread messages from ea@ inbox
  const messages = await fetchEaInboxEmails(50);
  result.messagesFound = messages.length;

  if (messages.length === 0) return result;

  // Step 2: Load enrolled users (calendar scheduling enabled + link set)
  const { data: enrolledUsers, error: enrollError } = await supabase
    .from('team_members')
    .select(
      'id, name, email, scheduling_link, ea_custom_instructions'
    )
    .eq('feature_calendar_scheduling', true)
    .eq('is_active', true)
    .not('scheduling_link', 'is', null);

  console.log('[EA] Enrolled users query:', { count: enrolledUsers?.length, error: enrollError?.message });
  if (enrolledUsers) {
    for (const u of enrolledUsers) {
      console.log(`[EA]   User: ${u.email} link=${u.scheduling_link}`);
    }
  }

  if (!enrolledUsers || enrolledUsers.length === 0) {
    // No enrolled users — mark everything as skipped
    console.log('[EA] No enrolled users found — skipping all messages');
    result.skipped = messages.length;
    return result;
  }

  // Build lookup map: lowercase email → user
  const userMap = new Map<string, TeamMember>();
  for (const user of enrolledUsers) {
    userMap.set(user.email.toLowerCase(), user as TeamMember);
  }

  // Step 3: Batch dedup check against ea_replies
  const gmailMessageIds = messages.map((m) => m.id);
  const { data: existingReplies } = await supabase
    .from('ea_replies')
    .select('gmail_message_id')
    .in('gmail_message_id', gmailMessageIds);
  const processedIds = new Set(
    (existingReplies ?? []).map((r: { gmail_message_id: string }) => r.gmail_message_id)
  );

  // Thread-level dedup: don't reply twice in the same thread
  const threadIds = messages
    .map((m) => m.threadId)
    .filter(Boolean);
  const { data: existingThreadReplies } = await supabase
    .from('ea_replies')
    .select('gmail_thread_id')
    .in('gmail_thread_id', threadIds)
    .eq('reply_sent', true);
  const processedThreads = new Set(
    (existingThreadReplies ?? []).map((r: { gmail_thread_id: string }) => r.gmail_thread_id)
  );

  // Step 4: Process each message
  for (const msg of messages) {
    try {
      await processMessage(msg, userMap, processedIds, processedThreads, result);
    } catch (err) {
      console.error(`EA processor error for message ${msg.id}:`, err);
      result.errors++;
    }
  }

  return result;
}

async function processMessage(
  msg: EaInboxMessage,
  userMap: Map<string, TeamMember>,
  processedIds: Set<string>,
  processedThreads: Set<string>,
  result: EaProcessResult
): Promise<void> {
  console.log(`[EA] Processing message ${msg.id}: from=${msg.from} to=${msg.to} cc=${msg.cc} subject=${msg.subject}`);

  // Dedup: already processed this exact message
  if (processedIds.has(msg.id)) {
    console.log(`[EA]   SKIP: already processed (message dedup)`);
    result.skipped++;
    return;
  }

  // Thread dedup: already replied in this thread
  if (msg.threadId && processedThreads.has(msg.threadId)) {
    console.log(`[EA]   SKIP: already replied in thread ${msg.threadId}`);
    result.skipped++;
    await markEaMessageRead(msg.id);
    return;
  }

  // Check if ea@ is in CC (not just To)
  const ccLower = msg.cc.toLowerCase();
  const toLower = msg.to.toLowerCase();
  const eaInCc = ccLower.includes(EA_EMAIL);
  const eaInTo = toLower.includes(EA_EMAIL);

  if (!eaInCc && eaInTo) {
    console.log(`[EA]   SKIP: ea@ in To but not CC`);
    result.skipped++;
    await markEaMessageRead(msg.id);
    return;
  }

  if (!eaInCc && !eaInTo) {
    console.log(`[EA]   SKIP: ea@ not in CC or To`);
    result.skipped++;
    return;
  }

  // Skip internal-only emails
  if (isInternalOnly(msg.from, msg.to, msg.cc)) {
    console.log(`[EA]   SKIP: internal-only email`);
    result.skipped++;
    await markEaMessageRead(msg.id);
    return;
  }

  // Find the LocalVR user on the thread
  const localvrEmail = findLocalvrUser(msg.from, msg.to, msg.cc);
  if (!localvrEmail) {
    console.log(`[EA]   SKIP: no LocalVR user found on thread`);
    result.skipped++;
    await markEaMessageRead(msg.id);
    return;
  }

  // Look up enrolled user
  const user = userMap.get(localvrEmail);
  if (!user || !user.scheduling_link) {
    console.log(`[EA]   SKIP: user ${localvrEmail} not enrolled or no scheduling link`);
    result.skipped++;
    await markEaMessageRead(msg.id);
    return;
  }

  // Find the external sender to reply to
  const externalSender = findExternalSender(msg.from, msg.to, msg.cc);
  if (!externalSender) {
    console.log(`[EA]   SKIP: no external sender found`);
    result.skipped++;
    await markEaMessageRead(msg.id);
    return;
  }

  console.log(`[EA]   MATCH: user=${localvrEmail} externalSender=${externalSender.email} — generating reply`);

  // Generate reply via Claude
  const replyText = await generateEaReply(
    externalSender.name,
    externalSender.email,
    msg.subject,
    msg.body,
    user.name,
    user.scheduling_link,
    user.ea_custom_instructions
  );

  // Build subject with Re: prefix
  const replySubject = msg.subject.startsWith('Re: ')
    ? msg.subject
    : `Re: ${msg.subject}`;

  // Send reply from ea@
  let replyMessageId: string | null = null;
  let sendError: string | null = null;
  try {
    replyMessageId = await sendEaReply({
      to: externalSender.raw,
      cc: user.email,
      subject: replySubject,
      body: replyText,
      inReplyTo: msg.messageIdHeader || undefined,
      references: msg.messageIdHeader || undefined,
      threadId: msg.threadId,
    });
  } catch (err) {
    sendError =
      err instanceof Error ? err.message : 'Failed to send reply';
    console.error(`EA send error for message ${msg.id}:`, sendError);
  }

  // Insert ea_replies record
  await supabase.from('ea_replies').insert({
    team_member_id: user.id,
    gmail_message_id: msg.id,
    gmail_thread_id: msg.threadId || null,
    from_address: externalSender.email,
    to_addresses: msg.to,
    cc_addresses: msg.cc,
    subject: msg.subject,
    snippet: msg.snippet.slice(0, 500),
    reply_text: replyText,
    reply_sent: !sendError,
    sent_at: sendError ? null : new Date().toISOString(),
    reply_gmail_message_id: replyMessageId,
    error_message: sendError,
  });

  if (sendError) {
    result.errors++;
  } else {
    result.repliesSent++;
    // Mark original as read
    await markEaMessageRead(msg.id);
    // Track this thread as processed
    if (msg.threadId) {
      processedThreads.add(msg.threadId);
    }
  }
}
