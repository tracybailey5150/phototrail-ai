'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/organizations').then(r => r.json()).then(data => {
      setOrgName(data.organization?.name || '');
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/organizations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: orgName }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold text-zinc-100">Settings</h2>
      <Card>
        <CardHeader><CardTitle>Organization</CardTitle></CardHeader>
        <div className="space-y-4">
          <Input label="Organization Name" value={orgName} onChange={e => setOrgName(e.target.value)} />
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} loading={saving}>Save Changes</Button>
            {saved && <span className="text-sm text-emerald-400">Saved</span>}
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <p className="text-sm text-zinc-500">Password changes, data export, and account deletion coming soon.</p>
      </Card>
    </div>
  );
}
