'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export default function SharePage() {
  const { token } = useParams();
  const router = useRouter();
  const [share, setShare] = useState<Record<string, unknown> | null>(null);
  const [collection, setCollection] = useState<Record<string, unknown> | null>(null);
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<{ file: File; id: string; status: string; error?: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function load() {
      // Check if user is logged in
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u as Record<string, unknown> | null);

      // Validate token
      const res = await fetch(`/api/share/${token}`);
      if (!res.ok) {
        setError('Invalid or expired share link');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setShare(data.share);
      setCollection(data.collection);
      setLoading(false);
    }
    load();
  }, [token]);

  const addFiles = useCallback((fileList: FileList) => {
    const newFiles = Array.from(fileList).map(file => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'queued',
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleUpload = async () => {
    if (!user) {
      // Redirect to signup with return URL
      router.push(`/signup?redirect=/share/${token}`);
      return;
    }

    const queued = files.filter(f => f.status === 'queued');
    if (!queued.length || !share) return;
    setUploading(true);

    const supabase = createClient();
    const collectionId = share.collection_id as string;

    for (const f of queued) {
      setFiles(prev => prev.map(x => x.id === f.id ? { ...x, status: 'uploading' } : x));

      try {
        const mediaId = crypto.randomUUID();
        const ext = f.file.name.split('.').pop()?.toLowerCase() || 'bin';
        const storagePath = `uploads/${collectionId}/contrib_${mediaId}.${ext}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('originals')
          .upload(storagePath, f.file, {
            contentType: f.file.type || 'application/octet-stream',
            upsert: false,
          });

        if (uploadError) {
          setFiles(prev => prev.map(x => x.id === f.id ? { ...x, status: 'error', error: uploadError.message } : x));
          continue;
        }

        // Register with contributor tracking
        const regRes = await fetch('/api/upload/contribute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaId,
            collectionId,
            token,
            filename: f.file.name,
            contentType: f.file.type,
            fileSize: f.file.size,
            storagePath,
          }),
        });

        if (!regRes.ok) {
          const err = await regRes.json().catch(() => ({ error: 'Failed' }));
          setFiles(prev => prev.map(x => x.id === f.id ? { ...x, status: 'error', error: err.error } : x));
          continue;
        }

        setFiles(prev => prev.map(x => x.id === f.id ? { ...x, status: 'done' } : x));
      } catch {
        setFiles(prev => prev.map(x => x.id === f.id ? { ...x, status: 'error', error: 'Network error' } : x));
      }
    }

    setUploading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pt-bg">
        <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pt-bg px-4">
        <Card className="max-w-md w-full text-center">
          <span className="text-4xl">🔗</span>
          <h2 className="mt-3 text-lg font-bold text-zinc-100">Link Unavailable</h2>
          <p className="mt-2 text-sm text-zinc-500">{error}</p>
          <Button className="mt-4" onClick={() => router.push('/login')}>Go to PhotoTrail AI</Button>
        </Card>
      </div>
    );
  }

  const queuedCount = files.filter(f => f.status === 'queued').length;
  const doneCount = files.filter(f => f.status === 'done').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <div className="min-h-screen bg-pt-bg px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <img src="/logo.png" alt="PhotoTrail AI" className="h-16 mx-auto" />
          <p className="mt-2 text-xs text-zinc-500">Shared Collection</p>
        </div>

        {/* Collection info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge variant={(collection?.mode as string) === 'travel' ? 'travel' : 'project'}>
                {(collection?.mode as string) === 'travel' ? 'Travel & Life' : 'Project & Job Site'}
              </Badge>
            </div>
            <CardTitle className="mt-2">{collection?.name as string}</CardTitle>
            {collection?.description && <CardDescription>{collection.description as string}</CardDescription>}
          </CardHeader>
          <p className="text-sm text-zinc-400">
            You&apos;ve been invited to contribute photos to this collection.
            {!user && ' Sign in or create an account to upload.'}
          </p>
        </Card>

        {/* Auth prompt */}
        {!user && (
          <Card>
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-zinc-300">Sign in to upload photos to this collection</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => router.push(`/login?redirect=/share/${token}`)}>Sign In</Button>
                <Button variant="secondary" onClick={() => router.push(`/signup?redirect=/share/${token}`)}>Create Account</Button>
              </div>
            </div>
          </Card>
        )}

        {/* Upload zone — only for authenticated users */}
        {user && (
          <>
            <div
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov';
                input.multiple = true;
                input.onchange = () => input.files && addFiles(input.files);
                input.click();
              }}
              className="border-2 border-dashed border-zinc-700 hover:border-amber-500 rounded-xl p-12 text-center cursor-pointer transition-colors"
            >
              <span className="text-4xl">📷</span>
              <p className="mt-3 text-zinc-300 font-medium">Tap to select photos and videos</p>
              <p className="mt-1 text-xs text-zinc-500">Your uploads will be tracked as contributions from {(user as { email?: string }).email}</p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <Card>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
                    <div className="flex gap-3">
                      {queuedCount > 0 && <span className="text-amber-400">{queuedCount} ready</span>}
                      {doneCount > 0 && <span className="text-emerald-400">{doneCount} uploaded</span>}
                      {errorCount > 0 && <span className="text-red-400">{errorCount} failed</span>}
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {files.map(f => (
                      <div key={f.id} className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800/50 text-sm">
                        <span className={`w-2 h-2 rounded-full ${
                          f.status === 'done' ? 'bg-emerald-400' :
                          f.status === 'error' ? 'bg-red-400' :
                          f.status === 'uploading' ? 'bg-blue-400 animate-pulse' :
                          'bg-zinc-500'
                        }`} />
                        <span className="flex-1 text-zinc-300 truncate">{f.file.name}</span>
                        {f.error && <span className="text-xs text-red-400 truncate max-w-32">{f.error}</span>}
                      </div>
                    ))}
                  </div>

                  {queuedCount > 0 && (
                    <Button className="w-full" loading={uploading} onClick={handleUpload}>
                      Upload {queuedCount} file{queuedCount !== 1 ? 's' : ''}
                    </Button>
                  )}
                </div>
              </Card>
            )}

            {doneCount > 0 && queuedCount === 0 && !uploading && (
              <Card>
                <div className="text-center py-4">
                  <span className="text-3xl">🎉</span>
                  <p className="mt-2 text-sm text-emerald-400 font-medium">{doneCount} photo{doneCount !== 1 ? 's' : ''} contributed!</p>
                  <p className="mt-1 text-xs text-zinc-500">The collection owner will see your contributions.</p>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
