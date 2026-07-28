'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { MediaItem } from '@/types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const PhotoMap = dynamic(() => import('@/components/map/photo-map'), { ssr: false });

export default function MapPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/media').then(r => r.json()).then(data => {
      setItems((data.items || []).filter((i: MediaItem) => i.gps_latitude && i.gps_longitude));
      setLoading(false);
    });
  }, []);

  const selectedItem = items.find(i => i.id === selectedId) || null;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-100">Map</h2>
        <Badge variant="travel">{items.length} geotagged photo{items.length !== 1 ? 's' : ''}</Badge>
      </div>

      {items.length === 0 ? (
        <Card>
          <p className="text-center text-zinc-500 py-12">No geotagged photos yet. Upload photos with GPS data to see locations.</p>
        </Card>
      ) : (
        <div className="flex gap-4 h-[calc(100%-3rem)]">
          <div className="flex-1 rounded-lg overflow-hidden border border-zinc-800">
            <PhotoMap items={items} selectedId={selectedId} onSelect={setSelectedId} />
          </div>

          <div className="w-72 flex-shrink-0 flex flex-col gap-2 overflow-y-auto">
            {selectedItem && (
              <Card className="border-amber-500/50 mb-2">
                <div className="space-y-2">
                  {selectedItem.thumbnail_path && (
                    <img
                      src={`${SUPABASE_URL}/storage/v1/object/public/derivatives/${selectedItem.thumbnail_path}`}
                      alt={selectedItem.original_filename}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  )}
                  <p className="text-sm font-medium text-zinc-200 truncate">{selectedItem.original_filename}</p>
                  <p className="text-xs text-zinc-400">
                    {selectedItem.gps_latitude?.toFixed(5)}, {selectedItem.gps_longitude?.toFixed(5)}
                  </p>
                  {selectedItem.capture_time && (
                    <p className="text-xs text-zinc-500">
                      {new Date(selectedItem.capture_time).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
              </Card>
            )}

            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider px-1">
              All Locations ({items.length})
            </p>

            {items.map(item => {
              const isActive = item.id === selectedId;
              const thumb = item.thumbnail_path
                ? `${SUPABASE_URL}/storage/v1/object/public/derivatives/${item.thumbnail_path}`
                : null;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`flex gap-3 items-center p-2 rounded-lg text-left transition-colors w-full ${
                    isActive
                      ? 'bg-amber-500/10 border border-amber-500/30'
                      : 'hover:bg-zinc-800/50 border border-transparent'
                  }`}
                >
                  <div className="w-10 h-10 flex-shrink-0 bg-zinc-800 rounded-lg overflow-hidden">
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm">📍</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-300 truncate">{item.original_filename}</p>
                    <p className="text-[10px] text-zinc-600">
                      {item.gps_latitude?.toFixed(4)}, {item.gps_longitude?.toFixed(4)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
