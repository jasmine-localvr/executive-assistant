import twilio from 'twilio';

function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  }
  return twilio(accountSid, authToken);
}

function getFromNumber(): string {
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) throw new Error('Missing TWILIO_FROM_NUMBER');
  return from;
}

/**
 * Strip markdown formatting for plain-text SMS.
 * Converts **bold**, *italic*, [links](url), headers, and code blocks.
 */
function stripMarkdown(text: string): string {
  return text
    // Headers: ## Heading → Heading
    .replace(/^#{1,6}\s+/gm, '')
    // Bold/italic: **text** or *text* → text
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    // Links: [text](url) → text (url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    // Inline code: `code` → code
    .replace(/`([^`]+)`/g, '$1')
    // Code blocks
    .replace(/```[\s\S]*?```/g, (match) =>
      match.replace(/```\w*\n?/g, '').trim()
    )
    // Bullet points: keep as-is (they render fine in SMS)
    .trim();
}

/** SMS has a 1600 char cap per message. Twilio auto-segments, but keep it reasonable. */
const MAX_SMS_LENGTH = 1500;

/**
 * Send an SMS reply to the user.
 * Strips markdown and truncates if needed.
 */
export async function sendSmsReply(
  toNumber: string,
  agentResponse: string
): Promise<void> {
  let body = stripMarkdown(agentResponse);

  if (body.length > MAX_SMS_LENGTH) {
    body = body.slice(0, MAX_SMS_LENGTH - 3) + '...';
  }

  const client = getClient();
  await client.messages.create({
    to: toNumber,
    from: getFromNumber(),
    body,
  });
}
