'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropZone } from '@/components/upload/drop-zone';
import { MediaGrid } from '@/components/upload/media-grid';
import type { Collection, MediaItem } from '@/types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wwnvebnfjeemaakieqei.supabase.co';

export default function CollectionDetailPage() {
  const { id } = useParams();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch(`/api/collections/${id}`).then((r) => r.json()),
      fetch(`/api/media?collection_id=${id}`).then((r) => r.json()),
    ]).then(([col, media]) => {
      setCollection(col.collection || null);
      setMediaItems(media.items || []);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll for processing updates every 5s if items are still processing
  useEffect(() => {
    const hasProcessing = mediaItems.some(
      (m) => m.processing_status === 'pending' || m.processing_status === 'processing'
    );
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetch(`/api/media?collection_id=${id}`).then((r) => r.json()).then((data) => {
        setMediaItems(data.items || []);
      });
      // Also refresh collection for updated item_count
      fetch(`/api/collections/${id}`).then((r) => r.json()).then((data) => {
        if (data.collection) setCollection(data.collection);
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [id, mediaItems]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!collection) {
    return (
      <Card>
        <p className="text-center text-zinc-500 py-8">Collection not found.</p>
      </Card>
    );
  }

  const completedItems = mediaItems.filter((m) => m.processing_status === 'completed');
  const processingItems = mediaItems.filter(
    (m) => m.processing_status === 'pending' || m.processing_status === 'processing'
  );
  const failedItems = mediaItems.filter((m) => m.processing_status === 'failed');
  const withGps = mediaItems.filter((m) => m.gps_latitude != null);
  const withDate = mediaItems.filter((m) => m.capture_time != null);
  const duplicates = mediaItems.filter((m) => m.is_duplicate);

  return (
    <div className="max-w-6xl space-y-6">
      {/* Collection header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Badge variant={collection.mode === 'travel' ? 'travel' : 'project'}>
              {collection.mode === 'travel' ? 'Travel & Life' : 'Project & Job Site'}
            </Badge>
            <Badge variant="success">{collection.status}</Badge>
          </div>
          <CardTitle className="text-2xl mt-2">{collection.name}</CardTitle>
          {collection.description && <CardDescription>{collection.description}</CardDescription>}
        </CardHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          {collection.mode === 'travel' && collection.location && (
            <div><span className="text-zinc-500">Destination:</span> <span className="text-zinc-200">{collection.location}</span></div>
          )}
          {collection.mode === 'travel' && collection.start_date && (
            <div><span className="text-zinc-500">Dates:</span> <span className="text-zinc-200">{collection.start_date}{collection.end_date ? ` — ${collection.end_date}` : ''}</span></div>
          )}
          {collection.mode === 'project' && collection.client_name && (
            <div><span className="text-zinc-500">Client:</span> <span className="text-zinc-200">{collection.client_name}</span></div>
          )}
          {collection.mode === 'project' && collection.project_number && (
            <div><span className="text-zinc-500">Project #:</span> <span className="text-zinc-200">{collection.project_number}</span></div>
          )}
          {collection.mode === 'project' && collection.site_address && (
            <div><span className="text-zinc-500">Site:</span> <span className="text-zinc-200">{collection.site_address}</span></div>
          )}
        </div>
      </Card>

      {/* Stats bar */}
      {mediaItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: mediaItems.length, color: 'text-zinc-100' },
            { label: 'Completed', value: completedItems.length, color: 'text-emerald-400' },
            { label: 'Processing', value: processingItems.length, color: 'text-amber-400' },
            { label: 'With GPS', value: withGps.length, color: 'text-blue-400' },
            { label: 'With Date', value: withDate.length, color: 'text-purple-400' },
            { label: 'Duplicates', value: duplicates.length, color: 'text-yellow-400' },
          ].map((stat) => (
            <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
              <p className="text-xs text-zinc-500">{stat.label}</p>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      <DropZone collectionId={collection.id} onUploadComplete={fetchData} />

      {/* Media grid */}
      {mediaItems.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Media ({mediaItems.length})
            {failedItems.length > 0 && (
              <span className="text-red-400 ml-2">({failedItems.length} failed)</span>
            )}
          </h2>
          <MediaGrid items={mediaItems} supabaseUrl={SUPABASE_URL} />
        </div>
      )}
    </div>
  );
}
