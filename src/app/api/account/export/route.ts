import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const admin = createAdminClient();
  const orgId = profile.org_id;

  const [
    { data: collections },
    { data: mediaItems },
    { data: locations },
    { data: aiAnalysis },
    { data: timestamps },
    { data: equipment },
    { data: ocr },
    { data: activity },
  ] = await Promise.all([
    admin.from('collections').select('*').eq('org_id', orgId),
    admin.from('media_items').select('*').eq('org_id', orgId),
    admin.from('media_locations').select('*').eq('org_id', orgId),
    admin.from('media_ai_analysis').select('*').eq('org_id', orgId),
    admin.from('media_timestamps').select('*').eq('org_id', orgId),
    admin.from('media_equipment').select('*').eq('org_id', orgId),
    admin.from('media_ocr').select('*').eq('org_id', orgId),
    admin.from('activity_events').select('*').eq('org_id', orgId),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    user_id: user.id,
    email: user.email,
    collections: collections || [],
    media_items: mediaItems || [],
    locations: locations || [],
    ai_analysis: aiAnalysis || [],
    timestamps: timestamps || [],
    equipment: equipment || [],
    ocr: ocr || [],
    activity_events: activity || [],
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="phototrail-export-${new Date().toISOString().split('T')[0]}.json"`,
    },
  });
}
