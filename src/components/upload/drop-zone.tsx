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
// Files over this size use signed URL upload (direct to Supabase storage, no size limit)
const SIGNED_URL_THRESHOLD = 4 * 1024 * 1024; // 4MB

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

  // Upload using XMLHttpRequest with FormData (matching Supabase signed URL format)
  function uploadWithProgress(url: string, file: File, token: string, storagePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 95);
          setFiles((prev) => prev.map((f) =>
            f.status === 'uploading' && f.file === file
              ? { ...f, progress: pct }
              : f
          ));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText?.substring(0, 200) || xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
      xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

      // Supabase signed URL expects FormData with the file appended
      const formData = new FormData();
      formData.append('cacheControl', '3600');
      formData.append('', file);

      // signedUrl already contains the token as a query param
      xhr.open('PUT', url);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.timeout = 600000; // 10 minute timeout
      xhr.send(formData);
    });
  }

  const uploadOne = async (f: UploadFile): Promise<void> => {
    updateFile(f.id, { status: 'uploading', progress: 0 });

    try {
      const mediaId = crypto.randomUUID();
      const ext = f.file.name.split('.').pop()?.toLowerCase() || 'bin';
      const storagePath = `uploads/${collectionId}/${mediaId}.${ext}`;
      const contentType = f.file.type || 'application/octet-stream';

      if (f.file.size > SIGNED_URL_THRESHOLD) {
        // Large file — get a signed URL and upload directly to Supabase storage
        const signedRes = await fetch('/api/upload/signed-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath }),
        });

        if (!signedRes.ok) {
          const err = await signedRes.json().catch(() => ({ error: 'Failed to get upload URL' }));
          updateFile(f.id, { status: 'error', error: err.error });
          return;
        }

        const { signedUrl, token } = await signedRes.json();

        // Upload directly with XHR for real progress (FormData format for Supabase)
        await uploadWithProgress(signedUrl, f.file, token, storagePath);
        updateFile(f.id, { progress: 97 });

      } else {
        // Small file — direct Supabase client upload
        updateFile(f.id, { progress: 50 });
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from('originals')
          .upload(storagePath, f.file, { contentType, upsert: false });

        if (uploadError) {
          updateFile(f.id, { status: 'error', error: uploadError.message });
          return;
        }
        updateFile(f.id, { progress: 97 });
      }

      // Register the media item
      const res = await fetch('/api/upload/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId,
          collectionId,
          filename: f.file.name,
          contentType,
          fileSize: f.file.size,
          storagePath,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Register failed' }));
        updateFile(f.id, { status: 'error', error: err.error || 'Register failed' });
        return;
      }

      updateFile(f.id, { status: 'processing', progress: 100, mediaId });

      // Trigger processing
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
        // Processing failed but file is uploaded
        updateFile(f.id, { status: 'done' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error — check connection';
      updateFile(f.id, { status: 'error', error: msg });
    }
  };

  const handleUpload = async () => {
    const queued = files.filter((f) => f.status === 'queued');
    if (!queued.length) return;
    setUploading(true);

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

    setTimeout(() => {
      setFiles((prev) =>
        prev.map((f) => (f.status === 'processing' ? { ...f, status: 'done' as const } : f))
      );
    }, 5000);
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const clearCompleted = () => setFiles((prev) => prev.filter((f) => f.status !== 'done'));
  const retryFailed = () => setFiles((prev) => prev.map((f) =>
    f.status === 'error' ? { ...f, status: 'queued' as const, error: undefined, progress: undefined } : f
  ));

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
    case 'queued': return <span className="w-2 h-2 rounded-full bg-zinc-500 shrink-0" />;
    case 'uploading': return <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />;
    case 'processing': return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />;
    case 'done': return <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />;
    case 'error': return <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />;
    default: return <span className="w-2 h-2 rounded-full bg-zinc-700 shrink-0" />;
  }
}
