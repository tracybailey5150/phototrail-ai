import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 300;

// Receives a chunk of a file and stores it — merge happens in separate endpoint
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const chunk = formData.get('chunk') as File;
  const chunkIndex = parseInt(formData.get('chunkIndex') as string);
  const totalChunks = parseInt(formData.get('totalChunks') as string);
  const uploadId = formData.get('uploadId') as string;
  const storagePath = formData.get('storagePath') as string;
  const contentType = formData.get('contentType') as string;

  if (!chunk || isNaN(chunkIndex) || !uploadId || !storagePath) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = createAdminClient();
  const chunkPath = `chunks/${uploadId}/chunk_${String(chunkIndex).padStart(5, '0')}`;

  // Upload this chunk
  const buffer = Buffer.from(await chunk.arrayBuffer());
  const { error } = await admin.storage
    .from('originals')
    .upload(chunkPath, new Uint8Array(buffer), {
      contentType: 'application/octet-stream',
      upsert: true,
    });

  if (error) {
    return NextResponse.json({ error: `Chunk ${chunkIndex} upload failed: ${error.message}` }, { status: 500 });
  }

  // If this is the last chunk, merge all chunks
  if (chunkIndex === totalChunks - 1) {
    // Download and merge all chunks
    const chunks: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const cPath = `chunks/${uploadId}/chunk_${String(i).padStart(5, '0')}`;

      // Retry each chunk download up to 3 times
      let chunkData: Blob | null = null;
      let dlError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await admin.storage.from('originals').download(cPath);
        if (result.data && !result.error) {
          chunkData = result.data;
          dlError = null;
          break;
        }
        dlError = result.error;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }

      if (!chunkData || dlError) {
        return NextResponse.json({ error: `Failed to read chunk ${i} during merge` }, { status: 500 });
      }
      chunks.push(Buffer.from(await chunkData.arrayBuffer()));
    }

    // Merge and upload final file
    const merged = Buffer.concat(chunks);

    // Retry the final upload up to 3 times
    let mergeError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await admin.storage.from('originals').upload(storagePath, new Uint8Array(merged), {
        contentType: contentType || 'application/octet-stream',
        upsert: true,
      });
      if (!result.error) {
        mergeError = null;
        break;
      }
      mergeError = result.error;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }

    if (mergeError) {
      return NextResponse.json({ error: `Merge failed: ${(mergeError as Error).message}` }, { status: 500 });
    }

    // Clean up chunks (fire and forget — don't fail if cleanup fails)
    const chunkPaths = Array.from({ length: totalChunks }, (_, i) =>
      `chunks/${uploadId}/chunk_${String(i).padStart(5, '0')}`
    );
    admin.storage.from('originals').remove(chunkPaths).catch(() => {});

    return NextResponse.json({ ok: true, merged: true, size: merged.length });
  }

  return NextResponse.json({ ok: true, chunkIndex, received: buffer.length });
}
