import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processMediaItem } from '@/lib/media/process';

export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { mediaId } = await request.json();
  if (!mediaId) return NextResponse.json({ error: 'mediaId required' }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const { data: item } = await admin.from('media_items')
    .select('id').eq('id', mediaId).eq('org_id', profile.org_id).single();
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Run processing synchronously — this function has 120s timeout
  const result = await processMediaItem(mediaId);

  return NextResponse.json(result);
}
