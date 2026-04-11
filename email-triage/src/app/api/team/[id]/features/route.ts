import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const FEATURE_COLUMNS =
  'id, name, email, feature_inbox_management, feature_inbox_summaries, summary_weekly_schedule, summary_daily_summaries, summary_update_frequency, feature_inbox_drafting, email_style, feature_calendar_scheduling, scheduling_link, ea_custom_instructions, sms_phone_number, home_address, work_address, investment_property_addresses';

const ALLOWED_FIELDS = [
  'feature_inbox_management',
  'feature_inbox_summaries',
  'summary_weekly_schedule',
  'summary_daily_summaries',
  'summary_update_frequency',
  'feature_inbox_drafting',
  'email_style',
  'feature_calendar_scheduling',
  'scheduling_link',
  'ea_custom_instructions',
  'sms_phone_number',
  'home_address',
  'work_address',
  'investment_property_addresses',
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabase
    .from('team_members')
    .select(FEATURE_COLUMNS)
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Failed to fetch feature settings' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('team_members')
      .update(updates)
      .eq('id', id)
      .select(FEATURE_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update features' },
      { status: 500 }
    );
  }
}
