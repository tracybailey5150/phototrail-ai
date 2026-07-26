-- PhotoTrail AI Phase 5: Grouping Engine

-- Travel: Trips
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  location text,
  status text not null default 'suggested' check (status in ('suggested', 'approved', 'locked', 'rejected')),
  created_at timestamptz not null default now()
);

-- Travel: Trip Days
create table if not exists public.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  day_date date not null,
  label text,
  summary text,
  created_at timestamptz not null default now()
);

-- Travel: Events
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  trip_day_id uuid references public.trip_days(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  location_name text,
  start_time timestamptz,
  end_time timestamptz,
  event_type text,
  status text not null default 'suggested' check (status in ('suggested', 'approved', 'locked', 'rejected')),
  created_at timestamptz not null default now()
);

-- Project: Rooms
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  room_number text,
  floor text,
  building text,
  area text,
  room_type text,
  status text not null default 'suggested' check (status in ('suggested', 'approved', 'locked', 'rejected')),
  created_at timestamptz not null default now()
);

-- Media Group Assignments — links media to groups
create table if not exists public.media_assignments (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references public.media_items(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- Polymorphic: one of these will be set
  trip_id uuid references public.trips(id) on delete set null,
  trip_day_id uuid references public.trip_days(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  assignment_source text not null default 'auto' check (assignment_source in ('auto', 'user', 'ai')),
  confidence numeric(3,2),
  created_at timestamptz not null default now()
);

-- Enable RLS on all
alter table public.trips enable row level security;
alter table public.trip_days enable row level security;
alter table public.events enable row level security;
alter table public.rooms enable row level security;
alter table public.media_assignments enable row level security;

create policy "trips_org" on public.trips for all using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "days_org" on public.trip_days for all using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "events_org" on public.events for all using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "rooms_org" on public.rooms for all using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "assign_org" on public.media_assignments for all using (org_id in (select org_id from public.profiles where id = auth.uid()));

-- Indexes
create index idx_trips_coll on public.trips(collection_id);
create index idx_days_trip on public.trip_days(trip_id);
create index idx_events_day on public.events(trip_day_id);
create index idx_events_coll on public.events(collection_id);
create index idx_rooms_coll on public.rooms(collection_id);
create index idx_assign_media on public.media_assignments(media_item_id);
create index idx_assign_trip on public.media_assignments(trip_id);
create index idx_assign_room on public.media_assignments(room_id);
