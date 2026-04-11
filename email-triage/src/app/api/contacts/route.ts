import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('ea_contacts')
    .select('*')
    .eq('team_member_id', session.user.teamMemberId)
    .order('type')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.teamMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, type, email, phone, address, notes } = body as {
    name: string;
    type: string;
    email?: string;
    phone?: string;
    address?: string;
    notes?: string;
  };

  if (!name?.trim() || !type?.trim()) {
    return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('ea_contacts')
    .insert({
      team_member_id: session.user.teamMemberId,
      name: name.trim(),
      type: type.trim().toLowerCase(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
