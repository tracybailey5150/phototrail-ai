import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const body = await request.json();
  const { media_item_id, action, data } = body as {
    media_item_id: string | string[];
    action: 'resolve' | 'skip' | 'set_date' | 'reprocess';
    data?: { capture_time?: string };
  };

  if (!media_item_id || !action) {
    return NextResponse.json({ error: 'Missing media_item_id or action' }, { status: 400 });
  }

  const admin = createAdminClient();
  const ids = Array.isArray(media_item_id) ? media_item_id : [media_item_id];

  if (action === 'resolve' || action === 'skip') {
    const { error } = await admin.from('media_items')
      .update({ needs_review: false, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('org_id', profile.org_id);

    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  } else if (action === 'set_date') {
    if (!data?.capture_time) {
      return NextResponse.json({ error: 'Missing capture_time' }, { status: 400 });
    }
    const { error } = await admin.from('media_items')
      .update({
        capture_time: data.capture_time,
        capture_time_source: 'user_confirmed',
        needs_review: false,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .eq('org_id', profile.org_id);

    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  } else if (action === 'reprocess') {
    const { error } = await admin.from('media_items')
      .update({
        processing_status: 'pending',
        processing_error: null,
        needs_review: false,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .eq('org_id', profile.org_id);

    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, count: ids.length });
}
