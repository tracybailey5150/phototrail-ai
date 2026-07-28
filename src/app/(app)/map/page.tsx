'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MediaItem } from '@/types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const PhotoMap = dynamic(() => import('@/components/map/photo-map'), { ssr: false });

export interface MapItem extends MediaItem {
  map_latitude: number;
  map_longitude: number;
  location_source: 'gps' | 'ai_estimated';
  location_label?: string;
  ai_confidence?: string;
}

export default function MapPage() {
  const [mapItems, setMapItems] = useState<MapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasUnlocated, setHasUnlocated] = useState(false);

  useEffect(() => {
    fetch('/api/media').then(r => r.json()).then(data => {
      const allItems: MediaItem[] = data.items || [];

      // Items with GPS get added directly
      const gpsItems: MapItem[] = allItems
        .filter(i => i.gps_latitude && i.gps_longitude)
        .map(i => ({
          ...i,
          map_latitude: i.gps_latitude!,
          map_longitude: i.gps_longitude!,
          location_source: 'gps' as const,
        }));

      setMapItems(gpsItems);
      setHasUnlocated(allItems.some(i => !i.gps_latitude && i.processing_status === 'completed'));
      setLoading(false);

      // Auto-locate non-GPS photos
      locatePhotos(allItems, gpsItems);
    });
  }, []);

  const locatePhotos = async (allItems: MediaItem[], existing: MapItem[]) => {
    setLocating(true);
    try {
      const res = await fetch('/api/media/locate', { method: 'POST' });
      const data = await res.json();
      const aiLocations: { media_item_id: string; latitude: number; longitude: number; location_label: string; confidence: string }[] = data.locations || [];

      if (aiLocations.length > 0) {
        const itemMap = new Map(allItems.map(i => [i.id, i]));
        const existingIds = new Set(existing.map(i => i.id));

        const aiItems: MapItem[] = aiLocations
          .filter(loc => !existingIds.has(loc.media_item_id) && itemMap.has(loc.media_item_id))
          .map(loc => ({
            ...itemMap.get(loc.media_item_id)!,
            map_latitude: loc.latitude,
            map_longitude: loc.longitude,
            location_source: 'ai_estimated' as const,
            location_label: loc.location_label,
            ai_confidence: loc.confidence,
          }));

        if (aiItems.length > 0) {
          setMapItems(prev => [...prev, ...aiItems]);
        }
      }
    } catch { /* ignore */ }
    setLocating(false);
    setHasUnlocated(false);
  };

  const selectedItem = mapItems.find(i => i.id === selectedId) || null;
  const gpsCount = mapItems.filter(i => i.location_source === 'gps').length;
  const aiCount = mapItems.filter(i => i.location_source === 'ai_estimated').length;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-100">Map</h2>
        <div className="flex items-center gap-2">
          {locating && (
            <span className="text-xs text-zinc-500 flex items-center gap-1.5">
              <span className="animate-spin h-3 w-3 border border-amber-500 border-t-transparent rounded-full inline-block" />
              AI locating photos...
            </span>
          )}
          {gpsCount > 0 && <Badge variant="travel">{gpsCount} GPS</Badge>}
          {aiCount > 0 && <Badge variant="project">{aiCount} AI estimated</Badge>}
        </div>
      </div>

      {mapItems.length === 0 && !locating ? (
        <Card>
          <p className="text-center text-zinc-500 py-12">No locatable photos yet. Upload photos with GPS data or AI descriptions to see locations.</p>
        </Card>
      ) : (
        <div className="flex gap-4 h-[calc(100%-3rem)]">
          <div className="flex-1 rounded-lg overflow-hidden border border-zinc-800">
            {mapItems.length > 0 && (
              <PhotoMap items={mapItems} selectedId={selectedId} onSelect={setSelectedId} />
            )}
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
                  {selectedItem.location_source === 'ai_estimated' ? (
                    <>
                      <Badge variant="project">AI Estimated</Badge>
                      {selectedItem.location_label && (
                        <p className="text-xs text-zinc-400">{selectedItem.location_label}</p>
                      )}
                      <p className="text-[10px] text-zinc-600">
                        ~{selectedItem.map_latitude.toFixed(4)}, {selectedItem.map_longitude.toFixed(4)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-400">
                      {selectedItem.map_latitude.toFixed(5)}, {selectedItem.map_longitude.toFixed(5)}
                    </p>
                  )}
                  {selectedItem.capture_time && (
                    <p className="text-xs text-zinc-500">
                      {new Date(selectedItem.capture_time).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
              </Card>
            )}

            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider px-1">
              All Locations ({mapItems.length})
            </p>

            {mapItems.map(item => {
              const isActive = item.id === selectedId;
              const isAi = item.location_source === 'ai_estimated';
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
                  <div className={`w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden ${isAi ? 'ring-1 ring-blue-500/50' : ''}`} style={{ background: '#27272a' }}>
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm">📍</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-300 truncate">{item.original_filename}</p>
                    {isAi && item.location_label ? (
                      <p className="text-[10px] text-blue-400 truncate">{item.location_label}</p>
                    ) : (
                      <p className="text-[10px] text-zinc-600">
                        {item.map_latitude.toFixed(4)}, {item.map_longitude.toFixed(4)}
                      </p>
                    )}
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
