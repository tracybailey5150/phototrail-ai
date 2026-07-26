'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { MediaItem } from '@/types/database';

export default function UploadsPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/media').then(r => r.json()).then(data => {
      setItems((data.items || []).sort(
        (a: MediaItem, b: MediaItem) => new Date(b.upload_time).getTime() - new Date(a.upload_time).getTime()
      ));
      setLoading(false);
    });
  }, []);

  // Auto-refresh while processing
  useEffect(() => {
    const hasActive = items.some(i => i.processing_status === 'pending' || i.processing_status === 'processing');
    if (!hasActive) return;
    const interval = setInterval(() => {
      fetch('/api/media').then(r => r.json()).then(data => setItems(data.items || []));
    }, 5000);
    return () => clearInterval(interval);
  }, [items]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" /></div>;

  const statusCounts = {
    pending: items.filter(i => i.processing_status === 'pending').length,
    processing: items.filter(i => i.processing_status === 'processing').length,
    completed: items.filter(i => i.processing_status === 'completed').length,
    failed: items.filter(i => i.processing_status === 'failed').length,
  };

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-xl font-bold text-zinc-100">Upload History</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Pending', value: statusCounts.pending, color: 'text-zinc-400' },
          { label: 'Processing', value: statusCounts.processing, color: 'text-amber-400' },
          { label: 'Completed', value: statusCounts.completed, color: 'text-emerald-400' },
          { label: 'Failed', value: statusCounts.failed, color: 'text-red-400' },
        ].map(s => (
          <Card key={s.label}>
            <p className="text-xs text-zinc-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {items.length === 0 ? (
        <Card><p className="text-center text-zinc-500 py-8">No uploads yet.</p></Card>
      ) : (
        <Card padding={false}>
          <div className="divide-y divide-zinc-800">
            {items.map(item => (
              <div key={item.id} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-200 truncate">{item.original_filename}</p>
                  <p className="text-xs text-zinc-600">{(item.file_size / 1024).toFixed(0)} KB — {new Date(item.upload_time).toLocaleString()}</p>
                </div>
                <Badge variant={
                  item.processing_status === 'completed' ? 'success' :
                  item.processing_status === 'failed' ? 'danger' :
                  item.processing_status === 'processing' ? 'warning' : 'default'
                }>
                  {item.processing_status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
