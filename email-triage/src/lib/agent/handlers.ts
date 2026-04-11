import { google } from 'googleapis';
import { WebClient } from '@slack/web-api';
import { getAuthedClient, createGmailDraft } from '@/lib/gmail';
import { fetchTodayEvents, rsvpToEvent } from '@/lib/calendar';
import { supabase } from '@/lib/supabase';
import type { TeamMember } from '@/types';
import {
  getOrCreateSession,
  closeSession,
  getPageSnapshot,
  clickElement,
  typeInElement,
  selectOption,
} from './browser';

// ─── Tool Result Type ───

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  screenshot?: string; // base64 PNG — present on browser tool results
}

// ─── Execute a tool call by name ───

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'gmail_search':
        return await handleGmailSearch(input, member);
      case 'gmail_read':
        return await handleGmailRead(input, member);
      case 'gmail_send':
        return await handleGmailSend(input, member);
      case 'gmail_draft':
        return await handleGmailDraft(input, member);
      case 'gmail_archive':
        return await handleGmailArchive(input, member);
      case 'calendar_today':
        return await handleCalendarToday(input, member);
      case 'calendar_create':
        return await handleCalendarCreate(input, member);
      case 'calendar_find_free_time':
        return await handleCalendarFreeTime(input, member);
      case 'calendar_rsvp':
        return await handleCalendarRsvp(input, member);
      case 'calendar_range':
        return await handleCalendarRange(input, member);
      case 'slack_send':
        return await handleSlackSend(input, member);
      case 'contact_lookup':
        return await handleContactLookup(input, member);
      case 'contact_add':
        return await handleContactAdd(input, member);
      case 'contact_update':
        return await handleContactUpdate(input, member);
      case 'reminder_create':
        return await handleReminderCreate(input, member);
      case 'reminder_list':
        return await handleReminderList(input, member);
      case 'reminder_complete':
        return await handleReminderComplete(input, member);
      case 'todo_prioritize':
        return await handleTodoPrioritize(member);
      case 'email_check_replies':
        return await handleEmailCheckReplies(input, member);
      case 'email_log_action':
        return await handleEmailLogAction(input, member);
      case 'email_get_history':
        return await handleEmailGetHistory(input, member);
      case 'recurring_todo_create':
        return await handleRecurringTodoCreate(input, member);
      case 'recurring_todo_list':
        return await handleRecurringTodoList(input, member);
      case 'recurring_todo_pause':
        return await handleRecurringTodoPause(input, member);
      case 'browser_navigate':
        return await handleBrowserNavigate(input, member);
      case 'browser_click':
        return await handleBrowserClick(input, member);
      case 'browser_type':
        return await handleBrowserType(input, member);
      case 'browser_select':
        return await handleBrowserSelect(input, member);
      case 'browser_scroll':
        return await handleBrowserScroll(input, member);
      case 'browser_close':
        return await handleBrowserClose(member);
      case 'get_current_time':
        return handleGetCurrentTime();
      case 'note_to_self':
        return await handleNoteToSelf(input, member);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    console.error(`[Agent] Tool "${toolName}" error:`, err);
    return { success: false, error: message };
  }
}

// ─── Gmail Handlers ───

async function handleGmailSearch(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const query = input.query as string;
  const maxResults = Math.min((input.max_results as number) || 10, 25);

  const auth = await getAuthedClient(member);
  const gmail = google.gmail({ version: 'v1', auth });

  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });

  const messageIds = listResponse.data.messages ?? [];
  if (messageIds.length === 0) {
    return { success: true, data: { results: [], total: 0 } };
  }

  const results = [];
  for (const { id } of messageIds) {
    if (!id) continue;
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date', 'To'],
    });

    const headers = msg.data.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

    results.push({
      id: msg.data.id,
      threadId: msg.data.threadId,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      snippet: msg.data.snippet ?? '',
    });
  }

  return { success: true, data: { results, total: results.length } };
}

async function handleGmailRead(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const messageId = input.message_id as string;

  const auth = await getAuthedClient(member);
  const gmail = google.gmail({ version: 'v1', auth });

  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
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
    const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    }
  }

  return {
    success: true,
    data: {
      id: msg.data.id,
      threadId: msg.data.threadId,
      from: getHeader('From'),
      to: getHeader('To'),
      cc: getHeader('Cc'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      messageIdHeader: getHeader('Message-ID'),
      body: body.slice(0, 10000),
    },
  };
}

