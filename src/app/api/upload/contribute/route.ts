import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processMediaItem } from '@/lib/media/process';

export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { mediaId, collectionId, token, filename, contentType, fileSize, storagePath } = await request.json();
  if (!mediaId || !collectionId || !token || !filename || !storagePath) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Validate the share token
  const { data: share } = await admin.from('collection_shares')
    .select('id, collection_id, org_id, permissions, is_active, expires_at, max_uses, use_count')
    .eq('token', token)
    .eq('collection_id', collectionId)
    .single();

  if (!share || !share.is_active) {
    return NextResponse.json({ error: 'Invalid or expired share link' }, { status: 403 });
  }

  if (share.permissions !== 'contribute') {
    return NextResponse.json({ error: 'This link is view-only' }, { status: 403 });
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Share link has expired' }, { status: 403 });
  }

  if (share.max_uses && share.use_count >= share.max_uses) {
    return NextResponse.json({ error: 'Share link usage limit reached' }, { status: 403 });
  }

  // Get contributor name
  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', user.id).single();

  // Create media item with contributor tracking
  const { error: insertError } = await admin.from('media_items').insert({
    id: mediaId,
    collection_id: collectionId,
    org_id: share.org_id,
    uploaded_by: user.id,
    original_filename: filename,
    original_mime_type: contentType || 'application/octet-stream',
    file_size: fileSize || 0,
    original_storage_path: storagePath,
    processing_status: 'pending',
    contributor_id: user.id,
    contributor_name: profile?.full_name || user.email || 'Unknown contributor',
    contributed_via: `share:${share.id}`,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Increment share use count
  await admin.from('collection_shares')
    .update({ use_count: share.use_count + 1 })
    .eq('id', share.id);

  // Trigger processing
  processMediaItem(mediaId).catch(() => {});

  return NextResponse.json({ ok: true, mediaId });
}
