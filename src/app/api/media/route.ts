import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ items: [] });

  const { searchParams } = new URL(request.url);
  const collectionId = searchParams.get('collection_id');
  const status = searchParams.get('status');

  const admin = createAdminClient();
  let query = admin.from('media_items')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('upload_time', { ascending: false });

  if (collectionId) query = query.eq('collection_id', collectionId);
  if (status) query = query.eq('processing_status', status);

  const { data: items, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 });

  return NextResponse.json({ items: items || [] });
}
