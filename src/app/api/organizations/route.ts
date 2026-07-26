import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createOrgSchema } from '@/lib/validators';
import { logActivity } from '@/lib/activity';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = createOrgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const admin = createAdminClient();
  const slug = parsed.data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) + '-' + Date.now().toString(36);

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: parsed.data.name, slug })
    .select()
    .single();

  if (orgError) {
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }

  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      id: user.id,
      org_id: org.id,
      full_name: parsed.data.full_name,
      role: 'owner',
    });

  if (profileError) {
    await admin.from('organizations').delete().eq('id', org.id);
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
  }

  await admin.from('organization_members').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'owner',
  });

  await logActivity({
    orgId: org.id,
    actorId: user.id,
    type: 'org.created',
    title: 'Organization created',
    description: `${parsed.data.full_name} created ${parsed.data.name}`,
    entityType: 'organization',
    entityId: org.id,
  });

  return NextResponse.json({ organization: org });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 404 });
  }

  const { data: org } = await admin
    .from('organizations')
    .select('*')
    .eq('id', profile.org_id)
    .single();

  return NextResponse.json({ organization: org });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('org_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 404 });
  }

  const body = await request.json();
  const { name } = body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name) updates.name = name;

  const { data: org, error } = await admin
    .from('organizations')
    .update(updates)
    .eq('id', profile.org_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 });

  await logActivity({
    orgId: profile.org_id,
    actorId: user.id,
    type: 'org.updated',
    title: 'Organization updated',
    entityType: 'organization',
    entityId: profile.org_id,
  });

  return NextResponse.json({ organization: org });
}
