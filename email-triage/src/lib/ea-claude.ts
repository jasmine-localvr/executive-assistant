import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const EA_SYSTEM_PROMPT = `You are the scheduling assistant for a team member at LocalVR, a vacation rental property management company managing 533+ properties. Someone has CC'd ea@golocalvr.com on an email to schedule a meeting with this team member.

Your job: Write a warm, professional reply that:
1. Acknowledges the context of the email conversation naturally
2. Introduces yourself as the scheduling assistant for the team member
3. Provides their calendar booking link
4. Offers to help if the link doesn't work or they need a different time

Keep the reply concise — 3-5 sentences max. Be warm but professional, matching the tone of a high-end hospitality company. Do NOT use overly formal language.

IMPORTANT:
- Write ONLY the email body text. No subject line, no email headers, no JSON.
- Start with a greeting (e.g., "Hi [name],")
- End with a professional sign-off as "Scheduling Assistant to [team member name]"
- Do NOT insert line breaks within paragraphs. Each paragraph must be a single long line. Only use blank lines to separate paragraphs. The email client will handle word wrapping.`;

export async function generateEaReply(
  senderName: string,
  senderEmail: string,
  subject: string,
  body: string,
  userName: string,
  calendarLink: string,
  customInstructions?: string | null
): Promise<string> {
  const systemPrompt = customInstructions
    ? `${EA_SYSTEM_PROMPT}\n\nAdditional context from ${userName}: ${customInstructions}`
    : EA_SYSTEM_PROMPT;

  const userMessage = `Team member: ${userName}
Calendar booking link: ${calendarLink}

Original email to respond to:
From: ${senderName} <${senderEmail}>
Subject: ${subject}

${body}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';

  let reply = text.trim();

  // Ensure calendar link is always present in the reply
  if (!reply.includes(calendarLink)) {
    reply += `\n\n${calendarLink}`;
  }

  return reply;
}
