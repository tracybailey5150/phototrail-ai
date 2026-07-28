import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const admin = createAdminClient();
  const orgId = profile.org_id;

  // Delete storage files
  const { data: mediaItems } = await admin.from('media_items').select('original_storage_path, thumbnail_path, preview_path').eq('org_id', orgId);

  if (mediaItems && mediaItems.length > 0) {
    const originals = mediaItems.map(m => m.original_storage_path).filter(Boolean);
    const derivatives = [
      ...mediaItems.map(m => m.thumbnail_path).filter(Boolean),
      ...mediaItems.map(m => m.preview_path).filter(Boolean),
    ];

    if (originals.length > 0) {
      // Delete in batches of 100
      for (let i = 0; i < originals.length; i += 100) {
        await admin.storage.from('originals').remove(originals.slice(i, i + 100));
      }
    }
    if (derivatives.length > 0) {
      for (let i = 0; i < derivatives.length; i += 100) {
        await admin.storage.from('derivatives').remove(derivatives.slice(i, i + 100));
      }
    }
  }

  // Delete all data tables in dependency order
  const mediaIds = (mediaItems || []).map(m => m.original_storage_path).length > 0
    ? (await admin.from('media_items').select('id').eq('org_id', orgId)).data?.map(m => m.id) || []
    : [];

  if (mediaIds.length > 0) {
    for (let i = 0; i < mediaIds.length; i += 100) {
      const batch = mediaIds.slice(i, i + 100);
      await Promise.all([
        admin.from('media_equipment').delete().in('media_item_id', batch),
        admin.from('media_ocr').delete().in('media_item_id', batch),
        admin.from('media_ai_analysis').delete().in('media_item_id', batch),
        admin.from('media_timestamps').delete().in('media_item_id', batch),
        admin.from('media_locations').delete().in('media_item_id', batch),
        admin.from('processing_jobs').delete().in('media_item_id', batch),
      ]);
    }
  }

  await admin.from('media_items').delete().eq('org_id', orgId);
  await admin.from('collection_settings').delete().eq('org_id', orgId);
  try { await admin.from('collection_shares').delete().eq('org_id', orgId); } catch { /* table may not exist */ }
  await admin.from('collections').delete().eq('org_id', orgId);
  await admin.from('activity_events').delete().eq('org_id', orgId);
  await admin.from('organization_members').delete().eq('org_id', orgId);
  await admin.from('profiles').delete().eq('org_id', orgId);
  await admin.from('organizations').delete().eq('id', orgId);

  // Sign the user out
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
