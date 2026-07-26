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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-100">Review Queue</h2>
        <Badge variant={reviewItems.length > 0 ? 'warning' : 'success'}>
          {reviewItems.length} item{reviewItems.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {reviewItems.length === 0 ? (
        <Card><p className="text-center text-zinc-500 py-12">All clear — nothing needs review.</p></Card>
      ) : (
        <div className="space-y-3">
          {reviewItems.map(({ item, issues }) => {
            const thumb = item.thumbnail_path ? `${SUPABASE_URL}/storage/v1/object/public/derivatives/${item.thumbnail_path}` : null;
            return (
              <Card key={item.id} className="flex gap-4 items-start">
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
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="secondary">Resolve</Button>
                    <Button size="sm" variant="ghost">Skip</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
