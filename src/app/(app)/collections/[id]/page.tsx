'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropZone } from '@/components/upload/drop-zone';
import { MediaGrid } from '@/components/upload/media-grid';
import type { Collection, CollectionSettings, MediaItem } from '@/types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wwnvebnfjeemaakieqei.supabase.co';

export default function CollectionDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [colSettings, setColSettings] = useState<CollectionSettings | null>(null);
  const [aiContext, setAiContext] = useState({
    default_location: '',
    location_hints: '',
    travel_context: '',
    time_period: '',
    custom_instructions: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettings, setSavedSettings] = useState(false);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch(`/api/collections/${id}`).then((r) => r.json()),
      fetch(`/api/media?collection_id=${id}`).then((r) => r.json()),
      fetch(`/api/collections/${id}/settings`).then((r) => r.json()),
    ]).then(([col, media, settingsRes]) => {
      setCollection(col.collection || null);
      setMediaItems(media.items || []);
      const s = settingsRes.settings;
      setColSettings(s || null);
      if (s?.settings?.ai_context) {
        setAiContext(prev => ({ ...prev, ...(s.settings.ai_context as Record<string, string>) }));
      }
      setLoading(false);
    });
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll for processing updates every 5s if items are still processing
  useEffect(() => {
    const hasProcessing = mediaItems.some(
      (m) => m.processing_status === 'pending' || m.processing_status === 'processing'
    );
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetch(`/api/media?collection_id=${id}`).then((r) => r.json()).then((data) => {
        setMediaItems(data.items || []);
      });
      // Also refresh collection for updated item_count
      fetch(`/api/collections/${id}`).then((r) => r.json()).then((data) => {
        if (data.collection) setCollection(data.collection);
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [id, mediaItems]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!collection) {
    return (
      <Card>
        <p className="text-center text-zinc-500 py-8">Collection not found.</p>
      </Card>
    );
  }

  const completedItems = mediaItems.filter((m) => m.processing_status === 'completed');
  const processingItems = mediaItems.filter(
    (m) => m.processing_status === 'pending' || m.processing_status === 'processing'
  );
  const failedItems = mediaItems.filter((m) => m.processing_status === 'failed');
  const withGps = mediaItems.filter((m) => m.gps_latitude != null);
  const withDate = mediaItems.filter((m) => m.capture_time != null);
  const duplicates = mediaItems.filter((m) => m.is_duplicate);

  const startEdit = () => {
    setEditName(collection.name);
    setEditDesc(collection.description || '');
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    const res = await fetch(`/api/collections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, description: editDesc || undefined }),
    });
    if (res.ok) {
      const { collection: updated } = await res.json();
      setCollection(updated);
      setEditing(false);
    }
    setSaving(false);
  };

  const deleteCollection = async () => {
    if (!confirm('Delete this collection and all its photos? This cannot be undone.')) return;
    const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/collections');
  };

  const handleToggleSetting = async (key: string, value: boolean) => {
    const res = await fetch(`/api/collections/${id}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    if (res.ok) {
      const { settings } = await res.json();
      setColSettings(settings);
    }
  };

  const handleSaveAiContext = async () => {
    setSavingSettings(true);
    const res = await fetch(`/api/collections/${id}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_context: aiContext }),
    });
    if (res.ok) {
      const { settings } = await res.json();
      setColSettings(settings);
      setSavedSettings(true);
      setTimeout(() => setSavedSettings(false), 2000);
    }
    setSavingSettings(false);
  };

  return (
    <div className="max-w-6xl space-y-6">
      {/* Collection header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant={collection.mode === 'travel' ? 'travel' : 'project'}>
                {collection.mode === 'travel' ? 'Travel & Life' : 'Project & Job Site'}
              </Badge>
              <Badge variant="success">{collection.status}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={async () => {
                const res = await fetch(`/api/collections/${id}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                if (res.ok) {
                  const { url } = await res.json();
                  const fullUrl = `${window.location.origin}${url}`;
                  await navigator.clipboard.writeText(fullUrl);
                  alert(`Share link copied!\n\n${fullUrl}\n\nAnyone with this link can sign in and contribute photos.`);
                }
              }}>Share</Button>
              <Button variant="ghost" size="sm" onClick={startEdit}>Edit</Button>
              <Button variant="danger" size="sm" onClick={deleteCollection}>Delete</Button>
            </div>
          </div>
          {editing ? (
            <div className="mt-3 space-y-3">
              <Input label="Name" value={editName} onChange={e => setEditName(e.target.value)} />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-zinc-300">Description</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit} loading={saving}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <CardTitle className="text-2xl mt-2">{collection.name}</CardTitle>
              {collection.description && <CardDescription>{collection.description}</CardDescription>}
            </>
          )}
        </CardHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          {collection.mode === 'travel' && collection.location && (
            <div><span className="text-zinc-500">Destination:</span> <span className="text-zinc-200">{collection.location}</span></div>
          )}
          {collection.mode === 'travel' && collection.start_date && (
            <div><span className="text-zinc-500">Dates:</span> <span className="text-zinc-200">{collection.start_date}{collection.end_date ? ` — ${collection.end_date}` : ''}</span></div>
          )}
          {collection.mode === 'project' && collection.client_name && (
            <div><span className="text-zinc-500">Client:</span> <span className="text-zinc-200">{collection.client_name}</span></div>
          )}
          {collection.mode === 'project' && collection.project_number && (
            <div><span className="text-zinc-500">Project #:</span> <span className="text-zinc-200">{collection.project_number}</span></div>
          )}
          {collection.mode === 'project' && collection.site_address && (
            <div><span className="text-zinc-500">Site:</span> <span className="text-zinc-200">{collection.site_address}</span></div>
          )}
        </div>
      </Card>

      {/* Stats bar */}
      {mediaItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: mediaItems.length, color: 'text-zinc-100' },
            { label: 'Completed', value: completedItems.length, color: 'text-emerald-400' },
            { label: 'Processing', value: processingItems.length, color: 'text-amber-400' },
            { label: 'With GPS', value: withGps.length, color: 'text-blue-400' },
            { label: 'With Date', value: withDate.length, color: 'text-purple-400' },
            { label: 'Duplicates', value: duplicates.length, color: 'text-yellow-400' },
          ].map((stat) => (
            <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
              <p className="text-xs text-zinc-500">{stat.label}</p>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      <DropZone collectionId={collection.id} onUploadComplete={fetchData} />

      {/* Media grid */}
      {mediaItems.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Media ({mediaItems.length})
            {failedItems.length > 0 && (
              <span className="text-red-400 ml-2">({failedItems.length} failed)</span>
            )}
          </h2>
          <MediaGrid items={mediaItems} onDelete={(id) => { setMediaItems(prev => prev.filter(m => m.id !== id)); fetchData(); }} />
        </div>
      )}

      {/* Collection Settings */}
      <Card>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-amber-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.212-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            <span className="font-semibold text-zinc-100">Collection Settings</span>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`w-4 h-4 text-zinc-500 transition-transform ${settingsOpen ? 'rotate-180' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {settingsOpen && (
          <div className="border-t border-zinc-800 p-4 space-y-6">
            {/* Processing toggles */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Processing Options</h3>
              <div className="space-y-3">
                {[
                  { key: 'ai_analysis', label: 'AI Analysis', desc: 'Run AI visual analysis on uploaded photos' },
                  { key: 'extract_gps', label: 'Extract GPS', desc: 'Extract and resolve GPS coordinates from EXIF data' },
                  { key: 'auto_group', label: 'Auto-Group', desc: 'Automatically group photos into trips, days, and events' },
                  { key: 'extract_serial_numbers', label: 'Extract Serial Numbers', desc: 'Detect equipment serial numbers and model info in photos' },
                ].map((toggle) => (
                  <label key={toggle.key} className="flex items-center justify-between gap-4 cursor-pointer group">
                    <div>
                      <div className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100">{toggle.label}</div>
                      <div className="text-xs text-zinc-500">{toggle.desc}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        const current = colSettings?.[toggle.key as keyof CollectionSettings] as boolean ?? true;
                        handleToggleSetting(toggle.key, !current);
                      }}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        (colSettings?.[toggle.key as keyof CollectionSettings] as boolean ?? true)
                          ? 'bg-amber-500'
                          : 'bg-zinc-700'
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        (colSettings?.[toggle.key as keyof CollectionSettings] as boolean ?? true)
                          ? 'translate-x-5'
                          : ''
                      }`} />
                    </button>
                  </label>
                ))}
              </div>
            </div>

            {/* Confidence threshold */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Confidence Threshold</h3>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={colSettings?.default_confidence_threshold ?? 0.7}
                  onChange={(e) => handleToggleSetting('default_confidence_threshold', parseFloat(e.target.value) as unknown as boolean)}
                  className="flex-1 accent-amber-500"
                />
                <span className="text-sm font-mono text-zinc-300 w-12 text-right">
                  {((colSettings?.default_confidence_threshold ?? 0.7) * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">Minimum AI confidence score to auto-accept location and analysis results</p>
            </div>

            {/* AI Context */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-1">AI Analysis Context</h3>
              <p className="text-xs text-zinc-500 mb-3">Help the AI get locations and descriptions right for this collection. This info is sent with every image analysis request.</p>

              <div className="space-y-3">
                <Input
                  label="Default Location / Home Base"
                  value={aiContext.default_location}
                  onChange={e => setAiContext(prev => ({ ...prev, default_location: e.target.value }))}
                  placeholder="e.g. Northwest Arkansas, USA"
                />

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-400">Location Hints</label>
                  <textarea
                    value={aiContext.location_hints}
                    onChange={e => setAiContext(prev => ({ ...prev, location_hints: e.target.value }))}
                    rows={2}
                    placeholder="Places in this collection. e.g. 'Photos from Chicago — Loop, River North, Navy Pier'"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-400">Travel / Project Context</label>
                  <textarea
                    value={aiContext.travel_context}
                    onChange={e => setAiContext(prev => ({ ...prev, travel_context: e.target.value }))}
                    rows={2}
                    placeholder="Context for this collection. e.g. 'July 2024 trip to Chicago — Hyatt Regency, architecture river cruise'"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
                  />
                </div>

                <Input
                  label="Time Period"
                  value={aiContext.time_period}
                  onChange={e => setAiContext(prev => ({ ...prev, time_period: e.target.value }))}
                  placeholder="e.g. Summer 2024, July 22-25 2024"
                />

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-400">Custom AI Instructions</label>
                  <textarea
                    value={aiContext.custom_instructions}
                    onChange={e => setAiContext(prev => ({ ...prev, custom_instructions: e.target.value }))}
                    rows={2}
                    placeholder="Any other guidance. e.g. 'I work in AV — identify Crestron, Extron, Biamp equipment when visible.'"
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={handleSaveAiContext} loading={savingSettings} size="sm">
                    Save AI Context
                  </Button>
                  {savedSettings && <span className="text-sm text-emerald-400">Saved</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
