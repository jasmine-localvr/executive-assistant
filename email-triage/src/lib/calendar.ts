import { google } from 'googleapis';
import { getAuthedClient } from './gmail';
import type { TeamMember } from '@/types';

export interface CalendarEvent {
  title: string;
  startTime: string | null; // ISO string, null for all-day
  endTime: string | null;
  allDay: boolean;
  attendees: string[]; // display names or emails
  meetLink: string | null;
  location: string | null;
}

/**
 * Fetch today's events from a team member's primary Google Calendar.
 * Returns events sorted by start time, excluding declined events.
 */
export async function fetchTodayEvents(
  member: TeamMember
): Promise<CalendarEvent[]> {
  const auth = await getAuthedClient(member);
  const calendar = google.calendar({ version: 'v3', auth });

  // Today in Mountain Time
  const tz = 'America/Denver';
  const now = new Date();
  const todayStart = new Date(
    now.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  );
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
    const attendees = (item.attendees ?? [])
      .filter((a) => !a.self && !a.resource)
      .map((a) => {
        if (a.displayName) {
          return a.displayName.split(' ')[0];
        }
        // Fall back to email prefix
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

    events.push({
      title: item.summary ?? '(No title)',
      startTime,
      endTime,
      allDay,
      attendees,
      meetLink,
      location: item.location ?? null,
    });
  }

  return events;
}
