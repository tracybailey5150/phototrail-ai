'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Collection, ActivityEvent } from '@/types/database';

export default function DashboardPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/collections').then((r) => r.json()),
      fetch('/api/activity').then((r) => r.json()),
    ]).then(([col, act]) => {
      setCollections(col.collections || []);
      setActivity(act.events || []);
      setLoading(false);
    });
  }, []);

  const travelCount = collections.filter((c) => c.mode === 'travel').length;
  const projectCount = collections.filter((c) => c.mode === 'project').length;
  const totalItems = collections.reduce((sum, c) => sum + c.item_count, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Collections', value: collections.length, color: 'text-amber-400' },
          { label: 'Travel & Life', value: travelCount, color: 'text-amber-400' },
          { label: 'Project & Job Site', value: projectCount, color: 'text-blue-400' },
          { label: 'Total Items', value: totalItems, color: 'text-zinc-100' },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Link href="/collections/new">
          <Button>New Collection</Button>
        </Link>
        <Link href="/collections">
          <Button variant="secondary">View All</Button>
        </Link>
      </div>

      {/* Recent Collections */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Recent Collections</h2>
        {collections.length === 0 ? (
          <Card>
            <div className="text-center py-8">
              <p className="text-zinc-500">No collections yet.</p>
              <Link href="/collections/new" className="text-amber-400 text-sm hover:text-amber-300 mt-2 inline-block">
                Create your first collection
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.slice(0, 6).map((c) => (
              <Link key={c.id} href={`/collections/${c.id}`}>
                <Card className="hover:border-zinc-700 transition-colors cursor-pointer">
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
                  <div className="text-xs text-zinc-600">
                    {c.mode === 'travel' && c.location && <span>{c.location}</span>}
                    {c.mode === 'project' && c.client_name && <span>{c.client_name}</span>}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Recent Activity</h2>
        {activity.length === 0 ? (
          <Card>
            <p className="text-zinc-500 text-center py-4">No activity yet.</p>
          </Card>
        ) : (
          <Card padding={false}>
            <div className="divide-y divide-zinc-800">
              {activity.slice(0, 10).map((event) => (
                <div key={event.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-200">{event.title}</p>
                    {event.description && <p className="text-xs text-zinc-500">{event.description}</p>}
                  </div>
                  <span className="text-xs text-zinc-600 whitespace-nowrap">
                    {new Date(event.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
