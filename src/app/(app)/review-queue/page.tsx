'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { MediaItem } from '@/types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

interface ReviewItem {
  item: MediaItem;
  issues: string[];
}

export default function ReviewQueuePage() {
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [dateInputs, setDateInputs] = useState<Record<string, string>>({});
  const [resolvingAll, setResolvingAll] = useState(false);

  useEffect(() => {
    fetch('/api/media').then(r => r.json()).then(async (data) => {
      const items: MediaItem[] = data.items || [];
      const needsReview: ReviewItem[] = [];

      for (const item of items) {
        const issues: string[] = [];
        if (!item.capture_time) issues.push('Missing capture date');
        if (!item.gps_latitude) issues.push('No GPS location');
        if (item.is_duplicate) issues.push('Possible duplicate');
        if (item.processing_status === 'failed') issues.push('Processing failed');
        if (item.needs_review) issues.push('Needs review');

        if (issues.length > 0) needsReview.push({ item, issues });
      }

      setReviewItems(needsReview);
      setLoading(false);
    });
  }, []);

  const removeItem = (id: string) => {
    setRemoving(prev => new Set(prev).add(id));
    setTimeout(() => {
      setReviewItems(prev => prev.filter(r => r.item.id !== id));
      setRemoving(prev => { const next = new Set(prev); next.delete(id); return next; });
    }, 300);
  };

  const handleAction = async (itemId: string, action: string, data?: Record<string, string>) => {
    setActing(itemId);
    try {
      await fetch('/api/media/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_item_id: itemId, action, data }),
      });
      removeItem(itemId);
    } catch { /* ignore */ }
    setActing(null);
  };

  const handleResolveAll = async () => {
    setResolvingAll(true);
    const ids = reviewItems.map(r => r.item.id);
    try {
      await fetch('/api/media/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_item_id: ids, action: 'resolve' }),
      });
      setReviewItems([]);
    } catch { /* ignore */ }
    setResolvingAll(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-100">Review Queue</h2>
        <div className="flex items-center gap-3">
          {reviewItems.length > 1 && (
            <Button size="sm" variant="secondary" loading={resolvingAll} onClick={handleResolveAll}>
              Resolve All ({reviewItems.length})
            </Button>
          )}
          <Badge variant={reviewItems.length > 0 ? 'warning' : 'success'}>
            {reviewItems.length} item{reviewItems.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {reviewItems.length === 0 ? (
        <Card><p className="text-center text-zinc-500 py-12">All clear — nothing needs review.</p></Card>
      ) : (
        <div className="space-y-3">
          {reviewItems.map(({ item, issues }) => {
            const thumb = item.thumbnail_path ? `${SUPABASE_URL}/storage/v1/object/public/derivatives/${item.thumbnail_path}` : null;
            const isRemoving = removing.has(item.id);
            const hasMissingDate = issues.includes('Missing capture date');
            const hasFailed = issues.includes('Processing failed');

            return (
              <div
                key={item.id}
                className={`transition-all duration-300 ${isRemoving ? 'opacity-0 scale-95 -translate-x-4' : 'opacity-100'}`}
              >
                <Card className="flex gap-4 items-start">
                  <div className="w-24 h-24 flex-shrink-0 bg-zinc-800 rounded-lg overflow-hidden">
                    {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">📷</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{item.original_filename}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {issues.map(issue => (
                        <Badge key={issue} variant={issue.includes('failed') ? 'danger' : 'warning'}>{issue}</Badge>
                      ))}
                    </div>

                    {hasMissingDate && (
                      <div className="flex items-center gap-2 mt-3">
                        <input
                          type="datetime-local"
                          value={dateInputs[item.id] || ''}
                          onChange={e => setDateInputs(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!dateInputs[item.id]}
                          loading={acting === item.id}
                          onClick={() => handleAction(item.id, 'set_date', { capture_time: new Date(dateInputs[item.id]).toISOString() })}
                        >
                          Save Date
                        </Button>
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="secondary" loading={acting === item.id} onClick={() => handleAction(item.id, 'resolve')}>
                        Resolve
                      </Button>
                      <Button size="sm" variant="ghost" loading={acting === item.id} onClick={() => handleAction(item.id, 'skip')}>
                        Skip
                      </Button>
                      {hasFailed && (
                        <Button size="sm" variant="outline" loading={acting === item.id} onClick={() => handleAction(item.id, 'reprocess')}>
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
