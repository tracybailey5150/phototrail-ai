'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName || fullName, full_name: fullName }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || 'Failed to create organization');
        setLoading(false);
        return;
      }
    }

    router.push('/dashboard');
    router.refresh();
  };

  return (
    <Card>
      <form onSubmit={handleSignup} className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-100 text-center">Create Account</h2>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        <Input
          label="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Tracy Bailey"
          required
        />

        <Input
          label="Organization Name"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Your company or team (optional)"
        />

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />

        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min 8 characters"
          minLength={8}
          required
        />

        <Button type="submit" loading={loading} className="w-full">
          Create Account
        </Button>

        <p className="text-center text-xs text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" className="text-amber-400 hover:text-amber-300 transition-colors">
            Sign in
          </Link>
        </p>
      </form>
    </Card>
  );
}
