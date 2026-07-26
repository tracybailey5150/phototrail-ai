'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { MediaItem } from '@/types/database';

const SB = 'https://wwnvebnfjeemaakieqei.supabase.co';

interface MediaGridProps {
  items: MediaItem[];
  supabaseUrl?: string;
  onDelete?: (id: string) => void;
}

export function MediaGrid({ items, onDelete }: MediaGridProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  const openDetail = async (id: string) => {
    setSelected(id);
    setLoadingDetail(true);
    setEditingName(false);
    try {
      const res = await fetch(`/api/media/${id}`);
      if (res.ok) setDetail(await res.json());
    } catch {}
    setLoadingDetail(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this photo?')) return;
    await fetch(`/api/media/${id}`, { method: 'DELETE' });
    setSelected(null);
    setDetail(null);
    onDelete?.(id);
  };

  const handleRename = async (id: string) => {
    if (!newName.trim()) return;
    await fetch(`/api/media/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ original_filename: newName.trim() }),
    });
    // Refresh detail
    const res = await fetch(`/api/media/${id}`);
    if (res.ok) setDetail(await res.json());
    setEditingName(false);
    onDelete?.(id); // triggers parent refresh
  };

  if (!items.length) return null;

  const selectedItem = items.find(i => i.id === selected);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {items.map((item) => (
          <MediaCard key={item.id} item={item} onClick={() => openDetail(item.id)} />
        ))}
      </div>

      {/* Detail Modal */}
      <Modal open={!!selected} onClose={() => { setSelected(null); setDetail(null); setEditingName(false); }} title={editingName ? undefined : (selectedItem?.original_filename || 'Photo Detail')} maxWidth="max-w-3xl">
        {loadingDetail ? (
          <div className="flex justify-center py-8"><div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" /></div>
        ) : detail ? (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Preview */}
            {selectedItem?.thumbnail_path && <img src={`https://wwnvebnfjeemaakieqei.supabase.co/storage/v1/object/public/derivatives/${selectedItem.thumbnail_path}`} alt="" className="w-full rounded-lg max-h-80 object-contain bg-black" />}

            {/* Editable name */}
            <div className="flex items-center gap-2">
              {editingName ? (
                <div className="flex gap-2 flex-1">
                  <input className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-amber-500" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRename(selected!)} autoFocus />
                  <Button size="sm" onClick={() => handleRename(selected!)}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
                </div>
              ) : (
                <>
                  <h3 className="text-base font-semibold text-zinc-100 flex-1">{selectedItem?.original_filename}</h3>
                  <button onClick={() => { setNewName(selectedItem?.original_filename || ''); setEditingName(true); }} className="text-xs text-zinc-500 hover:text-amber-400">Rename</button>
                  <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/media/thumb/${selected}`); alert('Image link copied!'); }} className="text-xs text-zinc-500 hover:text-amber-400">Share</button>
                </>
              )}
            </div>

            {/* AI Summary */}
            {(detail as { aiAnalysis?: { summary?: string } }).aiAnalysis?.summary && (
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">AI Description</h4>
                <p className="text-sm text-zinc-200">{(detail as { aiAnalysis: { summary: string } }).aiAnalysis.summary}</p>
                <div className="flex gap-3 mt-2 text-xs text-zinc-500">
                  {(detail as { aiAnalysis?: { scene_type?: string } }).aiAnalysis?.scene_type && <span>Scene: {(detail as { aiAnalysis: { scene_type: string } }).aiAnalysis.scene_type}</span>}
                  {(detail as { aiAnalysis?: { confidence?: number } }).aiAnalysis?.confidence && <span>Confidence: {Math.round(((detail as { aiAnalysis: { confidence: number } }).aiAnalysis.confidence) * 100)}%</span>}
                  {(detail as { aiAnalysis?: { indoor_outdoor?: string } }).aiAnalysis?.indoor_outdoor && <span>{(detail as { aiAnalysis: { indoor_outdoor: string } }).aiAnalysis.indoor_outdoor}</span>}
                </div>
              </div>
            )}

            {/* Location */}
            {(detail as { location?: { city?: string; country?: string; place_name?: string } }).location?.city && (
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Location</h4>
                <p className="text-sm text-zinc-200">
                  {[(detail as { location: { place_name?: string } }).location.place_name, (detail as { location: { city?: string } }).location.city, (detail as { location: { state_province?: string } }).location.state_province, (detail as { location: { country?: string } }).location.country].filter(Boolean).join(', ')}
                </p>
                {(detail as { location?: { verification_status?: string; confidence?: number } }).location?.verification_status && (
                  <span className="text-xs text-zinc-500">Status: {(detail as { location: { verification_status: string } }).location.verification_status} ({Math.round(((detail as { location: { confidence: number } }).location.confidence || 0) * 100)}%)</span>
                )}
              </div>
            )}

            {/* Timestamp + Manual Date Edit */}
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">Date Taken</h4>
              {(detail as { timestamp?: { best_capture_time?: string; capture_time_source?: string } }).timestamp?.best_capture_time ? (
                <>
                  <p className="text-sm text-zinc-200">{new Date((detail as { timestamp: { best_capture_time: string } }).timestamp.best_capture_time).toLocaleString()}</p>
                  <span className="text-xs text-zinc-500">Source: {(detail as { timestamp: { capture_time_source: string } }).timestamp.capture_time_source}</span>
                </>
              ) : (
                <p className="text-sm text-zinc-500">No capture date detected</p>
              )}
              <div className="mt-2">
                <label className="text-xs text-zinc-500 block mb-1">Set date manually:</label>
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-amber-500"
                    onChange={async (e) => {
                      if (!e.target.value || !selected) return;
                      await fetch(`/api/media/${selected}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ capture_time: new Date(e.target.value).toISOString(), capture_time_source: 'user_confirmed' }),
                      });
                      const res = await fetch(`/api/media/${selected}`);
                      if (res.ok) setDetail(await res.json());
                    }}
                  />
                </div>
              </div>
            </div>

            {/* GPS / Location */}
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Location</h4>
              {selectedItem?.gps_latitude ? (
                <div className="text-sm text-zinc-200">
                  <p>{selectedItem.gps_latitude.toFixed(6)}, {selectedItem.gps_longitude?.toFixed(6)}</p>
                  {(detail as { location?: { city?: string; place_name?: string; state_province?: string; country?: string } }).location?.city && (
                    <p className="text-zinc-400 mt-1">
                      {[(detail as { location: { place_name?: string } }).location.place_name, (detail as { location: { city?: string } }).location.city, (detail as { location: { state_province?: string } }).location.state_province, (detail as { location: { country?: string } }).location.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
              ) : (detail as { aiAnalysis?: { estimated_location?: string } }).aiAnalysis?.estimated_location ? (
                <div>
                  <p className="text-sm text-zinc-200">{(detail as { aiAnalysis: { estimated_location: string } }).aiAnalysis.estimated_location}</p>
                  <span className="text-xs text-amber-400">AI estimated (no GPS data)</span>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No location data</p>
              )}
            </div>

            {/* File Info */}
            {selectedItem && (
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">File Info</h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <span>Size: {((selectedItem.file_size || 0) / 1024 / 1024).toFixed(1)} MB</span>
                  {selectedItem.width && <span>Dimensions: {selectedItem.width} x {selectedItem.height}</span>}
                  <span>Type: {selectedItem.original_mime_type}</span>
                  <span>Status: {selectedItem.processing_status}</span>
                  <span>Uploaded: {new Date(selectedItem.upload_time).toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Equipment (project mode) */}
            {((detail as { equipment?: unknown[] }).equipment || []).length > 0 && (
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">Equipment Detected</h4>
                {((detail as { equipment: Array<{ manufacturer?: string; model?: string; device_type?: string; serial_number_raw?: string; mac_address_raw?: string }> }).equipment).map((eq, i) => (
                  <div key={i} className="text-xs text-zinc-300 mt-1">
                    {[eq.manufacturer, eq.model, eq.device_type].filter(Boolean).join(' — ')}
                    {eq.serial_number_raw && <span className="text-zinc-500 ml-2">S/N: {eq.serial_number_raw}</span>}
                    {eq.mac_address_raw && <span className="text-zinc-500 ml-2">MAC: {eq.mac_address_raw}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* OCR */}
            {(detail as { ocr?: { texts?: string[] } }).ocr?.texts?.length ? (
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1">Visible Text (OCR)</h4>
                <div className="flex flex-wrap gap-1">
                  {((detail as { ocr: { texts: string[] } }).ocr.texts).map((t, i) => (
                    <span key={i} className="bg-zinc-700 text-zinc-300 text-xs px-2 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex gap-2 pt-2">
              <Button variant="danger" size="sm" onClick={() => handleDelete(selected!)}>Delete Photo</Button>
            </div>
          </div>
        ) : (
          <p className="text-zinc-500 text-center py-8">Failed to load details</p>
        )}
      </Modal>
    </>
  );
}

function MediaCard({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  // Use proxy API for thumbnails — guaranteed to work regardless of browser cache or CORS
  const thumbnailUrl = item.thumbnail_path
    ? `https://wwnvebnfjeemaakieqei.supabase.co/storage/v1/object/public/derivatives/${item.thumbnail_path}`
    : null;

  return (
    <div
      onClick={onClick}
      className="group relative bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden cursor-pointer hover:border-amber-500/50 transition-colors"
      style={{ aspectRatio: '1/1', minHeight: 120 }}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={item.original_filename}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          {item.processing_status === 'pending' || item.processing_status === 'processing' ? (
            <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
          ) : item.processing_status === 'failed' ? (
            <span className="text-red-400 text-xs">Failed</span>
          ) : (
            <span className="text-zinc-600 text-xs text-center px-2">{item.original_filename}</span>
          )}
        </div>
      )}

      {/* Overlay on hover/tap */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
        <p className="text-xs text-zinc-200 truncate">{item.original_filename}</p>
        <div className="flex items-center gap-1 mt-1">
          {item.gps_latitude && <span className="text-[10px] text-emerald-400">GPS</span>}
          {item.capture_time && <span className="text-[10px] text-blue-400">Date</span>}
          {item.is_duplicate && <span className="text-[10px] text-yellow-400">Dup</span>}
        </div>
      </div>

      {item.processing_status !== 'completed' && (
        <div className="absolute top-1 right-1">
          <Badge variant={item.processing_status === 'failed' ? 'danger' : 'warning'}>
            {item.processing_status}
          </Badge>
        </div>
      )}
    </div>
  );
}
