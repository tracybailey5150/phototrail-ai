import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

// Receives a chunk of a file and appends it to a temp file in storage
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
    const chunks: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const cPath = `chunks/${uploadId}/chunk_${String(i).padStart(5, '0')}`;
      const { data: chunkData, error: dlError } = await admin.storage
        .from('originals')
        .download(cPath);

      if (dlError || !chunkData) {
        return NextResponse.json({ error: `Failed to read chunk ${i}` }, { status: 500 });
      }
      chunks.push(Buffer.from(await chunkData.arrayBuffer()));
    }

    // Merge and upload final file
    const merged = Buffer.concat(chunks);
    const { error: mergeError } = await admin.storage
      .from('originals')
      .upload(storagePath, new Uint8Array(merged), {
        contentType: contentType || 'application/octet-stream',
        upsert: true,
      });

    if (mergeError) {
      return NextResponse.json({ error: `Merge failed: ${mergeError.message}` }, { status: 500 });
    }

    // Clean up chunks
    const chunkPaths = Array.from({ length: totalChunks }, (_, i) =>
      `chunks/${uploadId}/chunk_${String(i).padStart(5, '0')}`
    );
    await admin.storage.from('originals').remove(chunkPaths);

    return NextResponse.json({ ok: true, merged: true, size: merged.length });
  }

  return NextResponse.json({ ok: true, chunkIndex, received: buffer.length });
}
