import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomBytes } from 'crypto';

// GET — list shares for a collection
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const { data: shares } = await admin.from('collection_shares')
    .select('*')
    .eq('collection_id', id)
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ shares: shares || [] });
}

// POST — create a share link
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  // Verify collection belongs to org
  const { data: collection } = await admin.from('collections')
    .select('id, name').eq('id', id).eq('org_id', profile.org_id).single();
  if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const token = randomBytes(16).toString('hex');

  const { data: share, error } = await admin.from('collection_shares').insert({
    collection_id: id,
    org_id: profile.org_id,
    token,
    created_by: user.id,
    label: body.label || null,
    permissions: body.permissions || 'contribute',
    expires_at: body.expires_at || null,
    max_uses: body.max_uses || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ share, url: `/share/${token}` });
}

// DELETE — revoke a share link
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const body = await request.json();
  await admin.from('collection_shares')
    .delete()
    .eq('id', body.shareId)
    .eq('org_id', profile.org_id);

  return NextResponse.json({ ok: true });
}
