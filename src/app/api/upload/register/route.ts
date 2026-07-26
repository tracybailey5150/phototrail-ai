import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity';
import { processMediaItem } from '@/lib/media/process';

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const { mediaId, collectionId, filename, contentType, fileSize, storagePath } = await request.json();
  if (!mediaId || !collectionId || !filename || !storagePath) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify collection belongs to this org
  const { data: collection } = await admin.from('collections')
    .select('id').eq('id', collectionId).eq('org_id', profile.org_id).single();
  if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

  // Create media item record
  const { error: insertError } = await admin.from('media_items').insert({
    id: mediaId,
    collection_id: collectionId,
    org_id: profile.org_id,
    uploaded_by: user.id,
    original_filename: filename,
    original_mime_type: contentType || 'application/octet-stream',
    file_size: fileSize || 0,
    original_storage_path: storagePath,
    processing_status: 'pending',
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await logActivity({
    orgId: profile.org_id,
    actorId: user.id,
    type: 'media.uploaded',
    title: `Uploaded ${filename}`,
    entityType: 'collection',
    entityId: collectionId,
  });

  // Trigger processing in background
  processMediaItem(mediaId).catch(() => {});

  return NextResponse.json({ ok: true, mediaId });
}
