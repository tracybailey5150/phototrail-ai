import { createAdminClient } from '@/lib/supabase/admin';
import { computeSha256 } from './hash';
import { extractMetadata } from './exif';
import { generateThumbnail, generatePreview, getImageDimensions } from './thumbnails';
import { isImage, isScreenshot } from './detect';
import { reverseGeocode, lookupTimezone } from './geocode';
import { resolveTimestamp, inferDateFromFilename } from './timestamp';
import { analyzeImage, extractOcr } from './ai-analysis';

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

    // Download original from storage (Supabase or R2)
    let buffer: Buffer;
    const isR2 = item.original_storage_path.startsWith('phototrail/');

    if (isR2) {
      // R2 direct upload — fetch from public R2 URL
      const r2Base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').replace(/\/$/, '');
      const r2Url = `${r2Base}/${item.original_storage_path}`;
      const r2Res = await fetch(r2Url);
      if (!r2Res.ok) {
        await updateStep(admin, mediaItemId, item.org_id, 'download', 'failed', `R2 download failed: ${r2Res.status}`);
        throw new Error(`R2 download failed: ${r2Res.status}`);
      }
      buffer = Buffer.from(await r2Res.arrayBuffer());
    } else {
      // Supabase Storage
      const { data: fileData, error: dlError } = await admin.storage
        .from('originals')
        .download(item.original_storage_path);

      if (dlError || !fileData) {
        await updateStep(admin, mediaItemId, item.org_id, 'download', 'failed', dlError?.message);
        throw new Error(`Download failed: ${dlError?.message}`);
      }
      buffer = Buffer.from(await fileData.arrayBuffer());
    }

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

      await admin.storage.from('derivatives').upload(thumbPath, new Uint8Array(thumbResult.buffer), {
        contentType: 'image/jpeg',
        upsert: true,
      });

      await admin.storage.from('derivatives').upload(previewPath, new Uint8Array(previewResult.buffer), {
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

    // Step 4: Timestamp resolution
    await updateStep(admin, mediaItemId, item.org_id, 'timestamp', 'running');
    {
      const filenameDate = inferDateFromFilename(item.original_filename);

      // Re-read item for updated EXIF data (now properly serialized)
      const { data: updated } = await admin.from('media_items').select('exif_data, capture_time').eq('id', mediaItemId).single();
      const exifData = (updated?.exif_data || {}) as Record<string, unknown>;

      // Use the capture_time already extracted by EXIF step as a reliable source
      const exifCaptureTime = updated?.capture_time ? new Date(updated.capture_time) : null;

      const resolved = resolveTimestamp({
        exifDateTimeOriginal: exifData.DateTimeOriginal ? new Date(exifData.DateTimeOriginal as string) : exifCaptureTime,
        exifCreateDate: exifData.CreateDate ? new Date(exifData.CreateDate as string) : null,
        exifDigitized: exifData.DateTimeDigitized ? new Date(exifData.DateTimeDigitized as string) : null,
        exifModifyDate: exifData.ModifyDate ? new Date(exifData.ModifyDate as string) : null,
        fileCreated: null,
        fileModified: null,
        filenameInferred: filenameDate,
        userCorrected: null,
        uploadTime: new Date(item.upload_time),
      });

      await admin.from('media_timestamps').upsert({
        media_item_id: mediaItemId,
        org_id: item.org_id,
        exif_datetime_original: exifData.DateTimeOriginal ? new Date(exifData.DateTimeOriginal as string).toISOString() : (exifCaptureTime?.toISOString() || null),
        exif_create_date: exifData.CreateDate ? new Date(exifData.CreateDate as string).toISOString() : null,
        exif_digitized: exifData.DateTimeDigitized ? new Date(exifData.DateTimeDigitized as string).toISOString() : null,
        exif_modify_date: exifData.ModifyDate ? new Date(exifData.ModifyDate as string).toISOString() : null,
        filename_inferred: filenameDate?.toISOString() || null,
        best_capture_time: resolved.bestCaptureTime.toISOString(),
        capture_time_source: resolved.source,
        capture_time_confidence: resolved.confidence,
        resolution_explanation: resolved.explanation,
        needs_review: resolved.needsReview,
      }, { onConflict: 'media_item_id' });

      // Update media_items with the best time
      await admin.from('media_items').update({
        capture_time: resolved.bestCaptureTime.toISOString(),
        capture_time_source: resolved.source,
      }).eq('id', mediaItemId);

      await updateStep(admin, mediaItemId, item.org_id, 'timestamp', 'completed', undefined, {
        source: resolved.source,
        confidence: resolved.confidence,
        needsReview: resolved.needsReview,
      });
    }

    // Step 5: Location resolution (reverse geocode + timezone)
    {
      const { data: latest } = await admin.from('media_items').select('gps_latitude, gps_longitude').eq('id', mediaItemId).single();
      const lat = latest?.gps_latitude;
      const lon = latest?.gps_longitude;

      if (lat != null && lon != null) {
        await updateStep(admin, mediaItemId, item.org_id, 'geocode', 'running');

        const [geo, tz] = await Promise.all([
          reverseGeocode(lat, lon),
          lookupTimezone(lat, lon),
        ]);

        await admin.from('media_locations').upsert({
          media_item_id: mediaItemId,
          org_id: item.org_id,
          raw_latitude: lat,
          raw_longitude: lon,
          resolved_latitude: lat,
          resolved_longitude: lon,
          location_source: 'embedded_gps',
          confidence: 0.99,
          verification_status: geo ? 'map_verified' : 'verified',
          place_name: geo?.placeName || null,
          landmark: geo?.landmark || null,
          street_address: geo?.streetAddress || null,
          city: geo?.city || null,
          state_province: geo?.stateProvince || null,
          postal_code: geo?.postalCode || null,
          country: geo?.country || null,
          country_code: geo?.countryCode || null,
          neighborhood: geo?.neighborhood || null,
          timezone: tz?.timezone || null,
          utc_offset_minutes: tz?.utcOffset ?? null,
          geocode_provider: geo?.provider || null,
          geocode_raw: geo?.raw || null,
          resolution_explanation: geo
            ? `GPS coordinates reverse geocoded via ${geo.provider} to ${geo.city || geo.placeName || 'unknown location'}.`
            : 'GPS coordinates available but reverse geocoding failed.',
        }, { onConflict: 'media_item_id' });

        // Update timestamp with timezone if available
        if (tz?.timezone) {
          await admin.from('media_timestamps').update({
            capture_timezone: tz.timezone,
          }).eq('media_item_id', mediaItemId);
        }

        await updateStep(admin, mediaItemId, item.org_id, 'geocode', 'completed', undefined, {
          city: geo?.city || null,
          country: geo?.countryCode || null,
          timezone: tz?.timezone || null,
        });
      } else {
        await updateStep(admin, mediaItemId, item.org_id, 'geocode', 'skipped', undefined, {
          reason: 'No GPS coordinates available',
        });

        // Still create a location record with unknown status
        await admin.from('media_locations').upsert({
          media_item_id: mediaItemId,
          org_id: item.org_id,
          location_source: 'unknown',
          confidence: 0,
          verification_status: 'unknown',
          resolution_explanation: 'No GPS data embedded in this file.',
        }, { onConflict: 'media_item_id' });
      }
    }

    // Step 6: OCR + AI Visual Analysis (only for images)
    if (isImage(item.original_mime_type)) {
      const { data: coll } = await admin.from('collections').select('mode, name, client_name, site_address').eq('id', item.collection_id).single();

      // Use original buffer directly for AI — resize in memory for efficiency
      let analysisBase64: string | null = null;
      try {
        const { generatePreview } = await import('./thumbnails');
        const preview = await generatePreview(buffer, 1024);
        analysisBase64 = preview.buffer.toString('base64');
      } catch {
        // Fallback: use original buffer directly (may be large)
        analysisBase64 = buffer.toString('base64');
      }

      if (analysisBase64) {
        // OCR
        await updateStep(admin, mediaItemId, item.org_id, 'ocr', 'running');
        const ocrResult = await extractOcr(analysisBase64);
        if (ocrResult) {
          // Extract serial numbers and MAC addresses from OCR
          const serials: string[] = [];
          const macs: string[] = [];
          const roomNumbers: string[] = [];
          for (const text of ocrResult.texts) {
            // MAC address pattern
            if (/([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/.test(text) || /[0-9A-Fa-f]{12}/.test(text)) {
              macs.push(text);
            }
            // Room number pattern
            if (/^(room|rm)\s*#?\s*\d+/i.test(text) || /^\d{3,4}[A-Z]?$/i.test(text)) {
              roomNumbers.push(text);
            }
          }

          await admin.from('media_ocr').upsert({
            media_item_id: mediaItemId,
            org_id: item.org_id,
            texts: ocrResult.texts,
            raw_text: ocrResult.raw,
            extracted_serials: serials,
            extracted_macs: macs,
            extracted_room_numbers: roomNumbers,
            model_used: 'claude-sonnet-4-6',
          }, { onConflict: 'media_item_id' });
          await updateStep(admin, mediaItemId, item.org_id, 'ocr', 'completed', undefined, {
            textCount: ocrResult.texts.length,
            hasMacs: macs.length > 0,
            hasRoomNumbers: roomNumbers.length > 0,
          });
        } else {
          await updateStep(admin, mediaItemId, item.org_id, 'ocr', 'completed', undefined, { textCount: 0 });
        }

        // AI Visual Analysis
        await updateStep(admin, mediaItemId, item.org_id, 'ai_analysis', 'running');
        const mode = (coll?.mode || 'travel') as 'travel' | 'project';
        const analysis = await analyzeImage(analysisBase64, mode, {
          collectionName: coll?.name,
          clientName: coll?.client_name,
          siteName: coll?.site_address,
        });

        if (analysis) {
          await admin.from('media_ai_analysis').upsert({
            media_item_id: mediaItemId,
            org_id: item.org_id,
            summary: analysis.summary,
            scene_type: analysis.scene_type,
            indoor_outdoor: analysis.indoor_outdoor,
            lighting: analysis.lighting,
            time_of_day_visual: analysis.time_of_day_visual,
            activities: analysis.activities || [],
            objects: analysis.objects || [],
            visible_text: analysis.visible_text || [],
            location_candidates: analysis.location_candidates || [],
            event_candidates: analysis.event_candidates || [],
            quality: analysis.quality || null,
            confidence: analysis.confidence,
            reasoning_summary: analysis.reasoning_summary,
            landmarks: analysis.landmarks || null,
            venue_candidates: analysis.venue_candidates || null,
            transportation: analysis.transportation || null,
            weather_appearance: analysis.weather_appearance || null,
            scenic_score: analysis.scenic_score ?? null,
            social_media_score: analysis.social_media_score ?? null,
            memory_highlight_score: analysis.memory_highlight_score ?? null,
            suggested_event_name: analysis.suggested_event_name || null,
            suggested_caption: analysis.suggested_caption || null,
            room_candidates: analysis.room_candidates || null,
            workstream: analysis.workstream || null,
            trade: analysis.trade || null,
            equipment: analysis.equipment || null,
            installation_status: analysis.installation_status || null,
            visible_issues: analysis.visible_issues || null,
            safety_concerns: analysis.safety_concerns || null,
            suggested_field_report_note: analysis.suggested_field_report_note || null,
            suggested_punch_item: analysis.suggested_punch_item || null,
            model_used: 'claude-sonnet-4-6',
            analysis_mode: mode,
            raw_response: analysis as unknown as Record<string, unknown>,
          }, { onConflict: 'media_item_id' });

          // Extract equipment records for project mode
          if (mode === 'project' && analysis.equipment && analysis.equipment.length > 0) {
            for (const eq of analysis.equipment) {
              if (eq.manufacturer || eq.model || eq.serial_number || eq.mac_address) {
                await admin.from('media_equipment').insert({
                  media_item_id: mediaItemId,
                  org_id: item.org_id,
                  manufacturer: eq.manufacturer || null,
                  model: eq.model || null,
                  device_type: eq.device_type || null,
                  serial_number_raw: eq.serial_number || null,
                  serial_number_normalized: eq.serial_number || null,
                  mac_address_raw: eq.mac_address || null,
                  mac_address_normalized: normalizeMac(eq.mac_address),
                  asset_tag: eq.asset_tag || null,
                  confidence: eq.confidence,
                  verification_status: eq.confidence >= 0.9 ? 'verified' : 'needs_review',
                  source: 'visual_ai',
                });
              }
            }
          }

          await updateStep(admin, mediaItemId, item.org_id, 'ai_analysis', 'completed', undefined, {
            sceneType: analysis.scene_type,
            confidence: analysis.confidence,
            equipmentCount: analysis.equipment?.length || 0,
          });
        } else {
          await updateStep(admin, mediaItemId, item.org_id, 'ai_analysis', 'failed', 'AI analysis returned no result');
        }
      } else {
        await updateStep(admin, mediaItemId, item.org_id, 'ocr', 'skipped');
        await updateStep(admin, mediaItemId, item.org_id, 'ai_analysis', 'skipped');
      }
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

function normalizeMac(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9A-Fa-f]/g, '');
  if (cleaned.length !== 12) return raw;
  return cleaned.match(/.{2}/g)!.join(':').toUpperCase();
}
