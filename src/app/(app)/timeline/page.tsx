'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import type { MediaItem } from '@/types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export default function TimelinePage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/media').then(r => r.json()).then(data => {
      setItems((data.items || []).filter((i: MediaItem) => i.capture_time).sort(
        (a: MediaItem, b: MediaItem) => new Date(b.capture_time!).getTime() - new Date(a.capture_time!).getTime()
      ));
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" /></div>;

  const dateGroups = new Map<string, MediaItem[]>();
  for (const item of items) {
    const date = new Date(item.capture_time!).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!dateGroups.has(date)) dateGroups.set(date, []);
    dateGroups.get(date)!.push(item);
  }

  return (
    <div className="max-w-4xl space-y-8">
      <h2 className="text-xl font-bold text-zinc-100">Timeline</h2>
      {dateGroups.size === 0 ? (
        <Card><p className="text-center text-zinc-500 py-8">No dated photos yet. Upload photos with EXIF data to build your timeline.</p></Card>
      ) : (
        [...dateGroups.entries()].map(([date, dayItems]) => (
          <div key={date}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <h3 className="text-sm font-semibold text-zinc-300">{date}</h3>
              <span className="text-xs text-zinc-600">{dayItems.length} photo{dayItems.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="ml-6 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {dayItems.map(item => {
                const thumb = item.thumbnail_path ? `${SUPABASE_URL}/storage/v1/object/public/derivatives/${item.thumbnail_path}` : null;
                return (
                  <div key={item.id} className="aspect-square bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
                    {thumb ? <img src={thumb} alt={item.original_filename} className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">No thumb</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
