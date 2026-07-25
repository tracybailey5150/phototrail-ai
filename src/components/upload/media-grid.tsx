'use client';

import { Badge } from '@/components/ui/badge';
import type { MediaItem } from '@/types/database';

interface MediaGridProps {
  items: MediaItem[];
  supabaseUrl: string;
}

export function MediaGrid({ items, supabaseUrl }: MediaGridProps) {
  if (!items.length) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
      {items.map((item) => (
        <MediaCard key={item.id} item={item} supabaseUrl={supabaseUrl} />
      ))}
    </div>
  );
}

function MediaCard({ item, supabaseUrl }: { item: MediaItem; supabaseUrl: string }) {
  const thumbnailUrl = item.thumbnail_path
    ? `${supabaseUrl}/storage/v1/object/public/derivatives/${item.thumbnail_path}`
    : null;

  return (
    <div className="group relative aspect-square bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={item.original_filename}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          {item.processing_status === 'pending' || item.processing_status === 'processing' ? (
            <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
          ) : item.processing_status === 'failed' ? (
            <span className="text-red-400 text-xs">Failed</span>
          ) : (
            <span className="text-2xl">📄</span>
          )}
        </div>
      )}

      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
        <p className="text-xs text-zinc-200 truncate">{item.original_filename}</p>
        <div className="flex items-center gap-1 mt-1">
          {item.gps_latitude && <span className="text-[10px] text-emerald-400">GPS</span>}
          {item.capture_time && <span className="text-[10px] text-blue-400">Date</span>}
          {item.is_duplicate && <span className="text-[10px] text-yellow-400">Dup</span>}
          {item.is_screenshot && <span className="text-[10px] text-zinc-400">Screen</span>}
        </div>
      </div>

      {/* Status badge */}
      {item.processing_status !== 'completed' && (
        <div className="absolute top-1 right-1">
          <Badge variant={item.processing_status === 'failed' ? 'danger' : 'warning'}>
            {item.processing_status}
          </Badge>
        </div>
      )}
    </div>
  );
}
