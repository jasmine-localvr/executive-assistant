import { google } from 'googleapis';
import { getAuthedClient } from './gmail';
import type { TeamMember } from '@/types';

export interface CalendarEvent {
  title: string;
  startTime: string | null; // ISO string, null for all-day
  endTime: string | null;
  allDay: boolean;
  attendees: string[]; // display names or emails
  externalAttendees: string[]; // non-@golocalvr.com attendee names
  meetLink: string | null;
  location: string | null;
  responseStatus: 'accepted' | 'tentative' | 'needsAction' | null;
  eventId: string;
}

/**
 * Fetch events for a given day from a team member's primary Google Calendar.
 * Defaults to today. Pass a date string (YYYY-MM-DD) to fetch a different day.
 * Returns events sorted by start time, excluding declined events.
 */
export async function fetchTodayEvents(
  member: TeamMember,
  dateOverride?: string
): Promise<CalendarEvent[]> {
  const auth = await getAuthedClient(member);
  const calendar = google.calendar({ version: 'v3', auth });

  const tz = 'America/Denver';
  let todayStart: Date;

  if (dateOverride) {
    // Parse YYYY-MM-DD directly (treat as local date in Mountain Time)
    const [y, m, d] = dateOverride.split('-').map(Number);
    todayStart = new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00`);
  } else {
    const now = new Date();
    todayStart = new Date(
      now.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    );
  }

  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: todayStart.toISOString(),
    timeMax: todayEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: tz,
  });

  const items = response.data.items ?? [];

  const events: CalendarEvent[] = [];
  for (const item of items) {
    // Skip declined events
    const selfAttendee = item.attendees?.find(
      (a) => a.self === true
    );
    if (selfAttendee?.responseStatus === 'declined') continue;

    const allDay = !!item.start?.date;
    const startTime = item.start?.dateTime ?? null;
    const endTime = item.end?.dateTime ?? null;

    // Extract attendee names (first name only), exclude self
    const otherAttendees = (item.attendees ?? [])
      .filter((a) => !a.self && !a.resource);

    const attendees = otherAttendees
      .map((a) => {
        if (a.displayName) {
          return a.displayName.split(' ')[0];
        }
        return (a.email ?? '').split('@')[0];
      })
      .filter(Boolean);

    // External attendees: anyone not @golocalvr.com
    const externalAttendees = otherAttendees
      .filter((a) => {
        const email = (a.email ?? '').toLowerCase();
        return email && !email.endsWith('@golocalvr.com');
      })
      .map((a) => {
        if (a.displayName) return a.displayName.split(' ')[0];
        return (a.email ?? '').split('@')[0];
      })
      .filter(Boolean);

    // Find video conference link
    const meetLink =
      item.hangoutLink ??
      item.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === 'video'
      )?.uri ??
      null;

    // Self response status
    const responseStatus = (selfAttendee?.responseStatus as CalendarEvent['responseStatus']) ?? null;

    events.push({
      title: item.summary ?? '(No title)',
      startTime,
      endTime,
      allDay,
      attendees,
      externalAttendees,
      meetLink,
      location: item.location ?? null,
      responseStatus,
      eventId: item.id ?? '',
    });
  }

  return events;
}

/**
 * RSVP to a calendar event (accept or decline).
 */
export async function rsvpToEvent(
  member: TeamMember,
  eventId: string,
  response: 'accepted' | 'declined'
): Promise<void> {
  const auth = await getAuthedClient(member);
  const calendar = google.calendar({ version: 'v3', auth });

  const event = await calendar.events.get({ calendarId: 'primary', eventId });
  const attendees = (event.data.attendees ?? []).map((a) => {
    if (a.self) return { ...a, responseStatus: response };
    return a;
  });

  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: { attendees },
  });
}
