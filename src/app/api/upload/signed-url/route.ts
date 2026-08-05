import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

// Creates a signed upload URL so the client can upload directly to Supabase storage
// This bypasses the 50MB limit since it's a direct-to-storage upload
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { storagePath } = await request.json();
  if (!storagePath) {
    return NextResponse.json({ error: 'Missing storagePath' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from('originals')
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Failed to create signed URL' }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
}
