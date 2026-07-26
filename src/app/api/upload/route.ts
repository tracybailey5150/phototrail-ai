import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity';
import { processMediaItem } from '@/lib/media/process';
import { v4 as uuidv4 } from 'uuid';

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const formData = await request.formData();
  const collectionId = formData.get('collection_id') as string;
  const files = formData.getAll('files') as File[];

  if (!collectionId) return NextResponse.json({ error: 'collection_id is required' }, { status: 400 });
  if (!files.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 });

  const admin = createAdminClient();

  // Verify collection belongs to this org
  const { data: collection } = await admin.from('collections')
    .select('id, org_id')
    .eq('id', collectionId)
    .eq('org_id', profile.org_id)
    .single();

  if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

  const results: { id: string; filename: string; status: string; error?: string }[] = [];

  for (const file of files) {
    const mediaId = uuidv4();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const storagePath = `${profile.org_id}/${collectionId}/${mediaId}.${ext}`;

    try {
      // Upload to private bucket
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await admin.storage
        .from('originals')
        .upload(storagePath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });

      if (uploadError) {
        results.push({ id: mediaId, filename: file.name, status: 'error', error: uploadError.message });
        continue;
      }

      // Create media item record
      const { error: insertError } = await admin.from('media_items').insert({
        id: mediaId,
        collection_id: collectionId,
        org_id: profile.org_id,
        uploaded_by: user.id,
        original_filename: file.name,
        original_mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
        original_storage_path: storagePath,
        processing_status: 'pending',
      });

      if (insertError) {
        results.push({ id: mediaId, filename: file.name, status: 'error', error: insertError.message });
        continue;
      }

      results.push({ id: mediaId, filename: file.name, status: 'uploaded' });

      // Process asynchronously (don't await — let it run in background)
      processMediaItem(mediaId).catch(() => {});
    } catch (err) {
      results.push({
        id: mediaId,
        filename: file.name,
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  }

  const successCount = results.filter(r => r.status === 'uploaded').length;
  if (successCount > 0) {
    await logActivity({
      orgId: profile.org_id,
      actorId: user.id,
      type: 'media.uploaded',
      title: `Uploaded ${successCount} file${successCount > 1 ? 's' : ''}`,
      entityType: 'collection',
      entityId: collectionId,
    });
  }

  return NextResponse.json({ results, uploaded: successCount, total: files.length });
}
