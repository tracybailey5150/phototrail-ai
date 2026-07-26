'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { MediaItem } from '@/types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

interface SearchResult { item: MediaItem; matchReason: string; }

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);

    const res = await fetch('/api/media');
    const data = await res.json();
    const items: MediaItem[] = data.items || [];
    const q = query.toLowerCase();
    const matched: SearchResult[] = [];

    for (const item of items) {
      const reasons: string[] = [];
      if (item.original_filename.toLowerCase().includes(q)) reasons.push('filename');

      const detailRes = await fetch(`/api/media/${item.id}`);
      const detail = await detailRes.json();

      if (detail.aiAnalysis?.summary?.toLowerCase().includes(q)) reasons.push('AI summary');
      if (detail.aiAnalysis?.scene_type?.toLowerCase().includes(q)) reasons.push('scene type');
      if ((detail.aiAnalysis?.objects as string[])?.some(o => o.toLowerCase().includes(q))) reasons.push('object');
      if ((detail.aiAnalysis?.landmarks as string[])?.some(l => l.toLowerCase().includes(q))) reasons.push('landmark');
      if (detail.ocr?.raw_text?.toLowerCase().includes(q)) reasons.push('visible text');
      if (detail.location?.city?.toLowerCase().includes(q)) reasons.push('city');
      if (detail.location?.country?.toLowerCase().includes(q)) reasons.push('country');
      if (detail.location?.place_name?.toLowerCase().includes(q)) reasons.push('place');

      if (reasons.length > 0) matched.push({ item, matchReason: reasons.join(', ') });
    }

    setResults(matched);
    setLoading(false);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-xl font-bold text-zinc-100">Search</h2>
      <div className="flex gap-3">
        <div className="flex-1"><Input placeholder="Search photos... (e.g. Navy Pier, Cisco, sunset, Room 922)" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} /></div>
        <Button onClick={handleSearch} loading={loading}>Search</Button>
      </div>
      {searched && !loading && <p className="text-sm text-zinc-500">{results.length} result{results.length !== 1 ? 's' : ''}</p>}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map(({ item, matchReason }) => {
            const thumb = item.thumbnail_path ? `${SUPABASE_URL}/storage/v1/object/public/derivatives/${item.thumbnail_path}` : null;
            return (
              <Card key={item.id} className="flex gap-4 items-start">
                <div className="w-20 h-20 flex-shrink-0 bg-zinc-800 rounded-lg overflow-hidden">
                  {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-zinc-600">📄</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{item.original_filename}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Matched: <span className="text-amber-400">{matchReason}</span></p>
                  {item.capture_time && <p className="text-xs text-zinc-600 mt-0.5">{new Date(item.capture_time).toLocaleString()}</p>}
                  <div className="flex gap-1 mt-1">{item.gps_latitude && <Badge variant="success">GPS</Badge>}</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {searched && !loading && results.length === 0 && <Card><p className="text-center text-zinc-500 py-8">No matches found.</p></Card>}
    </div>
  );
}
