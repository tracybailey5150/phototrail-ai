'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Collection } from '@/types/database';

export default function ReportsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/collections').then(r => r.json()).then(data => {
      setCollections(data.collections || []);
      setLoading(false);
    });
  }, []);

  const handleExport = async (collectionId: string, format: 'json' | 'csv') => {
    setGenerating(collectionId);
    const res = await fetch(`/api/media?collection_id=${collectionId}`);
    const data = await res.json();
    const items = data.items || [];

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `collection-export-${collectionId}.json`);
    } else {
      const headers = ['filename', 'capture_time', 'gps_lat', 'gps_lng', 'file_size', 'processing_status', 'is_duplicate'];
      const rows = items.map((item: Record<string, unknown>) =>
        headers.map(h => {
          const key = h === 'gps_lat' ? 'gps_latitude' : h === 'gps_lng' ? 'gps_longitude' : h === 'filename' ? 'original_filename' : h;
          const val = item[key];
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : String(val ?? '');
        }).join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');
      downloadBlob(new Blob([csv], { type: 'text/csv' }), `collection-export-${collectionId}.csv`);
    }
    setGenerating(null);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-xl font-bold text-zinc-100">Reports & Exports</h2>

      {collections.length === 0 ? (
        <Card><p className="text-center text-zinc-500 py-8">No collections to generate reports from.</p></Card>
      ) : (
        <div className="space-y-4">
          {collections.map(c => (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{c.name}</CardTitle>
                    <CardDescription>{c.item_count} items</CardDescription>
                  </div>
                  <Badge variant={c.mode === 'travel' ? 'travel' : 'project'}>
                    {c.mode === 'travel' ? 'Travel' : 'Project'}
                  </Badge>
                </div>
              </CardHeader>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button size="sm" variant="secondary" loading={generating === c.id} onClick={() => handleExport(c.id, 'json')}>
                  Export JSON
                </Button>
                <Button size="sm" variant="secondary" loading={generating === c.id} onClick={() => handleExport(c.id, 'csv')}>
                  Export CSV
                </Button>
                {c.mode === 'travel' && (
                  <Button size="sm" variant="outline">Trip Summary</Button>
                )}
                {c.mode === 'project' && (
                  <>
                    <Button size="sm" variant="outline">Field Report</Button>
                    <Button size="sm" variant="outline">Equipment Report</Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
