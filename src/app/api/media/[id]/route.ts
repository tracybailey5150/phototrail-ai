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
  const { data: item } = await admin.from('media_items')
    .select('*')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .single();

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Get processing jobs
  const { data: jobs } = await admin.from('processing_jobs')
    .select('*')
    .eq('media_item_id', id)
    .order('created_at', { ascending: true });

  // Generate signed URL for the original
  let originalUrl: string | null = null;
  if (item.original_storage_path) {
    const { data: signedData } = await admin.storage
      .from('originals')
      .createSignedUrl(item.original_storage_path, 3600);
    originalUrl = signedData?.signedUrl || null;
  }

  // Public URL for thumbnail/preview
  let thumbnailUrl: string | null = null;
  let previewUrl: string | null = null;
  if (item.thumbnail_path) {
    const { data: thumbData } = admin.storage.from('derivatives').getPublicUrl(item.thumbnail_path);
    thumbnailUrl = thumbData?.publicUrl || null;
  }
  if (item.preview_path) {
    const { data: prevData } = admin.storage.from('derivatives').getPublicUrl(item.preview_path);
    previewUrl = prevData?.publicUrl || null;
  }

  return NextResponse.json({
    item,
    jobs: jobs || [],
    urls: { original: originalUrl, thumbnail: thumbnailUrl, preview: previewUrl },
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const admin = createAdminClient();
  const { data: item } = await admin.from('media_items')
    .select('original_storage_path, thumbnail_path, preview_path, collection_id')
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .single();

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete storage files
  if (item.original_storage_path) {
    await admin.storage.from('originals').remove([item.original_storage_path]);
  }
  if (item.thumbnail_path) {
    await admin.storage.from('derivatives').remove([item.thumbnail_path]);
  }
  if (item.preview_path) {
    await admin.storage.from('derivatives').remove([item.preview_path]);
  }

  // Delete DB record (cascades to processing_jobs)
  await admin.from('media_items').delete().eq('id', id);

  // Update collection count
  const { count } = await admin.from('media_items')
    .select('*', { count: 'exact', head: true })
    .eq('collection_id', item.collection_id)
    .eq('is_duplicate', false);

  await admin.from('collections').update({
    item_count: count || 0,
    updated_at: new Date().toISOString(),
  }).eq('id', item.collection_id);

  return NextResponse.json({ ok: true });
}
