import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { runTriagePipeline } from '@/lib/pipeline';

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron (in production)
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get all active team members with Gmail connected
  const { data: members, error } = await supabase
    .from('team_members')
    .select('id, name')
    .eq('is_active', true)
    .not('gmail_refresh_token', 'is', null);

  if (error || !members?.length) {
    return NextResponse.json({
      message: 'No active members with Gmail connected',
    });
  }

  const results = [];
  for (const member of members) {
    try {
      const result = await runTriagePipeline(member.id, { emailCount: 20 });
      results.push({ memberId: member.id, name: member.name, ...result });
    } catch (err) {
      results.push({
        memberId: member.id,
        name: member.name,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ runs: results });
}
