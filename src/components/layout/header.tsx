'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  title: string;
  orgName?: string;
  userName?: string;
}

export function Header({ title, orgName, userName }: HeaderProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <header className="flex items-center justify-between h-14 px-6 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-zinc-100">{title}</h1>
        {orgName && (
          <span className="text-xs text-zinc-500 hidden sm:inline">/ {orgName}</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {userName && (
          <span className="text-sm text-zinc-400 hidden sm:inline">{userName}</span>
        )}
        <button
          onClick={handleSignOut}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
