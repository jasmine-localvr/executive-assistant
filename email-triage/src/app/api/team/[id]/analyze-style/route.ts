import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fetchSentEmails } from '@/lib/gmail';
import { analyzeEmailStyle } from '@/lib/claude';
import type { TeamMember } from '@/types';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { data: member, error: memberError } = await supabase
      .from('team_members')
      .select('*')
      .eq('id', id)
      .single();

    if (memberError || !member) {
      return NextResponse.json(
        { error: 'Team member not found' },
        { status: 404 }
      );
    }

    if (!member.gmail_refresh_token) {
      return NextResponse.json(
        { error: 'Gmail not connected for this team member' },
        { status: 400 }
      );
    }

    const sentEmails = await fetchSentEmails(member as TeamMember, 20);

    if (sentEmails.length === 0) {
      return NextResponse.json(
        { error: 'No sent emails found to analyze' },
        { status: 400 }
      );
    }

    const style = await analyzeEmailStyle(
      sentEmails.map((e) => ({
        subject: e.subject,
        to: e.to,
        body: e.body,
      }))
    );

    return NextResponse.json({ style });
  } catch (err) {
    console.error('Style analysis error:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to analyze email style',
      },
      { status: 500 }
    );
  }
}
