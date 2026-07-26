import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: item } = await admin.from('media_items')
    .select('thumbnail_path')
    .eq('id', id)
    .single();

  if (!item?.thumbnail_path) {
    return new Response('Not found', { status: 404 });
  }

  const { data: file, error } = await admin.storage
    .from('derivatives')
    .download(item.thumbnail_path);

  if (error || !file) {
    return new Response('Download failed', { status: 500 });
  }

  const buffer = await file.arrayBuffer();
  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
