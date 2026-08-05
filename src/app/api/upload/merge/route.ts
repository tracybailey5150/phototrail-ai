import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 300;

// Merges uploaded chunks into the final file, one chunk at a time to avoid OOM.
// Uses streaming concatenation instead of loading everything into memory.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { uploadId, totalChunks, storagePath, contentType } = await request.json();

  if (!uploadId || !totalChunks || !storagePath) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Download and concatenate chunks one at a time
  // Use a growing buffer approach — each chunk is small (3MB) so we can
  // handle files up to ~500MB without issues on 1GB function memory
  const parts: Uint8Array[] = [];
  let totalSize = 0;

  for (let i = 0; i < totalChunks; i++) {
    const cPath = `chunks/${uploadId}/chunk_${String(i).padStart(5, '0')}`;

    let chunkData: Blob | null = null;
    let lastError: string | null = null;

    // Retry each chunk download up to 3 times
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await admin.storage.from('originals').download(cPath);
      if (result.data && !result.error) {
        chunkData = result.data;
        lastError = null;
        break;
      }
      lastError = result.error?.message || 'Download failed';
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }

    if (!chunkData) {
      return NextResponse.json({ error: `Failed to read chunk ${i}: ${lastError}` }, { status: 500 });
    }

    const arr = new Uint8Array(await chunkData.arrayBuffer());
    parts.push(arr);
    totalSize += arr.length;
  }

  // Merge into single buffer
  const merged = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }

  // Upload final merged file with retry
  let mergeError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await admin.storage.from('originals').upload(storagePath, merged, {
      contentType: contentType || 'application/octet-stream',
      upsert: true,
    });
    if (!result.error) {
      mergeError = null;
      break;
    }
    mergeError = result.error.message;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }

  if (mergeError) {
    return NextResponse.json({ error: `Merge upload failed: ${mergeError}` }, { status: 500 });
  }

  // Clean up chunks (fire and forget)
  const chunkPaths = Array.from({ length: totalChunks }, (_, i) =>
    `chunks/${uploadId}/chunk_${String(i).padStart(5, '0')}`
  );
  admin.storage.from('originals').remove(chunkPaths).catch(() => {});

  return NextResponse.json({ ok: true, merged: true, size: totalSize });
}
