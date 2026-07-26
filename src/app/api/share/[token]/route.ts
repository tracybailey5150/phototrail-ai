import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: share } = await admin.from('collection_shares')
    .select('id, collection_id, org_id, permissions, is_active, expires_at, max_uses, use_count, label')
    .eq('token', token)
    .single();

  if (!share || !share.is_active) {
    return NextResponse.json({ error: 'Invalid or expired share link' }, { status: 404 });
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Share link has expired' }, { status: 410 });
  }

  if (share.max_uses && share.use_count >= share.max_uses) {
    return NextResponse.json({ error: 'Share link usage limit reached' }, { status: 410 });
  }

  // Get collection info (public-safe fields only)
  const { data: collection } = await admin.from('collections')
    .select('id, name, description, mode, cover_image_url, item_count')
    .eq('id', share.collection_id)
    .single();

  return NextResponse.json({ share, collection });
}
