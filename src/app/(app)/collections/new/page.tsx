'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModeSelector } from '@/components/collections/mode-selector';
import type { CollectionMode } from '@/types/database';

export default function NewCollectionPage() {
  const [mode, setMode] = useState<CollectionMode | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clientName, setClientName] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode) return;
    setError('');
    setLoading(true);

    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        name,
        description: description || undefined,
        ...(mode === 'travel' && {
          location: location || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
        ...(mode === 'project' && {
          client_name: clientName || undefined,
          project_number: projectNumber || undefined,
          site_address: siteAddress || undefined,
        }),
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || 'Failed to create collection');
      setLoading(false);
      return;
    }

    const { collection } = await res.json();
    router.push(`/collections/${collection.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-100">Create a Collection</h2>
        <p className="text-sm text-zinc-500 mt-1">What type of collection are you creating?</p>
      </div>

      <ModeSelector selected={mode} onSelect={setMode} />

      {mode && (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">{error}</div>
            )}

            <Input label="Collection Name" value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === 'travel' ? 'e.g. Chicago Trip 2026' : 'e.g. Travelers Chicago Install'} required />

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors resize-none"
              />
            </div>

            {mode === 'travel' && (
              <>
                <Input label="Destination" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Chicago, Illinois" />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  <Input label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </>
            )}

            {mode === 'project' && (
              <>
                <Input label="Client Name" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Travelers Insurance" />
                <Input label="Project Number" value={projectNumber} onChange={(e) => setProjectNumber(e.target.value)} placeholder="e.g. PRJ-2026-001" />
                <Input label="Site Address" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} placeholder="e.g. 233 S Wacker Dr, Chicago, IL" />
              </>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={loading}>Create Collection</Button>
              <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
