import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ events: [] });

  const admin = createAdminClient();
  const { data: events } = await admin
    .from('activity_events')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ events: events || [] });
}
