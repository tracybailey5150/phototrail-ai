'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { MediaItem } from '@/types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export default function MapPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/media').then(r => r.json()).then(data => {
      setItems((data.items || []).filter((i: MediaItem) => i.gps_latitude && i.gps_longitude));
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-6xl space-y-6">
      <h2 className="text-xl font-bold text-zinc-100">Map</h2>
      {items.length === 0 ? (
        <Card><p className="text-center text-zinc-500 py-12">No geotagged photos yet. Upload photos with GPS data to see locations.</p></Card>
      ) : (
        <>
          <Card>
            <p className="text-center text-zinc-300 font-medium py-4">{items.length} geotagged photo{items.length !== 1 ? 's' : ''}</p>
          </Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(item => {
              const thumb = item.thumbnail_path ? `${SUPABASE_URL}/storage/v1/object/public/derivatives/${item.thumbnail_path}` : null;
              return (
                <Card key={item.id} className="flex gap-3 items-center">
                  <div className="w-14 h-14 flex-shrink-0 bg-zinc-800 rounded-lg overflow-hidden">
                    {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">📍</div>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{item.original_filename}</p>
                    <p className="text-xs text-zinc-500">{item.gps_latitude?.toFixed(5)}, {item.gps_longitude?.toFixed(5)}</p>
                    {item.capture_time && <p className="text-xs text-zinc-600">{new Date(item.capture_time).toLocaleDateString()}</p>}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
