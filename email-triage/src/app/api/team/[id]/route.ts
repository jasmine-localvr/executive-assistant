import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await supabase
    .from('team_members')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to deactivate team member' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
