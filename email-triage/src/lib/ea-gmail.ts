import { google, gmail_v1 } from 'googleapis';
import type { EaInboxMessage } from '@/types';

const EA_EMAIL = 'ea@golocalvr.com';

function getServiceAccountAuth() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyRaw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set');

  // Support both base64-encoded and raw JSON formats
  let key: { client_email: string; private_key: string };
  try {
    // Try base64 decode first (recommended for env vars with newlines)
    const decoded = Buffer.from(keyRaw, 'base64').toString('utf-8');
    key = JSON.parse(decoded);
  } catch {
    // Fall back to direct JSON parse
    key = JSON.parse(keyRaw);
  }

  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    subject: EA_EMAIL,
  });
}

export function getEaGmailClient(): gmail_v1.Gmail {
  const auth = getServiceAccountAuth();
  return google.gmail({ version: 'v1', auth });
}

export async function fetchEaInboxEmails(
  maxResults: number = 50
): Promise<EaInboxMessage[]> {
  const gmail = getEaGmailClient();

  const listResponse = await gmail.users.messages.list({
    userId: EA_EMAIL,
    q: 'in:inbox is:unread',
    maxResults,
  });

  const messageIds = listResponse.data.messages ?? [];
  if (messageIds.length === 0) return [];

  const messages: EaInboxMessage[] = [];
  for (const { id } of messageIds) {
    if (!id) continue;
    const msg = await gmail.users.messages.get({
      userId: EA_EMAIL,
      id,
      format: 'full',
    });

    const headers = msg.data.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
        ?.value ?? '';

    let body = '';
    const payload = msg.data.payload;
    if (payload?.body?.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload?.parts) {
      const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    }

    messages.push({
      id: msg.data.id!,
      threadId: msg.data.threadId!,
      from: getHeader('From'),
      to: getHeader('To'),
      cc: getHeader('Cc'),
      subject: getHeader('Subject'),
      snippet: msg.data.snippet ?? '',
      body: body.slice(0, 5000),
      receivedAt: new Date(
        parseInt(msg.data.internalDate!, 10)
      ).toISOString(),
      messageIdHeader: getHeader('Message-ID'),
    });
  }

  return messages;
}

interface SendReplyOptions {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

/** Convert plain text to simple HTML: paragraphs + clickable links. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const paragraphs = escaped.split(/\n{2,}/);

  const htmlParagraphs = paragraphs.map((p) => {
    const withLinks = p.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1">$1</a>'
    );
    const withBreaks = withLinks.replace(/\n/g, '<br>');
    return `<p style="margin:0 0 16px 0;line-height:1.5">${withBreaks}</p>`;
  });

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#333">${htmlParagraphs.join('')}</div>`;
}

export async function sendEaReply(
  options: SendReplyOptions
): Promise<string> {
  const gmail = getEaGmailClient();

  const htmlBody = textToHtml(options.body);

  const headerLines = [
    `From: LocalVR EA <${EA_EMAIL}>`,
    `To: ${options.to}`,
    ...(options.cc ? [`Cc: ${options.cc}`] : []),
    `Subject: ${options.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
  ];

  if (options.inReplyTo) {
    headerLines.push(`In-Reply-To: ${options.inReplyTo}`);
    headerLines.push(`References: ${options.references || options.inReplyTo}`);
  }

  const rawMessage = headerLines.join('\r\n') + '\r\n\r\n' + htmlBody;
  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const result = await gmail.users.messages.send({
    userId: EA_EMAIL,
    requestBody: {
      threadId: options.threadId,
      raw: encoded,
    },
  });

  return result.data.id!;
}

export async function markEaMessageRead(messageId: string): Promise<void> {
  const gmail = getEaGmailClient();

  await gmail.users.messages.modify({
    userId: EA_EMAIL,
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD'],
    },
  });
}

export async function setupEaWatch(
  topicName: string
): Promise<{ historyId: string; expiration: string }> {
  const gmail = getEaGmailClient();

  const result = await gmail.users.watch({
    userId: EA_EMAIL,
    requestBody: {
      topicName,
      labelIds: ['INBOX'],
    },
  });

  return {
    historyId: result.data.historyId!,
    expiration: result.data.expiration!,
  };
}

export async function fetchEaHistory(
  startHistoryId: string
): Promise<string[]> {
  const gmail = getEaGmailClient();

  const result = await gmail.users.history.list({
    userId: EA_EMAIL,
    startHistoryId,
    historyTypes: ['messageAdded'],
  });

  const messageIds: string[] = [];
  for (const history of result.data.history ?? []) {
    for (const added of history.messagesAdded ?? []) {
      if (added.message?.id) {
        messageIds.push(added.message.id);
      }
    }
  }

  return messageIds;
}
