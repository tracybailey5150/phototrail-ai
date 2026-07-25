'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Collection } from '@/types/database';

export default function CollectionDetailPage() {
  const { id } = useParams();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/collections/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setCollection(data.collection || null);
        setLoading(false);
      });
  }, [id]);

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

  return (
    <div className="max-w-4xl space-y-6">
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

        <div className="grid grid-cols-2 gap-4 text-sm">
          {collection.mode === 'travel' && (
            <>
              {collection.location && <div><span className="text-zinc-500">Destination:</span> <span className="text-zinc-200">{collection.location}</span></div>}
              {collection.start_date && <div><span className="text-zinc-500">Dates:</span> <span className="text-zinc-200">{collection.start_date}{collection.end_date ? ` — ${collection.end_date}` : ''}</span></div>}
            </>
          )}
          {collection.mode === 'project' && (
            <>
              {collection.client_name && <div><span className="text-zinc-500">Client:</span> <span className="text-zinc-200">{collection.client_name}</span></div>}
              {collection.project_number && <div><span className="text-zinc-500">Project #:</span> <span className="text-zinc-200">{collection.project_number}</span></div>}
              {collection.site_address && <div><span className="text-zinc-500">Site:</span> <span className="text-zinc-200">{collection.site_address}</span></div>}
            </>
          )}
          <div><span className="text-zinc-500">Items:</span> <span className="text-zinc-200">{collection.item_count}</span></div>
        </div>
      </Card>

      {/* Media upload area — Phase 2 */}
      <Card>
        <div className="text-center py-16 border-2 border-dashed border-zinc-800 rounded-xl">
          <span className="text-4xl">📷</span>
          <p className="mt-3 text-zinc-400">Photo upload coming in Phase 2</p>
          <p className="text-xs text-zinc-600 mt-1">Drag & drop photos and videos, batch upload, HEIC support, AI analysis</p>
        </div>
      </Card>
    </div>
  );
}
