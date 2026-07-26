import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { groupTravelCollection, groupProjectCollection } from '@/lib/media/grouping';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const admin = createAdminClient();
  const { data: collection } = await admin.from('collections')
    .select('id, mode, org_id')
    .eq('id', id).eq('org_id', profile.org_id).single();

  if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

  try {
    if (collection.mode === 'travel') {
      await groupTravelCollection(id, profile.org_id);
    } else {
      await groupProjectCollection(id, profile.org_id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Grouping failed' }, { status: 500 });
  }
}
