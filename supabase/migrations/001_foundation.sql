-- PhotoTrail AI Foundation Schema

-- Organizations
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.organizations enable row level security;
create policy "Users can view their org" on public.organizations for select
  using (id in (select org_id from public.profiles where id = auth.uid()));
create policy "Owners can update their org" on public.organizations for update
  using (id in (select org_id from public.profiles where id = auth.uid() and role in ('owner', 'admin')));

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  full_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Users can view profiles in their org" on public.profiles for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()) or id = auth.uid());
create policy "Users can update their own profile" on public.profiles for update using (id = auth.uid());
create policy "Service role can insert profiles" on public.profiles for insert with check (true);

-- Organization Members
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(org_id, user_id)
);
alter table public.organization_members enable row level security;
create policy "Members can view org members" on public.organization_members for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "Admins can manage members" on public.organization_members for all
  using (org_id in (select org_id from public.profiles where id = auth.uid() and role in ('owner', 'admin')));

-- Collections
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  mode text not null check (mode in ('travel', 'project')),
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived', 'completed')),
  cover_image_url text,
  start_date date,
  end_date date,
  location text,
  client_name text,
  project_number text,
  site_address text,
  metadata jsonb not null default '{}'::jsonb,
  item_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.collections enable row level security;
create policy "Users can view collections in their org" on public.collections for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "Users can insert collections in their org" on public.collections for insert
  with check (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "Users can update collections in their org" on public.collections for update
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "Users can delete collections in their org" on public.collections for delete
  using (org_id in (select org_id from public.profiles where id = auth.uid() and role in ('owner', 'admin')));

-- Collection Settings
create table if not exists public.collection_settings (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade unique,
  org_id uuid not null references public.organizations(id) on delete cascade,
  auto_group boolean not null default true,
  ai_analysis boolean not null default true,
  extract_gps boolean not null default true,
  extract_serial_numbers boolean not null default false,
  default_confidence_threshold numeric(3,2) not null default 0.70,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.collection_settings enable row level security;
create policy "Users can view collection settings in their org" on public.collection_settings for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "Users can manage collection settings" on public.collection_settings for all
  using (org_id in (select org_id from public.profiles where id = auth.uid()));

-- Activity Events
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null,
  title text not null,
  description text,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.activity_events enable row level security;
create policy "Users can view events in their org" on public.activity_events for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "Insert events via service role" on public.activity_events for insert with check (true);

-- Indexes
create index idx_profiles_org_id on public.profiles(org_id);
create index idx_org_members_org_id on public.organization_members(org_id);
create index idx_org_members_user_id on public.organization_members(user_id);
create index idx_collections_org_id on public.collections(org_id);
create index idx_collections_mode on public.collections(mode);
create index idx_collections_status on public.collections(status);
create index idx_collections_created_at on public.collections(created_at desc);
create index idx_collection_settings_cid on public.collection_settings(collection_id);
create index idx_activity_org_id on public.activity_events(org_id);
create index idx_activity_created_at on public.activity_events(created_at desc);
create index idx_activity_entity on public.activity_events(entity_type, entity_id);
