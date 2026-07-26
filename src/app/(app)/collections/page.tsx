'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Collection, CollectionMode } from '@/types/database';

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [filter, setFilter] = useState<CollectionMode | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = filter !== 'all' ? `?mode=${filter}` : '';
    fetch(`/api/collections${params}`)
      .then((r) => r.json())
      .then((data) => {
        setCollections(data.collections || []);
        setLoading(false);
      });
  }, [filter]);

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-100">Collections</h2>
        <Link href="/collections/new">
          <Button>New Collection</Button>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'travel', 'project'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setFilter(tab); setLoading(true); }}
            className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
              filter === tab
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-zinc-400 hover:bg-zinc-800 border border-transparent'
            }`}
          >
            {tab === 'all' ? 'All' : tab === 'travel' ? 'Travel & Life' : 'Project & Job Site'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
        </div>
      ) : collections.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-zinc-500 mb-3">No collections found.</p>
            <Link href="/collections/new">
              <Button>Create Your First Collection</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((c) => (
            <Link key={c.id} href={`/collections/${c.id}`}>
              <Card className="hover:border-zinc-700 transition-colors cursor-pointer h-full" padding={false}>
                {c.cover_image_url && (
                  <div style={{ width: '100%', height: 160, overflow: 'hidden', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                    <img src={c.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                )}
                <div className="p-5">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge variant={c.mode === 'travel' ? 'travel' : 'project'}>
                      {c.mode === 'travel' ? 'Travel & Life' : 'Project & Job Site'}
                    </Badge>
                    <span className="text-xs text-zinc-600">{c.item_count} items</span>
                  </div>
                  <CardTitle className="mt-2">{c.name}</CardTitle>
                  {c.description && <CardDescription>{c.description}</CardDescription>}
                </CardHeader>
                <div className="text-xs text-zinc-600 space-y-1">
                  {c.mode === 'travel' && c.location && <p>{c.location}</p>}
                  {c.mode === 'travel' && c.start_date && (
                    <p>{c.start_date}{c.end_date ? ` — ${c.end_date}` : ''}</p>
                  )}
                  {c.mode === 'project' && c.client_name && <p>{c.client_name}</p>}
                  {c.mode === 'project' && c.site_address && <p>{c.site_address}</p>}
                </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