async function handleGmailSend(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const auth = await getAuthedClient(member);
  const gmail = google.gmail({ version: 'v1', auth });

  const headers = [
    `To: ${input.to as string}`,
    `Subject: ${input.subject as string}`,
    'Content-Type: text/plain; charset=utf-8',
  ];

  if (input.cc) headers.push(`Cc: ${input.cc as string}`);
  if (input.in_reply_to) {
    headers.push(`In-Reply-To: ${input.in_reply_to as string}`);
    headers.push(`References: ${input.in_reply_to as string}`);
  }

  const rawMessage = headers.join('\r\n') + '\r\n\r\n' + (input.body as string);
  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded,
      threadId: (input.thread_id as string) || undefined,
    },
  });

  return {
    success: true,
    data: { messageId: result.data.id, threadId: result.data.threadId },
  };
}

async function handleGmailDraft(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const draftId = await createGmailDraft(member, {
    to: input.to as string,
    subject: input.subject as string,
    body: input.body as string,
    cc: (input.cc as string) || undefined,
    inReplyTo: (input.in_reply_to as string) || undefined,
    threadId: (input.thread_id as string) || undefined,
  });

  return { success: true, data: { draftId } };
}

async function handleGmailArchive(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const messageIds = input.message_ids as string[];
  const auth = await getAuthedClient(member);
  const gmail = google.gmail({ version: 'v1', auth });

  if (messageIds.length === 1) {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageIds[0],
      requestBody: { removeLabelIds: ['INBOX'] },
    });
  } else {
    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: messageIds,
        removeLabelIds: ['INBOX'],
      },
    });
  }

  return { success: true, data: { archived: messageIds.length } };
}

// ─── Calendar Handlers ───

