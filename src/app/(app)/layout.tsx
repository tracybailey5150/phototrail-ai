import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShellWrapper } from './app-shell-wrapper';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, org_id, role')
    .eq('id', user.id)
    .single();

  let orgName = '';
  if (profile?.org_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', profile.org_id)
      .single();
    orgName = org?.name || '';
  }

  return (
    <AppShellWrapper orgName={orgName} userName={profile?.full_name || user.email || ''}>
      {children}
    </AppShellWrapper>
  );
}
