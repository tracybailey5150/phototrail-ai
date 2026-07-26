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
  mediaId?: string;
}

const ACCEPTED = '.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.bmp,.tiff,.mp4,.mov,.avi,.webm';
const CONCURRENT_UPLOADS = 3;
const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks
const CHUNK_THRESHOLD = 40 * 1024 * 1024; // Files over 40MB use chunked upload

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

  // Upload a single file — small files go direct to Supabase, large files use chunked upload
  const uploadOne = async (f: UploadFile): Promise<void> => {
    setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: 'uploading' as const } : x));

    try {
      const mediaId = crypto.randomUUID();
      const ext = f.file.name.split('.').pop()?.toLowerCase() || 'bin';
      const storagePath = `uploads/${collectionId}/${mediaId}.${ext}`;

      if (f.file.size > CHUNK_THRESHOLD) {
        // Large file — chunked upload through API (bypasses Supabase 50MB limit)
        const totalChunks = Math.ceil(f.file.size / CHUNK_SIZE);
        const uploadId = mediaId;

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, f.file.size);
          const chunk = f.file.slice(start, end);

          const formData = new FormData();
          formData.append('chunk', chunk);
          formData.append('chunkIndex', String(i));
          formData.append('totalChunks', String(totalChunks));
          formData.append('uploadId', uploadId);
          formData.append('storagePath', storagePath);
          formData.append('contentType', f.file.type || 'application/octet-stream');

          const chunkRes = await fetch('/api/upload/chunk', { method: 'POST', body: formData });
          if (!chunkRes.ok) {
            const err = await chunkRes.json().catch(() => ({ error: 'Chunk failed' }));
            setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: 'error' as const, error: `Chunk ${i+1}/${totalChunks}: ${err.error}` } : x));
            return;
          }

          // Update progress
          setFiles((prev) => prev.map((x) => x.id === f.id ? {
            ...x,
            error: `Uploading chunk ${i+1}/${totalChunks} (${Math.round((end/f.file.size)*100)}%)`,
          } : x));
        }
      } else {
        // Small file — direct Supabase Storage upload
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from('originals')
          .upload(storagePath, f.file, {
            contentType: f.file.type || 'application/octet-stream',
            upsert: false,
          });

        if (uploadError) {
          setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: 'error' as const, error: uploadError.message } : x));
          return;
        }
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
        setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: 'error' as const, error: err.error || 'Register failed' } : x));
        return;
      }

      setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: 'processing' as const, mediaId } : x));

      // Step 3: Trigger processing synchronously (separate request with 120s timeout)
      const processRes = await fetch('/api/media/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId }),
      });

      if (processRes.ok) {
        const result = await processRes.json();
        setFiles((prev) => prev.map((x) => x.id === f.id ? {
          ...x,
          status: result.success ? 'done' as const : 'error' as const,
          error: result.error || undefined,
        } : x));
      } else {
        // Processing failed but file is uploaded — mark as done anyway
        setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: 'done' as const } : x));
      }
    } catch (err) {
      const msg = err instanceof Error ? `Error: ${err.message}` : 'Network error — check connection';
      setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: 'error' as const, error: msg } : x));
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
    setFiles((prev) => prev.map((f) => f.status === 'error' ? { ...f, status: 'queued' as const, error: undefined } : f));
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
                <span className="flex-1 text-sm text-zinc-300 truncate">{f.file.name}</span>
                <span className="text-xs text-zinc-600">{(f.file.size / 1024 / 1024).toFixed(1)} MB</span>
                {f.status === 'queued' && (
                  <button onClick={() => removeFile(f.id)} className="text-zinc-600 hover:text-red-400 text-xs">
                    Remove
                  </button>
                )}
                {f.error && <span className="text-xs text-red-400 truncate max-w-48">{f.error}</span>}
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
      return <span className="w-2 h-2 rounded-full bg-zinc-500" />;
    case 'uploading':
      return <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />;
    case 'processing':
      return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />;
    case 'done':
      return <span className="w-2 h-2 rounded-full bg-emerald-400" />;
    case 'error':
      return <span className="w-2 h-2 rounded-full bg-red-400" />;
    default:
      return <span className="w-2 h-2 rounded-full bg-zinc-700" />;
  }
}