async function handleCalendarToday(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const date = (input.date as string) || undefined;

  // Fetch from primary calendar
  const primaryEvents = await fetchTodayEvents(member, date);

  // Also fetch from company calendar if configured
  const allEvents = primaryEvents.map((e) => ({ ...e, calendarName: 'primary' }));

  if (process.env.COMPANY_CAL_ID) {
    try {
      const auth = await getAuthedClient(member);
      const calendar = google.calendar({ version: 'v3', auth });
      const tz = 'America/Denver';
      const targetDate = date || new Date().toLocaleDateString('en-CA', { timeZone: tz });
      const [y, m, d] = targetDate.split('-').map(Number);
      const dayStart = new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00`);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const response = await calendar.events.list({
        calendarId: process.env.COMPANY_CAL_ID,
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: tz,
      });

      for (const item of response.data.items ?? []) {
        const selfAttendee = item.attendees?.find((a) => a.self === true);
        if (selfAttendee?.responseStatus === 'declined') continue;

        const isAllDay = !!item.start?.date;
        const otherAttendees = (item.attendees ?? [])
          .filter((a) => !a.self && !a.resource)
          .map((a) => a.displayName?.split(' ')[0] || (a.email ?? '').split('@')[0])
          .filter(Boolean);

        allEvents.push({
          eventId: item.id ?? '',
          title: item.summary ?? '(No title)',
          startTime: item.start?.dateTime ?? null,
          endTime: item.end?.dateTime ?? null,
          allDay: isAllDay,
          attendees: otherAttendees,
          externalAttendees: [],
          meetLink: item.hangoutLink ?? null,
          location: item.location ?? null,
          responseStatus: (selfAttendee?.responseStatus as 'accepted' | 'tentative' | 'needsAction') ?? null,
          calendarName: 'company',
        });
      }
    } catch {
      // Company calendar not accessible — continue with primary only
    }
  }

  // Sort by start time
  allEvents.sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return (a.startTime ?? '').localeCompare(b.startTime ?? '');
  });

  return {
    success: true,
    data: {
      date: date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }),
      events: allEvents.map((e) => ({
        eventId: e.eventId,
        title: e.title,
        startTime: e.startTime,
        endTime: e.endTime,
        allDay: e.allDay,
        attendees: e.attendees,
        meetLink: e.meetLink,
        location: e.location,
        responseStatus: e.responseStatus,
        calendar: (e as { calendarName?: string }).calendarName ?? 'primary',
      })),
    },
  };
}

async function handleCalendarCreate(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const auth = await getAuthedClient(member);
  const calendar = google.calendar({ version: 'v3', auth });

  const attendees = (input.attendees as string[] | undefined)?.map((email) => ({
    email,
  }));

  const isAllDay = !!input.all_day;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestBody: any = {
    summary: input.title as string,
  };

  if (isAllDay) {
    const startDate = input.start_date as string;
    // Google Calendar all-day end date is exclusive, so a single-day event
    // on April 14 needs end_date = April 15. Default to day-after-start.
    let endDate = input.end_date as string | undefined;
    if (!endDate) {
      const d = new Date(startDate + 'T12:00:00'); // noon to avoid DST edge cases
      d.setDate(d.getDate() + 1);
      endDate = d.toISOString().split('T')[0];
    }
    requestBody.start = { date: startDate };
    requestBody.end = { date: endDate };
  } else {
    requestBody.start = { dateTime: input.start_time as string, timeZone: 'America/Denver' };
    requestBody.end = { dateTime: input.end_time as string, timeZone: 'America/Denver' };
  }

  if (input.description) requestBody.description = input.description as string;
  if (input.location) requestBody.location = input.location as string;
  if (attendees) requestBody.attendees = attendees;
  if (input.add_meet_link) {
    requestBody.conferenceData = {
      createRequest: { requestId: `agent-${Date.now()}` },
    };
  }

  const result = await calendar.events.insert({
    calendarId: 'primary',
    requestBody,
    conferenceDataVersion: input.add_meet_link ? 1 : 0,
    sendUpdates: attendees ? 'all' : 'none',
  });

  return {
    success: true,
    data: {
      eventId: result.data.id,
      htmlLink: result.data.htmlLink,
      meetLink: result.data.hangoutLink || null,
    },
  };
}

async function handleCalendarFreeTime(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const date =
    (input.date as string) ||
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
  const duration = (input.duration_minutes as number) || 30;
  const startHour = (input.start_hour as number) || 8;
  const endHour = (input.end_hour as number) || 18;

  const events = await fetchTodayEvents(member, date);

  // Build busy intervals from events (non-all-day only)
  const busy: { start: number; end: number }[] = [];
  for (const evt of events) {
    if (evt.allDay || !evt.startTime || !evt.endTime) continue;
    busy.push({
      start: new Date(evt.startTime).getTime(),
      end: new Date(evt.endTime).getTime(),
    });
  }
  busy.sort((a, b) => a.start - b.start);

  // Find free slots
  const dayStart = new Date(`${date}T${String(startHour).padStart(2, '0')}:00:00-06:00`).getTime();
  const dayEnd = new Date(`${date}T${String(endHour).padStart(2, '0')}:00:00-06:00`).getTime();
  const minDuration = duration * 60 * 1000;

  const freeSlots: { start: string; end: string; duration_minutes: number }[] = [];
  let cursor = dayStart;

  for (const block of busy) {
    if (block.start > cursor && block.start - cursor >= minDuration) {
      freeSlots.push({
        start: new Date(cursor).toISOString(),
        end: new Date(block.start).toISOString(),
        duration_minutes: Math.round((block.start - cursor) / 60000),
      });
    }
    cursor = Math.max(cursor, block.end);
  }

  if (dayEnd > cursor && dayEnd - cursor >= minDuration) {
    freeSlots.push({
      start: new Date(cursor).toISOString(),
      end: new Date(dayEnd).toISOString(),
      duration_minutes: Math.round((dayEnd - cursor) / 60000),
    });
  }

  return { success: true, data: { date, freeSlots } };
}

async function handleCalendarRsvp(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  await rsvpToEvent(
    member,
    input.event_id as string,
    input.response as 'accepted' | 'declined'
  );
  return { success: true, data: { eventId: input.event_id, response: input.response } };
}

async function handleCalendarRange(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const startDate = input.start_date as string;
  const endDate = input.end_date as string;

  const auth = await getAuthedClient(member);
  const calendar = google.calendar({ version: 'v3', auth });

  const tz = 'America/Denver';
  const timeMin = new Date(`${startDate}T00:00:00`).toISOString();
  // End date is inclusive, so add 1 day
  const endParts = endDate.split('-').map(Number);
  const endDateObj = new Date(endParts[0], endParts[1] - 1, endParts[2] + 1);
  const timeMax = endDateObj.toISOString();

  // Fetch from all configured calendars
  const calendarIds = ['primary'];
  if (process.env.PERSONAL_CAL_ID && process.env.PERSONAL_CAL_ID !== 'primary') {
    calendarIds.push(process.env.PERSONAL_CAL_ID);
  }
  if (process.env.COMPANY_CAL_ID) {
    calendarIds.push(process.env.COMPANY_CAL_ID);
  }

  const allEvents: {
    date: string;
    title: string;
    startTime: string | null;
    endTime: string | null;
    allDay: boolean;
    attendees: string[];
    location: string | null;
    calendarName: string;
  }[] = [];

  for (const calId of calendarIds) {
    try {
      const response = await calendar.events.list({
        calendarId: calId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: tz,
      });

      const calName = calId === 'primary' ? 'primary' : calId.includes('@') ? calId.split('@')[0] : calId;

      for (const item of response.data.items ?? []) {
        // Skip declined
        const selfAttendee = item.attendees?.find((a) => a.self === true);
        if (selfAttendee?.responseStatus === 'declined') continue;

        const allDay = !!item.start?.date;
        const eventDate = allDay
          ? item.start!.date!
          : (item.start?.dateTime ?? '').split('T')[0];

        const otherAttendees = (item.attendees ?? [])
          .filter((a) => !a.self && !a.resource)
          .map((a) => a.displayName?.split(' ')[0] || (a.email ?? '').split('@')[0])
          .filter(Boolean);

        allEvents.push({
          date: eventDate,
          title: item.summary ?? '(No title)',
          startTime: item.start?.dateTime ?? null,
          endTime: item.end?.dateTime ?? null,
          allDay,
          attendees: otherAttendees,
          location: item.location ?? null,
          calendarName: calName,
        });
      }
    } catch {
      // Calendar may not be accessible — skip silently
    }
  }

  // Sort by date then start time
  allEvents.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return (a.startTime ?? '').localeCompare(b.startTime ?? '');
  });

  // Group by date
  const byDate: Record<string, typeof allEvents> = {};
  for (const evt of allEvents) {
    if (!byDate[evt.date]) byDate[evt.date] = [];
    byDate[evt.date].push(evt);
  }

  return {
    success: true,
    data: { startDate, endDate, eventsByDate: byDate, totalEvents: allEvents.length },
  };
}

// ─── Slack Handlers ───

async function handleSlackSend(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  let channelOrUser = input.channel_or_user as string;
  const message = input.message as string;

  // If it looks like an email, try to find the Slack user
  if (channelOrUser.includes('@') && !channelOrUser.startsWith('#')) {
    const users = await client.users.lookupByEmail({ email: channelOrUser });
    if (users.user?.id) {
      channelOrUser = users.user.id;
    }
  }

  // If it starts with #, resolve channel name
  if (channelOrUser.startsWith('#')) {
    const channelName = channelOrUser.slice(1);
    const channels = await client.conversations.list({ types: 'public_channel', limit: 200 });
    const found = channels.channels?.find((c) => c.name === channelName);
    if (found?.id) {
      channelOrUser = found.id;
    }
  }

  // If it looks like a user ID (starts with U), open a DM first
  if (channelOrUser.startsWith('U')) {
    const dm = await client.conversations.open({ users: channelOrUser });
    if (dm.channel?.id) {
      channelOrUser = dm.channel.id;
    }
  }

  // If we have the member's slack_user_id and user typed "me" or their own name
  if (channelOrUser.toLowerCase() === 'me' && member.slack_user_id) {
    const dm = await client.conversations.open({ users: member.slack_user_id });
    if (dm.channel?.id) {
      channelOrUser = dm.channel.id;
    }
  }

  const result = await client.chat.postMessage({
    channel: channelOrUser,
    text: message,
  });

  return { success: true, data: { channel: result.channel, ts: result.ts } };
}

// ─── Contact Handlers ───

async function handleContactLookup(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const query = (input.query as string).toLowerCase();

  // Search by name (ilike) OR by type (exact match, case-insensitive)
  const { data, error } = await supabase
    .from('ea_contacts')
    .select('*')
    .eq('team_member_id', member.id)
    .or(`name.ilike.%${query}%,type.ilike.%${query}%`);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: {
      contacts: (data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        phone: c.phone,
        email: c.email,
        address: c.address,
        notes: c.notes,
        last_appointment: c.last_appointment,
      })),
    },
  };
}

async function handleContactAdd(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('ea_contacts')
    .insert({
      team_member_id: member.id,
      name: input.name as string,
      type: (input.type as string).toLowerCase(),
      email: (input.email as string) || null,
      phone: (input.phone as string) || null,
      address: (input.address as string) || null,
      notes: (input.notes as string) || null,
    })
    .select('id, name, type, email, phone')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

async function handleContactUpdate(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const contactId = input.contact_id as string;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.email !== undefined) updates.email = input.email;
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.address !== undefined) updates.address = input.address;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.last_appointment !== undefined) updates.last_appointment = input.last_appointment;

  const { data, error } = await supabase
    .from('ea_contacts')
    .update(updates)
    .eq('id', contactId)
    .eq('team_member_id', member.id)
    .select('id, name, type, email, phone, last_appointment')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ─── Reminder Handlers ───

async function handleReminderCreate(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  // Build insert payload — include email fields if provided
  const insertPayload: Record<string, unknown> = {
    team_member_id: member.id,
    title: input.title as string,
    description: (input.description as string) || null,
    due_at: (input.due_at as string) || null,
    priority: (input.priority as string) || 'medium',
    category: (input.category as string) || 'work',
    notes: (input.notes as string) || null,
    status: 'active',
  };

  // Email linking fields
  if (input.email_thread_id) {
    insertPayload.email_thread_id = input.email_thread_id;
    insertPayload.source = 'email';
  }
  if (input.email_message_id) insertPayload.email_message_id = input.email_message_id;
  if (input.email_subject) insertPayload.email_subject = input.email_subject;
  if (input.email_from) insertPayload.email_from = input.email_from;
  if (input.email_status) insertPayload.email_status = input.email_status;

  const { data, error } = await supabase
    .from('agent_reminders')
    .insert(insertPayload)
    .select('id, title, description, due_at, priority, category, email_thread_id, email_status, source')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

async function handleReminderList(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const includeCompleted = (input.include_completed as boolean) || false;
  const category = input.category as string | undefined;
  const limit = Math.min((input.limit as number) || 20, 50);

  let query = supabase
    .from('agent_reminders')
    .select('id, title, description, due_at, priority, category, notes, status, ai_priority_reason, created_at, email_thread_id, email_subject, email_from, email_status, source')
    .eq('team_member_id', member.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!includeCompleted) {
    query = query.eq('status', 'active');
  }
  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  return { success: true, data: { reminders: data ?? [] } };
}

async function handleReminderComplete(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('agent_reminders')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', input.reminder_id as string)
    .eq('team_member_id', member.id)
    .select('id, title')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ─── Todo Prioritization Handler ───

async function handleTodoPrioritize(
  member: TeamMember
): Promise<ToolResult> {
  const { data: todos, error } = await supabase
    .from('agent_reminders')
    .select('id, title, description, notes, category, priority, due_at')
    .eq('team_member_id', member.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  if (!todos || todos.length === 0) {
    return { success: true, data: { message: 'No active todos to prioritize' } };
  }

  // We return the todo list and let the agent (Claude) reason about priorities
  // in context of the conversation, then use reminder updates to apply them.
  const now = new Date().toLocaleString('en-US', {
    timeZone: 'America/Denver',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    success: true,
    data: {
      currentDate: now,
      todos: todos.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        category: t.category,
        current_priority: t.priority,
        due_at: t.due_at,
      })),
      instructions: 'Analyze these todos and suggest priority adjustments. For each todo that should change priority, explain why. Present the results to the user clearly.',
    },
  };
}

// ─── Email-Todo Linking Handlers ───

async function handleEmailCheckReplies(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const specificReminderId = input.reminder_id as string | undefined;

  // Find todos with linked email threads that are awaiting reply
  let query = supabase
    .from('agent_reminders')
    .select('id, title, email_thread_id, email_subject, email_from, email_status, created_at')
    .eq('team_member_id', member.id)
    .eq('status', 'active')
    .not('email_thread_id', 'is', null);

  if (specificReminderId) {
    query = query.eq('id', specificReminderId);
  } else {
    query = query.eq('email_status', 'awaiting_reply');
  }

  const { data: reminders, error } = await query;
  if (error) return { success: false, error: error.message };
  if (!reminders || reminders.length === 0) {
    return { success: true, data: { message: 'No email threads to check.', threads: [] } };
  }

  // For each linked thread, check Gmail for new messages
  const auth = await getAuthedClient(member);
  const gmail = google.gmail({ version: 'v1', auth });

  const results = [];
  for (const reminder of reminders) {
    try {
      const thread = await gmail.users.threads.get({
        userId: 'me',
        id: reminder.email_thread_id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      const messages = thread.data.messages ?? [];
      const latestMessage = messages[messages.length - 1];
      const headers = latestMessage?.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

      // Check if the latest message is from someone other than the user (i.e., a reply)
      const latestFrom = getHeader('From');
      const isReply = !latestFrom.toLowerCase().includes(member.email.toLowerCase());

      results.push({
        reminder_id: reminder.id,
        todo_title: reminder.title,
        email_subject: reminder.email_subject || getHeader('Subject'),
        thread_message_count: messages.length,
        latest_from: latestFrom,
        latest_date: getHeader('Date'),
        latest_snippet: latestMessage?.snippet ?? '',
        latest_message_id: latestMessage?.id,
        has_new_reply: isReply,
      });
    } catch {
      results.push({
        reminder_id: reminder.id,
        todo_title: reminder.title,
        email_subject: reminder.email_subject,
        error: 'Could not fetch thread — it may have been deleted',
      });
    }
  }

  return {
    success: true,
    data: {
      checked: results.length,
      threads: results,
      threads_with_replies: results.filter((r) => r.has_new_reply).length,
    },
  };
}

async function handleEmailLogAction(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const emailThreadId = input.email_thread_id as string;
  const actionType = input.action_type as string;
  const actionSummary = input.action_summary as string;
  const reminderId = (input.reminder_id as string) || null;
  const gmailMessageId = (input.gmail_message_id as string) || null;
  const updateEmailStatus = input.update_email_status as string | undefined;

  // Insert the action log
  const { data, error } = await supabase
    .from('email_actions')
    .insert({
      reminder_id: reminderId,
      team_member_id: member.id,
      email_thread_id: emailThreadId,
      gmail_message_id: gmailMessageId,
      action_type: actionType,
      action_summary: actionSummary,
      action_details: input.action_details || null,
    })
    .select('id, action_type, action_summary, created_at')
    .single();

  if (error) return { success: false, error: error.message };

  // Optionally update the linked todo's email_status
  if (updateEmailStatus && reminderId) {
    await supabase
      .from('agent_reminders')
      .update({ email_status: updateEmailStatus, updated_at: new Date().toISOString() })
      .eq('id', reminderId)
      .eq('team_member_id', member.id);
  }

  return { success: true, data };
}

async function handleEmailGetHistory(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const reminderId = input.reminder_id as string | undefined;
  const emailThreadId = input.email_thread_id as string | undefined;

  if (!reminderId && !emailThreadId) {
    return { success: false, error: 'Provide either reminder_id or email_thread_id' };
  }

  let query = supabase
    .from('email_actions')
    .select('id, reminder_id, email_thread_id, gmail_message_id, action_type, action_summary, action_details, created_at')
    .eq('team_member_id', member.id)
    .order('created_at', { ascending: true });

  if (reminderId) {
    query = query.eq('reminder_id', reminderId);
  } else if (emailThreadId) {
    query = query.eq('email_thread_id', emailThreadId);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  // Also fetch the linked todo for context
  let linkedTodo = null;
  if (reminderId) {
    const { data: todo } = await supabase
      .from('agent_reminders')
      .select('id, title, email_subject, email_from, email_status, status')
      .eq('id', reminderId)
      .single();
    linkedTodo = todo;
  }

  return {
    success: true,
    data: {
      linked_todo: linkedTodo,
      actions: data ?? [],
      total_actions: (data ?? []).length,
    },
  };
}

// ─── Recurring Todo Handlers ───

async function handleRecurringTodoCreate(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const { computeNextDue, formatRecurrenceLabel } = await import('@/lib/recurrence');

  const recurrenceType = input.recurrence_type as string;
  const recurrenceInterval = (input.recurrence_interval as number) || 1;
  const dayOfWeek = input.recurrence_day_of_week as number | undefined;
  const dayOfMonth = input.recurrence_day_of_month as number | undefined;
  const month = input.recurrence_month as number | undefined;

  const params = {
    recurrence_type: recurrenceType,
    recurrence_interval: recurrenceInterval,
    recurrence_day_of_week: dayOfWeek ?? null,
    recurrence_day_of_month: dayOfMonth ?? null,
    recurrence_month: month ?? null,
  };

  const nextDue = (input.next_due_at as string) || computeNextDue(params, new Date());

  const { data, error } = await supabase
    .from('recurring_todos')
    .insert({
      team_member_id: member.id,
      title: input.title as string,
      description: (input.description as string) || null,
      notes: (input.notes as string) || null,
      category: (input.category as string) || 'personal',
      priority: (input.priority as string) || 'medium',
      recurrence_type: recurrenceType,
      recurrence_interval: recurrenceInterval,
      recurrence_day_of_week: dayOfWeek ?? null,
      recurrence_day_of_month: dayOfMonth ?? null,
      recurrence_month: month ?? null,
      advance_notice_days: (input.advance_notice_days as number) ?? 0,
      next_due_at: nextDue,
      is_active: true,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  const scheduleLabel = formatRecurrenceLabel(params);
  return {
    success: true,
    data: {
      ...data,
      schedule_label: scheduleLabel,
    },
  };
}

async function handleRecurringTodoList(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const { formatRecurrenceLabel } = await import('@/lib/recurrence');
  const includePaused = (input.include_paused as boolean) || false;

  let query = supabase
    .from('recurring_todos')
    .select('*')
    .eq('team_member_id', member.id)
    .order('next_due_at', { ascending: true });

  if (!includePaused) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  const items = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    priority: r.priority,
    schedule: formatRecurrenceLabel(r),
    next_due: r.next_due_at,
    advance_notice_days: r.advance_notice_days,
    is_active: r.is_active,
    notes: r.notes,
  }));

  return { success: true, data: { recurring_todos: items } };
}

async function handleRecurringTodoPause(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const pause = input.pause as boolean;

  const { data, error } = await supabase
    .from('recurring_todos')
    .update({
      is_active: !pause,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.recurring_todo_id as string)
    .eq('team_member_id', member.id)
    .select('id, title, is_active')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ─── Browser Handlers ───

function formatElementList(elements: { index: number; tag: string; type?: string; text: string; placeholder?: string; name?: string; href?: string; value?: string; ariaLabel?: string; options?: { value: string; text: string }[] }[]): string {
  if (elements.length === 0) return 'No interactive elements found on page.';

  return elements
    .map((el) => {
      const parts = [`[${el.index}] <${el.tag}>`];
      if (el.type) parts.push(`type="${el.type}"`);
      if (el.ariaLabel) parts.push(`aria="${el.ariaLabel}"`);
      if (el.name) parts.push(`name="${el.name}"`);
      if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
      if (el.value) parts.push(`value="${el.value}"`);
      if (el.text && el.tag !== 'input' && el.tag !== 'textarea') parts.push(`"${el.text}"`);
      if (el.href) parts.push(`→ ${el.href.slice(0, 80)}`);
      if (el.options) {
        const opts = el.options.slice(0, 10).map((o) => `${o.value}="${o.text}"`).join(', ');
        parts.push(`options: [${opts}]`);
      }
      return parts.join(' ');
    })
    .join('\n');
}

async function handleBrowserNavigate(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const url = input.url as string;

  console.log('[browser] Launching session...');
  const t0 = Date.now();
  const page = await getOrCreateSession(member.id);
  console.log(`[browser] Session ready in ${Date.now() - t0}ms`);

  console.log(`[browser] Navigating to ${url}...`);
  const t1 = Date.now();
  await page.goto(url, { waitUntil: 'commit', timeout: 15000 });
  console.log(`[browser] Page committed in ${Date.now() - t1}ms`);
  // Brief wait for initial render
  await page.waitForTimeout(1500);

  console.log('[browser] Taking snapshot...');
  const t2 = Date.now();
  const snapshot = await getPageSnapshot(page);
  console.log(`[browser] Snapshot in ${Date.now() - t2}ms (${snapshot.elements.length} elements)`);

  return {
    success: true,
    data: {
      url: snapshot.url,
      title: snapshot.title,
      elements: formatElementList(snapshot.elements),
      element_count: snapshot.elements.length,
    },
    screenshot: snapshot.screenshot,
  };
}

async function handleBrowserClick(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const index = input.element_index as number;
  const page = await getOrCreateSession(member.id);

  await clickElement(page, index);

  const snapshot = await getPageSnapshot(page);
  return {
    success: true,
    data: {
      clicked: index,
      url: snapshot.url,
      title: snapshot.title,
      elements: formatElementList(snapshot.elements),
      element_count: snapshot.elements.length,
    },
    screenshot: snapshot.screenshot,
  };
}

async function handleBrowserType(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const index = input.element_index as number;
  const text = input.text as string;
  const clearFirst = (input.clear_first as boolean) ?? true;
  const page = await getOrCreateSession(member.id);

  await typeInElement(page, index, text, clearFirst);

  const snapshot = await getPageSnapshot(page);
  return {
    success: true,
    data: {
      typed_in: index,
      text_entered: text,
      url: snapshot.url,
      title: snapshot.title,
      elements: formatElementList(snapshot.elements),
      element_count: snapshot.elements.length,
    },
    screenshot: snapshot.screenshot,
  };
}

async function handleBrowserSelect(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const index = input.element_index as number;
  const value = input.value as string;
  const page = await getOrCreateSession(member.id);

  await selectOption(page, index, value);

  const snapshot = await getPageSnapshot(page);
  return {
    success: true,
    data: {
      selected: { element: index, value },
      url: snapshot.url,
      title: snapshot.title,
      elements: formatElementList(snapshot.elements),
      element_count: snapshot.elements.length,
    },
    screenshot: snapshot.screenshot,
  };
}

async function handleBrowserScroll(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const direction = input.direction as 'up' | 'down';
  const amount = (input.amount as number) || 500;
  const page = await getOrCreateSession(member.id);

  await page.evaluate(
    ({ dir, px }) => {
      window.scrollBy(0, dir === 'down' ? px : -px);
    },
    { dir: direction, px: amount }
  );

  await page.waitForTimeout(500);

  const snapshot = await getPageSnapshot(page);
  return {
    success: true,
    data: {
      scrolled: direction,
      pixels: amount,
      url: snapshot.url,
      title: snapshot.title,
      elements: formatElementList(snapshot.elements),
      element_count: snapshot.elements.length,
    },
    screenshot: snapshot.screenshot,
  };
}

async function handleBrowserClose(member: TeamMember): Promise<ToolResult> {
  await closeSession(member.id);
  return { success: true, data: { message: 'Browser session closed.' } };
}

// ─── Utility Handlers ───

function handleGetCurrentTime(): ToolResult {
  const now = new Date();
  return {
    success: true,
    data: {
      iso: now.toISOString(),
      mountain: now.toLocaleString('en-US', {
        timeZone: 'America/Denver',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      date: now.toLocaleDateString('en-CA', { timeZone: 'America/Denver' }),
      time: now.toLocaleTimeString('en-US', {
        timeZone: 'America/Denver',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    },
  };
}

async function handleNoteToSelf(
  input: Record<string, unknown>,
  member: TeamMember
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('agent_notes')
    .insert({
      team_member_id: member.id,
      content: input.content as string,
      category: (input.category as string) || 'work',
    })
    .select('id, content, category')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
