'use client';

import { useCallback, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface DropZoneProps {
  collectionId: string;
  onUploadComplete: () => void;
}

interface UploadFile {
  file: File;
  id: string;
  status: 'queued' | 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
  progress?: number;
  mediaId?: string;
}

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.bmp,.tiff,.mp4,.mov,.avi,.webm';
const CONCURRENT_UPLOADS = 3;
const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB chunks (under Vercel 4.5MB body limit with FormData overhead)
const CHUNK_THRESHOLD = 6 * 1024 * 1024; // Files over 6MB use chunked upload (mobile-friendly)
const MAX_CHUNK_RETRIES = 3;

async function uploadChunkWithRetry(
  formData: FormData,
  retries: number = MAX_CHUNK_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch('/api/upload/chunk', { method: 'POST', body: formData });
      if (res.ok) return res;

      // On server error, retry; on client error (4xx), don't retry
      if (res.status < 500 && res.status >= 400) return res;

      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        return res;
      }
    } catch (err) {
      // Network error — retry
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

export function DropZone({ collectionId, onUploadComplete }: DropZoneProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const newFiles: UploadFile[] = Array.from(fileList).map((file) => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'queued' as const,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const updateFile = (id: string, updates: Partial<UploadFile>) => {
    setFiles((prev) => prev.map((x) => x.id === id ? { ...x, ...updates } : x));
  };

  // Upload a single file — small files go direct to Supabase, large files use chunked upload
  const uploadOne = async (f: UploadFile): Promise<void> => {
    updateFile(f.id, { status: 'uploading', progress: 0 });

    try {
      const mediaId = crypto.randomUUID();
      const ext = f.file.name.split('.').pop()?.toLowerCase() || 'bin';
      const storagePath = `uploads/${collectionId}/${mediaId}.${ext}`;

      if (f.file.size > CHUNK_THRESHOLD) {
        // Chunked upload — works for any file size
        const totalChunks = Math.ceil(f.file.size / CHUNK_SIZE);
        const uploadId = mediaId;

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, f.file.size);
          const chunk = f.file.slice(start, end);
          const pct = Math.round((end / f.file.size) * 100);

          updateFile(f.id, { progress: pct });

          const formData = new FormData();
          formData.append('chunk', chunk);
          formData.append('chunkIndex', String(i));
          formData.append('totalChunks', String(totalChunks));
          formData.append('uploadId', uploadId);
          formData.append('storagePath', storagePath);
          formData.append('contentType', f.file.type || 'application/octet-stream');

          const chunkRes = await uploadChunkWithRetry(formData);
          if (!chunkRes.ok) {
            const err = await chunkRes.json().catch(() => ({ error: 'Chunk failed' }));
            updateFile(f.id, { status: 'error', error: `Chunk ${i + 1}/${totalChunks}: ${err.error}` });
            return;
          }

          // On last chunk, the server merges — this may take extra time
          if (i === totalChunks - 1) {
            updateFile(f.id, { progress: 99 });
          }
        }
        updateFile(f.id, { progress: 100 });
      } else {
        // Small file — direct Supabase Storage upload
        updateFile(f.id, { progress: 50 });
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from('originals')
          .upload(storagePath, f.file, {
            contentType: f.file.type || 'application/octet-stream',
            upsert: false,
          });

        if (uploadError) {
          updateFile(f.id, { status: 'error', error: uploadError.message });
          return;
        }
        updateFile(f.id, { progress: 100 });
      }

      // Step 2: Register the media item and trigger processing via API
      const res = await fetch('/api/upload/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId,
          collectionId,
          filename: f.file.name,
          contentType: f.file.type || 'application/octet-stream',
          fileSize: f.file.size,
          storagePath,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Register failed' }));
        updateFile(f.id, { status: 'error', error: err.error || 'Register failed' });
        return;
      }

      updateFile(f.id, { status: 'processing', mediaId });

      // Step 3: Trigger processing (separate request with long timeout)
      const processRes = await fetch('/api/media/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId }),
      });

      if (processRes.ok) {
        const result = await processRes.json();
        updateFile(f.id, {
          status: result.success ? 'done' : 'error',
          error: result.error || undefined,
        });
      } else {
        // Processing failed but file is uploaded — mark as done anyway
        updateFile(f.id, { status: 'done' });
      }
    } catch (err) {
      const msg = err instanceof Error ? `Error: ${err.message}` : 'Network error — check connection';
      updateFile(f.id, { status: 'error', error: msg });
    }
  };

  const handleUpload = async () => {
    const queued = files.filter((f) => f.status === 'queued');
    if (!queued.length) return;
    setUploading(true);

    // Process files with concurrent workers (3 at a time)
    const queue = [...queued];
    const workers = Array.from({ length: Math.min(CONCURRENT_UPLOADS, queue.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next) await uploadOne(next);
      }
    });

    await Promise.all(workers);

    setUploading(false);
    onUploadComplete();

    // Mark processing items as done after a delay
    setTimeout(() => {
      setFiles((prev) =>
        prev.map((f) => (f.status === 'processing' ? { ...f, status: 'done' as const } : f))
      );
    }, 5000);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status !== 'done'));
  };

  const retryFailed = () => {
    setFiles((prev) => prev.map((f) => f.status === 'error' ? { ...f, status: 'queued' as const, error: undefined, progress: undefined } : f));
  };

  const queuedCount = files.filter((f) => f.status === 'queued').length;
  const uploadingCount = files.filter((f) => f.status === 'uploading' || f.status === 'processing').length;
  const doneCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);

  return (
    <div className="space-y-4">
      {/* Drop area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
          dragging
            ? 'border-amber-500 bg-amber-500/10'
            : 'border-zinc-700 hover:border-zinc-600 bg-zinc-900/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <span className="text-4xl">📷</span>
        <p className="mt-3 text-zinc-300 font-medium">
          {dragging ? 'Drop files here' : 'Drag & drop photos and videos'}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          JPEG, PNG, WebP, HEIC, MP4, MOV — photos and videos — no size limit
        </p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          {/* Summary bar */}
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <div className="flex gap-4">
              <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
              <span>{(totalSize / 1024 / 1024).toFixed(1)} MB</span>
              {queuedCount > 0 && <span className="text-amber-400">{queuedCount} queued</span>}
              {uploadingCount > 0 && <span className="text-blue-400">{uploadingCount} processing</span>}
              {doneCount > 0 && <span className="text-emerald-400">{doneCount} done</span>}
              {errorCount > 0 && <span className="text-red-400">{errorCount} failed</span>}
            </div>
            <div className="flex gap-2">
              {errorCount > 0 && (
                <button onClick={retryFailed} className="text-amber-400 hover:text-amber-300">
                  Retry failed
                </button>
              )}
              {doneCount > 0 && (
                <button onClick={clearCompleted} className="text-zinc-500 hover:text-zinc-300">
                  Clear completed
                </button>
              )}
            </div>
          </div>

          {/* File rows */}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-950/50">
                <StatusIcon status={f.status} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-zinc-300 truncate block">{f.file.name}</span>
                  {f.status === 'uploading' && f.progress != null && (
                    <div className="mt-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all duration-300"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                  )}
                </div>
                <span className="text-xs text-zinc-600 shrink-0">{(f.file.size / 1024 / 1024).toFixed(1)} MB</span>
                {f.status === 'uploading' && f.progress != null && (
                  <span className="text-xs text-amber-400 shrink-0 w-10 text-right">{f.progress}%</span>
                )}
                {f.status === 'queued' && (
                  <button onClick={() => removeFile(f.id)} className="text-zinc-600 hover:text-red-400 text-xs shrink-0">
                    Remove
                  </button>
                )}
                {f.error && f.status === 'error' && <span className="text-xs text-red-400 truncate max-w-48">{f.error}</span>}
              </div>
            ))}
          </div>

          {/* Upload button */}
          {queuedCount > 0 && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {uploading ? `Uploading (${uploadingCount} active)...` : `Upload ${queuedCount} file${queuedCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'queued':
      return <span className="w-2 h-2 rounded-full bg-zinc-500 shrink-0" />;
    case 'uploading':
      return <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />;
    case 'processing':
      return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />;
    case 'done':
      return <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />;
    case 'error':
      return <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />;
    default:
      return <span className="w-2 h-2 rounded-full bg-zinc-700 shrink-0" />;
  }
}
