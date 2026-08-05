import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 300;

// Receives a chunk and stores it. On the last chunk, stores a manifest so the
// merge endpoint can assemble the file separately.
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

  if (!chunk || isNaN(chunkIndex) || !uploadId || !storagePath) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = createAdminClient();
  const chunkPath = `chunks/${uploadId}/chunk_${String(chunkIndex).padStart(5, '0')}`;

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

  return NextResponse.json({ ok: true, chunkIndex, received: buffer.length });
}
