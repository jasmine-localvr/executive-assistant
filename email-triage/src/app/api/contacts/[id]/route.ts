import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name, type, email, phone, address, notes, last_appointment } = body as {
    name?: string;
    type?: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
    last_appointment?: string | null;
  };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (name !== undefined) updates.name = name.trim();
  if (type !== undefined) updates.type = type.trim().toLowerCase();
  if (email !== undefined) updates.email = email?.trim() || null;
  if (phone !== undefined) updates.phone = phone?.trim() || null;
  if (address !== undefined) updates.address = address?.trim() || null;
  if (notes !== undefined) updates.notes = notes?.trim() || null;
  if (last_appointment !== undefined) updates.last_appointment = last_appointment || null;

  const { data, error } = await supabase
    .from('ea_contacts')
    .update(updates)
    .eq('id', id)
    .eq('team_member_id', session.user.teamMemberId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

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
    .from('ea_contacts')
    .delete()
    .eq('id', id)
    .eq('team_member_id', session.user.teamMemberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
