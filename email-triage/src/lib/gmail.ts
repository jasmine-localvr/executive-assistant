import { google } from 'googleapis';
import { supabase } from './supabase';
import { encrypt, decrypt } from './encryption';
import type { TeamMember, GmailMessage } from '@/types';

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
}

async function getAuthedClient(member: TeamMember) {
  const oauth2Client = createOAuth2Client();

  const tokenExpiry = member.gmail_token_expiry
    ? new Date(member.gmail_token_expiry)
    : new Date(0);

  if (tokenExpiry > new Date() && member.gmail_access_token) {
    oauth2Client.setCredentials({
      access_token: decrypt(member.gmail_access_token),
    });
    return oauth2Client;
  }

  // Token expired — refresh it
  if (!member.gmail_refresh_token) {
    throw new Error(`No refresh token stored for ${member.email}`);
  }

  oauth2Client.setCredentials({
    refresh_token: decrypt(member.gmail_refresh_token),
  });

  const { credentials } = await oauth2Client.refreshAccessToken();

  // Store the refreshed tokens
  const updateData: Record<string, string> = {
    gmail_access_token: encrypt(credentials.access_token!),
    gmail_token_expiry: new Date(credentials.expiry_date!).toISOString(),
  };
  if (credentials.refresh_token) {
    updateData.gmail_refresh_token = encrypt(credentials.refresh_token);
  }

  await supabase
    .from('team_members')
    .update(updateData)
    .eq('id', member.id);

  return oauth2Client;
}

export async function fetchInboxEmails(
  member: TeamMember,
  maxResults: number = 20
): Promise<GmailMessage[]> {
  const auth = await getAuthedClient(member);
  const gmail = google.gmail({ version: 'v1', auth });

  // List message IDs from inbox
  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    q: 'in:inbox is:unread',
    maxResults,
  });

  const messageIds = listResponse.data.messages ?? [];
  if (messageIds.length === 0) return [];

  // Fetch full details for each message
  const messages: GmailMessage[] = [];
  for (const { id } of messageIds) {
    if (!id) continue;
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'full',
    });

    const headers = msg.data.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

    // Extract body text
    let body = '';
    const payload = msg.data.payload;
    if (payload?.body?.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload?.parts) {
      const textPart = payload.parts.find(
        (p) => p.mimeType === 'text/plain'
      );
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    }

    messages.push({
      id: msg.data.id!,
      threadId: msg.data.threadId!,
      from: getHeader('From'),
      to: getHeader('To') || undefined,
      cc: getHeader('Cc') || undefined,
      subject: getHeader('Subject'),
      snippet: msg.data.snippet ?? '',
      body: body.slice(0, 10000), // Cap body length for Claude
      receivedAt: new Date(parseInt(msg.data.internalDate!, 10)).toISOString(),
      messageIdHeader: getHeader('Message-ID') || undefined,
    });
  }

  return messages;
}

export async function fetchSentEmails(
  member: TeamMember,
  maxResults: number = 50
): Promise<GmailMessage[]> {
  const auth = await getAuthedClient(member);
  const gmail = google.gmail({ version: 'v1', auth });

  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    q: 'in:sent',
    maxResults,
  });

  const messageIds = listResponse.data.messages ?? [];
  if (messageIds.length === 0) return [];

  const messages: GmailMessage[] = [];
  for (const { id } of messageIds) {
    if (!id) continue;
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'full',
    });

    const headers = msg.data.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

    let body = '';
    const payload = msg.data.payload;
    if (payload?.body?.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload?.parts) {
      const textPart = payload.parts.find(
        (p) => p.mimeType === 'text/plain'
      );
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    }

    messages.push({
      id: msg.data.id!,
      threadId: msg.data.threadId!,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      snippet: msg.data.snippet ?? '',
      body: body.slice(0, 2000),
      receivedAt: new Date(parseInt(msg.data.internalDate!, 10)).toISOString(),
    });
  }

  return messages;
}

export async function archiveMessage(
  member: TeamMember,
  messageId: string
): Promise<void> {
  const auth = await getAuthedClient(member);
  const gmail = google.gmail({ version: 'v1', auth });

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['INBOX'],
    },
  });
}

export async function ensureLabel(
  member: TeamMember,
  labelName: string
): Promise<string> {
  const auth = await getAuthedClient(member);
  const gmail = google.gmail({ version: 'v1', auth });

  // Check if label already exists
  const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
  const existing = labelsResponse.data.labels?.find(
    (l) => l.name?.toLowerCase() === labelName.toLowerCase()
  );
  if (existing?.id) return existing.id;

  // Create new label
  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: labelName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    },
  });

  return created.data.id!;
}

export async function addLabel(
  member: TeamMember,
  messageId: string,
  labelId: string
): Promise<void> {
  const auth = await getAuthedClient(member);
  const gmail = google.gmail({ version: 'v1', auth });

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: [labelId],
    },
  });
}

export async function markAsRead(
  member: TeamMember,
  messageId: string
): Promise<void> {
  const auth = await getAuthedClient(member);
  const gmail = google.gmail({ version: 'v1', auth });

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD'],
    },
  });
}

interface DraftOptions {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  threadId?: string;
}

export async function createGmailDraft(
  member: TeamMember,
  options: DraftOptions
): Promise<string> {
  const auth = await getAuthedClient(member);
  const gmail = google.gmail({ version: 'v1', auth });

  const headers = [
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    'Content-Type: text/plain; charset=utf-8',
  ];

  if (options.cc) {
    headers.push(`Cc: ${options.cc}`);
  }

  if (options.inReplyTo) {
    headers.push(`In-Reply-To: ${options.inReplyTo}`);
    headers.push(`References: ${options.inReplyTo}`);
  }

  const rawMessage = headers.join('\r\n') + '\r\n\r\n' + options.body;
  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const draft = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw: encoded,
        threadId: options.threadId,
      },
    },
  });

  return draft.data.id!;
}
