import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: false,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });

  const { collectionId, filename, contentType, fileSize } = await request.json();
  if (!collectionId || !filename || !contentType) {
    return NextResponse.json({ error: 'Missing collectionId, filename, or contentType' }, { status: 400 });
  }

  // Verify collection belongs to org
  const { data: collection } = await admin.from('collections')
    .select('id').eq('id', collectionId).eq('org_id', profile.org_id).single();
  if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 });

  const mediaId = crypto.randomUUID();
  const ext = filename.split('.').pop()?.toLowerCase() || 'bin';
  const r2Key = `phototrail/${profile.org_id}/${collectionId}/${mediaId}.${ext}`;

  try {
    const command = new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET!,
      Key: r2Key,
    });

    const presignedUrl = await getSignedUrl(r2, command, {
      expiresIn: 600,
      unhoistableHeaders: new Set(['x-amz-checksum-crc32']),
      signableHeaders: new Set(['host']),
    });

    const baseUrl = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').trim().replace(/\/$/, '');
    const publicUrl = `${baseUrl}/${r2Key}`;

    // Create the media item record (pending processing)
    await admin.from('media_items').insert({
      id: mediaId,
      collection_id: collectionId,
      org_id: profile.org_id,
      uploaded_by: user.id,
      original_filename: filename,
      original_mime_type: contentType,
      file_size: fileSize || 0,
      original_storage_path: r2Key,
      processing_status: 'pending',
    });

    return NextResponse.json({ presignedUrl, publicUrl, mediaId, r2Key });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Presign failed' }, { status: 500 });
  }
}
