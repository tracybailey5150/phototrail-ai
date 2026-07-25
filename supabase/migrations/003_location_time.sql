-- PhotoTrail AI Phase 3: Location & Time Resolution

-- Media Locations — resolved location data with provenance
create table if not exists public.media_locations (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references public.media_items(id) on delete cascade unique,
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- Raw GPS from EXIF
  raw_latitude double precision,
  raw_longitude double precision,

  -- Resolved location
  resolved_latitude double precision,
  resolved_longitude double precision,
  location_source text check (location_source in (
    'embedded_gps', 'reverse_geocode', 'visual_ai', 'sequence_inference',
    'user_input', 'user_confirmed', 'ocr', 'unknown'
  )),
  confidence numeric(3,2),
  verification_status text not null default 'unknown' check (verification_status in (
    'verified', 'map_verified', 'ai_inferred', 'sequence_inferred',
    'user_confirmed', 'unknown', 'needs_review'
  )),

  -- Reverse geocoded fields
  place_name text,
  landmark text,
  street_address text,
  city text,
  state_province text,
  postal_code text,
  country text,
  country_code text,
  neighborhood text,

  -- Timezone
  timezone text,
  utc_offset_minutes integer,

  -- Provenance
  geocode_provider text,
  geocode_raw jsonb,
  resolution_explanation text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.media_locations enable row level security;
create policy "ml_select" on public.media_locations for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "ml_insert" on public.media_locations for insert with check (true);
create policy "ml_update" on public.media_locations for update with check (true);

-- Media Timestamps — resolved time data with provenance
create table if not exists public.media_timestamps (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references public.media_items(id) on delete cascade unique,
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- Raw timestamps from various sources
  exif_datetime_original timestamptz,
  exif_create_date timestamptz,
  exif_digitized timestamptz,
  exif_modify_date timestamptz,
  file_created timestamptz,
  file_modified timestamptz,
  filename_inferred timestamptz,
  gps_derived_local timestamptz,
  user_corrected timestamptz,

  -- Best resolved time
  best_capture_time timestamptz,
  capture_time_source text,
  capture_time_confidence numeric(3,2),
  capture_local_time timestamptz,
  capture_timezone text,

  -- Resolution
  resolution_explanation text,
  needs_review boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.media_timestamps enable row level security;
create policy "mt_select" on public.media_timestamps for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "mt_insert" on public.media_timestamps for insert with check (true);
create policy "mt_update" on public.media_timestamps for update with check (true);

-- Indexes
create index idx_ml_media on public.media_locations(media_item_id);
create index idx_ml_org on public.media_locations(org_id);
create index idx_ml_city on public.media_locations(city);
create index idx_ml_country on public.media_locations(country_code);
create index idx_mt_media on public.media_timestamps(media_item_id);
create index idx_mt_org on public.media_timestamps(org_id);
create index idx_mt_best on public.media_timestamps(best_capture_time);
