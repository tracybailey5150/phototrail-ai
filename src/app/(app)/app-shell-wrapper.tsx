'use client';

import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/collections': 'Collections',
  '/collections/new': 'New Collection',
  '/uploads': 'Uploads',
  '/timeline': 'Timeline',
  '/map': 'Map',
  '/search': 'Search',
  '/reports': 'Reports',
  '/review-queue': 'Review Queue',
  '/settings': 'Settings',
};

interface AppShellWrapperProps {
  orgName?: string;
  userName?: string;
  children: React.ReactNode;
}

export function AppShellWrapper({ orgName, userName, children }: AppShellWrapperProps) {
  const pathname = usePathname();

  const title =
    pageTitles[pathname] ||
    (pathname.startsWith('/collections/') ? 'Collection' : 'PhotoTrail AI');

  return (
    <AppShell title={title} orgName={orgName} userName={userName}>
      {children}
    </AppShell>
  );
}
