import { createAdminClient } from '@/lib/supabase/admin';
import { computeSha256 } from './hash';
import { extractMetadata } from './exif';
import { generateThumbnail, generatePreview, getImageDimensions } from './thumbnails';
import { isImage, isScreenshot } from './detect';

interface ProcessResult {
  success: boolean;
  error?: string;
}

export async function processMediaItem(mediaItemId: string): Promise<ProcessResult> {
  const admin = createAdminClient();

  // Mark as processing
  await admin.from('media_items').update({
    processing_status: 'processing',
    processing_started_at: new Date().toISOString(),
  }).eq('id', mediaItemId);

  try {
    // Get the media item
    const { data: item } = await admin.from('media_items').select('*').eq('id', mediaItemId).single();
    if (!item) return { success: false, error: 'Media item not found' };

    // Download original from storage
    const { data: fileData, error: dlError } = await admin.storage
      .from('originals')
      .download(item.original_storage_path);

    if (dlError || !fileData) {
      await updateStep(admin, mediaItemId, item.org_id, 'download', 'failed', dlError?.message);
      throw new Error(`Download failed: ${dlError?.message}`);
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Step 1: SHA-256 hash
    await updateStep(admin, mediaItemId, item.org_id, 'hash', 'running');
    const sha256 = computeSha256(buffer);
    await updateStep(admin, mediaItemId, item.org_id, 'hash', 'completed', undefined, { sha256 });

    // Check for exact duplicates
    const { data: existing } = await admin.from('media_items')
      .select('id')
      .eq('collection_id', item.collection_id)
      .eq('sha256_hash', sha256)
      .neq('id', mediaItemId)
      .limit(1);

    const isDuplicate = existing && existing.length > 0;

    await admin.from('media_items').update({
      sha256_hash: sha256,
      is_duplicate: isDuplicate,
      duplicate_of: isDuplicate ? existing[0].id : null,
    }).eq('id', mediaItemId);

    // Step 2: EXIF extraction
    await updateStep(admin, mediaItemId, item.org_id, 'exif', 'running');
    let width = item.width;
    let height = item.height;

    if (isImage(item.original_mime_type)) {
      const metadata = await extractMetadata(buffer);

      // Get dimensions from sharp if not in EXIF
      if (!metadata.width || !metadata.height) {
        const dims = await getImageDimensions(buffer);
        metadata.width = dims.width;
        metadata.height = dims.height;
      }

      width = metadata.width || null;
      height = metadata.height || null;

      await admin.from('media_items').update({
        width,
        height,
        orientation: metadata.orientation || null,
        capture_time: metadata.captureTime?.toISOString() || null,
        capture_time_source: metadata.captureTimeSource || null,
        gps_latitude: metadata.gpsLatitude || null,
        gps_longitude: metadata.gpsLongitude || null,
        gps_altitude: metadata.gpsAltitude || null,
        gps_direction: metadata.gpsDirection || null,
        exif_data: metadata.raw,
        is_screenshot: isScreenshot(item.original_filename, width ?? undefined, height ?? undefined),
      }).eq('id', mediaItemId);

      await updateStep(admin, mediaItemId, item.org_id, 'exif', 'completed', undefined, {
        hasGps: !!(metadata.gpsLatitude && metadata.gpsLongitude),
        hasCaptureTime: !!metadata.captureTime,
        camera: metadata.cameraModel || null,
      });
    } else {
      await updateStep(admin, mediaItemId, item.org_id, 'exif', 'skipped');
    }

    // Step 3: Thumbnails
    if (isImage(item.original_mime_type)) {
      await updateStep(admin, mediaItemId, item.org_id, 'thumbnails', 'running');

      const thumbResult = await generateThumbnail(buffer);
      const previewResult = await generatePreview(buffer);

      const thumbPath = `${item.org_id}/${item.collection_id}/thumb_${item.id}.jpg`;
      const previewPath = `${item.org_id}/${item.collection_id}/preview_${item.id}.jpg`;

      await admin.storage.from('derivatives').upload(thumbPath, thumbResult.buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

      await admin.storage.from('derivatives').upload(previewPath, previewResult.buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

      await admin.from('media_items').update({
        thumbnail_path: thumbPath,
        preview_path: previewPath,
        width: width || previewResult.width,
        height: height || previewResult.height,
      }).eq('id', mediaItemId);

      await updateStep(admin, mediaItemId, item.org_id, 'thumbnails', 'completed');
    } else {
      await updateStep(admin, mediaItemId, item.org_id, 'thumbnails', 'skipped');
    }

    // Update collection item count
    const { count } = await admin.from('media_items')
      .select('*', { count: 'exact', head: true })
      .eq('collection_id', item.collection_id)
      .eq('is_duplicate', false);

    await admin.from('collections').update({
      item_count: count || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', item.collection_id);

    // Mark completed
    await admin.from('media_items').update({
      processing_status: 'completed',
      processing_completed_at: new Date().toISOString(),
    }).eq('id', mediaItemId);

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    await admin.from('media_items').update({
      processing_status: 'failed',
      processing_error: errorMsg,
      processing_completed_at: new Date().toISOString(),
    }).eq('id', mediaItemId);
    return { success: false, error: errorMsg };
  }
}

async function updateStep(
  admin: ReturnType<typeof createAdminClient>,
  mediaItemId: string,
  orgId: string,
  step: string,
  status: string,
  error?: string,
  result?: Record<string, unknown>
) {
  const { data: existing } = await admin.from('processing_jobs')
    .select('id')
    .eq('media_item_id', mediaItemId)
    .eq('step', step)
    .limit(1);

  if (existing && existing.length > 0) {
    await admin.from('processing_jobs').update({
      status,
      error: error || null,
      result: result || null,
      ...(status === 'running' ? { started_at: new Date().toISOString() } : {}),
      ...(status === 'completed' || status === 'failed' ? { completed_at: new Date().toISOString() } : {}),
    }).eq('id', existing[0].id);
  } else {
    await admin.from('processing_jobs').insert({
      media_item_id: mediaItemId,
      org_id: orgId,
      step,
      status,
      error: error || null,
      result: result || null,
      ...(status === 'running' ? { started_at: new Date().toISOString() } : {}),
      ...(status === 'completed' || status === 'failed' ? { completed_at: new Date().toISOString() } : {}),
    });
  }
}
