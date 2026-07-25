import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCollectionSchema } from '@/lib/validators';
import { logActivity } from '@/lib/activity';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ collections: [] });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');
  const status = searchParams.get('status') || 'active';

  const admin = createAdminClient();
  let query = admin
    .from('collections')
    .select('*')
    .eq('org_id', profile.org_id)
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (mode) {
    query = query.eq('mode', mode);
  }

  const { data: collections, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 });
  }

  return NextResponse.json({ collections: collections || [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 400 });
  }

  const body = await request.json();
  const parsed = createCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: collection, error } = await admin
    .from('collections')
    .insert({
      org_id: profile.org_id,
      created_by: user.id,
      ...parsed.data,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }

  await admin.from('collection_settings').insert({
    collection_id: collection.id,
    org_id: profile.org_id,
    extract_serial_numbers: parsed.data.mode === 'project',
  });

  await logActivity({
    orgId: profile.org_id,
    actorId: user.id,
    type: 'collection.created',
    title: `Collection created: ${parsed.data.name}`,
    description: `${parsed.data.mode} collection`,
    entityType: 'collection',
    entityId: collection.id,
  });

  return NextResponse.json({ collection }, { status: 201 });
}
