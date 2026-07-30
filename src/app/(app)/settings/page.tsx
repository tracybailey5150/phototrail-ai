'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { createClient } from '@/lib/supabase/client';

export default function SettingsPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      setPasswordMsg({ text: 'Password must be at least 8 characters', ok: false });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: 'Passwords do not match', ok: false });
      return;
    }
    setSavingPassword(true);
    setPasswordMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      setPasswordMsg({ text: error.message, ok: false });
    } else {
      setPasswordMsg({ text: 'Password updated successfully', ok: true });
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordMsg(null), 3000);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/account/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `phototrail-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setExporting(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await fetch('/api/account/delete', { method: 'DELETE' });
      router.push('/login');
    } catch {
      setDeleting(false);
    }
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
        <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
        <div className="space-y-4">
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Minimum 8 characters"
          />
          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
          />
          <div className="flex items-center gap-3">
            <Button onClick={handleChangePassword} loading={savingPassword} disabled={!newPassword || !confirmPassword}>
              Update Password
            </Button>
            {passwordMsg && (
              <span className={`text-sm ${passwordMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {passwordMsg.text}
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export Data</CardTitle>
          <CardDescription>Download all your data — collections, photos, AI analysis, locations, and activity history as a JSON file.</CardDescription>
        </CardHeader>
        <Button variant="secondary" onClick={handleExport} loading={exporting}>
          Download All Data
        </Button>
      </Card>

      <Card className="border-red-500/30">
        <CardHeader>
          <CardTitle className="text-red-400">Danger Zone</CardTitle>
          <CardDescription>Permanently delete your account and all associated data. This cannot be undone.</CardDescription>
        </CardHeader>
        <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
          Delete Account
        </Button>
      </Card>

      <Modal open={deleteModalOpen} onClose={() => { setDeleteModalOpen(false); setDeleteConfirm(''); }}>
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-red-400">Delete Account</h3>
          <p className="text-sm text-zinc-400">
            This will permanently delete your account, all collections, photos, AI analysis, and storage files.
            This action cannot be reversed.
          </p>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">Type DELETE to confirm</label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => { setDeleteModalOpen(false); setDeleteConfirm(''); }}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleteConfirm !== 'DELETE'}
              loading={deleting}
              onClick={handleDeleteAccount}
            >
              Permanently Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
