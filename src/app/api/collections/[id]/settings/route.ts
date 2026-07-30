import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const admin = createAdminClient();

  // Verify collection belongs to org
  const { data: collection } = await admin
    .from('collections')
    .select('id')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .single();
  if (!collection) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: settings } = await admin
    .from('collection_settings')
    .select('*')
    .eq('collection_id', id)
    .single();

  return NextResponse.json({ settings: settings || null });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const admin = createAdminClient();

  // Verify collection belongs to org
  const { data: collection } = await admin
    .from('collections')
    .select('id')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .single();
  if (!collection) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();

  // Extract allowed fields
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.auto_group === 'boolean') update.auto_group = body.auto_group;
  if (typeof body.ai_analysis === 'boolean') update.ai_analysis = body.ai_analysis;
  if (typeof body.extract_gps === 'boolean') update.extract_gps = body.extract_gps;
  if (typeof body.extract_serial_numbers === 'boolean') update.extract_serial_numbers = body.extract_serial_numbers;
  if (typeof body.default_confidence_threshold === 'number') update.default_confidence_threshold = body.default_confidence_threshold;
  if (body.ai_context !== undefined) {
    // Merge ai_context into the settings JSONB
    const { data: existing } = await admin
      .from('collection_settings')
      .select('settings')
      .eq('collection_id', id)
      .single();
    const currentSettings = (existing?.settings || {}) as Record<string, unknown>;
    update.settings = { ...currentSettings, ai_context: body.ai_context };
  }

  // Upsert — create if doesn't exist
  const { data: existingRow } = await admin
    .from('collection_settings')
    .select('id')
    .eq('collection_id', id)
    .single();

  let settings;
  if (existingRow) {
    const { data, error } = await admin
      .from('collection_settings')
      .update(update)
      .eq('collection_id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    settings = data;
  } else {
    const { data, error } = await admin
      .from('collection_settings')
      .insert({ collection_id: id, org_id: profile.org_id, ...update })
      .select()
      .single();
    if (error) return NextResponse.json({ error: 'Failed to create settings' }, { status: 500 });
    settings = data;
  }

  return NextResponse.json({ settings });
}
