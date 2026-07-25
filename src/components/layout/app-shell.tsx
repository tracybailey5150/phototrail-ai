'use client';

import { Sidebar } from './sidebar';
import { Header } from './header';

interface AppShellProps {
  title: string;
  orgName?: string;
  userName?: string;
  children: React.ReactNode;
}

export function AppShell({ title, orgName, userName, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-pt-bg">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title={title} orgName={orgName} userName={userName} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
