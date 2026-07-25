import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateCollectionSchema } from '@/lib/validators';
import { logActivity } from '@/lib/activity';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const admin = createAdminClient();
  const { data: collection } = await admin
    .from('collections')
    .select('*')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .single();

  if (!collection) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: settings } = await admin
    .from('collection_settings')
    .select('*')
    .eq('collection_id', id)
    .single();

  return NextResponse.json({ collection, settings });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const body = await request.json();
  const parsed = updateCollectionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const admin = createAdminClient();
  const { data: collection, error } = await admin
    .from('collections')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .select()
    .single();

  if (error || !collection) return NextResponse.json({ error: 'Failed to update' }, { status: 500 });

  await logActivity({
    orgId: profile.org_id,
    actorId: user.id,
    type: 'collection.updated',
    title: `Collection updated: ${collection.name}`,
    entityType: 'collection',
    entityId: id,
  });

  return NextResponse.json({ collection });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id, role').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('collections')
    .delete()
    .eq('id', id)
    .eq('org_id', profile.org_id);

  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });

  await logActivity({
    orgId: profile.org_id,
    actorId: user.id,
    type: 'collection.deleted',
    title: 'Collection deleted',
    entityType: 'collection',
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
