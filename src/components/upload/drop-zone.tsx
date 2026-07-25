'use client';

import { useCallback, useState, useRef } from 'react';

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
const MAX_BATCH = 20;

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

  const handleUpload = async () => {
    const queued = files.filter((f) => f.status === 'queued');
    if (!queued.length) return;
    setUploading(true);

    // Upload in batches
    for (let i = 0; i < queued.length; i += MAX_BATCH) {
      const batch = queued.slice(i, i + MAX_BATCH);
      const formData = new FormData();
      formData.append('collection_id', collectionId);
      batch.forEach((f) => formData.append('files', f.file));

      // Mark batch as uploading
      setFiles((prev) =>
        prev.map((f) =>
          batch.find((b) => b.id === f.id) ? { ...f, status: 'uploading' as const } : f
        )
      );

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.results) {
          setFiles((prev) =>
            prev.map((f) => {
              const batchFile = batch.find((b) => b.id === f.id);
              if (!batchFile) return f;
              const idx = batch.indexOf(batchFile);
              const result = data.results[idx];
              if (!result) return { ...f, status: 'error' as const, error: 'No result' };
              return {
                ...f,
                status: result.status === 'uploaded' ? ('processing' as const) : ('error' as const),
                error: result.error,
                mediaId: result.id,
              };
            })
          );
        }
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            batch.find((b) => b.id === f.id) ? { ...f, status: 'error' as const, error: 'Upload failed' } : f
          )
        );
      }
    }

    setUploading(false);

    // Poll for processing completion
    setTimeout(() => {
      onUploadComplete();
      // Mark processing items as done after a delay
      setFiles((prev) =>
        prev.map((f) => (f.status === 'processing' ? { ...f, status: 'done' as const } : f))
      );
    }, 3000);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status !== 'done'));
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
          JPEG, PNG, WebP, HEIC, MP4, MOV — up to 50MB each
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
                <span className="text-xs text-zinc-600">{(f.file.size / 1024).toFixed(0)} KB</span>
                {f.status === 'queued' && (
                  <button onClick={() => removeFile(f.id)} className="text-zinc-600 hover:text-red-400 text-xs">
                    Remove
                  </button>
                )}
                {f.error && <span className="text-xs text-red-400 truncate max-w-32">{f.error}</span>}
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
              {uploading ? `Uploading...` : `Upload ${queuedCount} file${queuedCount !== 1 ? 's' : ''}`}
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
