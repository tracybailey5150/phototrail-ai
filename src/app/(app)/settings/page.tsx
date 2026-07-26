'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // AI Context settings
  const [aiContext, setAiContext] = useState({
    default_location: '',
    location_hints: '',
    travel_context: '',
    time_period: '',
    custom_instructions: '',
  });
  const [savingAi, setSavingAi] = useState(false);
  const [savedAi, setSavedAi] = useState(false);

  useEffect(() => {
    fetch('/api/organizations').then(r => r.json()).then(data => {
      setOrgName(data.organization?.name || '');
      const settings = data.organization?.settings || {};
      if (settings.ai_context) {
        setAiContext(prev => ({ ...prev, ...settings.ai_context }));
      }
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

  const handleSaveAi = async () => {
    setSavingAi(true);
    await fetch('/api/organizations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_context: aiContext }),
    });
    setSavingAi(false);
    setSavedAi(true);
    setTimeout(() => setSavedAi(false), 2000);
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
        <CardHeader>
          <CardTitle>AI Analysis Context</CardTitle>
          <CardDescription>Help the AI get locations and descriptions right. This info is sent with every image analysis and deep research request.</CardDescription>
        </CardHeader>
        <div className="space-y-4">
          <Input
            label="Default Location / Home Base"
            value={aiContext.default_location}
            onChange={e => setAiContext(prev => ({ ...prev, default_location: e.target.value }))}
            placeholder="e.g. Northwest Arkansas, USA"
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">Location Hints</label>
            <textarea
              value={aiContext.location_hints}
              onChange={e => setAiContext(prev => ({ ...prev, location_hints: e.target.value }))}
              rows={3}
              placeholder="Tell the AI about places you frequently photograph. e.g. 'Most photos are from Chicago, IL — specifically the Loop, River North, and Navy Pier areas. Also frequent: Bentonville AR, Fayetteville AR.'"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">Travel Context</label>
            <textarea
              value={aiContext.travel_context}
              onChange={e => setAiContext(prev => ({ ...prev, travel_context: e.target.value }))}
              rows={3}
              placeholder="Recent trips or events. e.g. 'July 2024 trip to Chicago — stayed at Hyatt Regency, visited Navy Pier, architecture river cruise, Willis Tower Skydeck, Millennium Park.'"
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
            <label className="block text-sm font-medium text-zinc-300">Custom AI Instructions</label>
            <textarea
              value={aiContext.custom_instructions}
              onChange={e => setAiContext(prev => ({ ...prev, custom_instructions: e.target.value }))}
              rows={3}
              placeholder="Any other guidance. e.g. 'I work in AV integration — photos of equipment are from job sites, not personal. Identify Crestron, Extron, Biamp, QSC equipment when visible.'"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSaveAi} loading={savingAi}>Save AI Context</Button>
            {savedAi && <span className="text-sm text-emerald-400">Saved</span>}
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
