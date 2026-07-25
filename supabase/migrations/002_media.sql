-- PhotoTrail AI Phase 2: Media Items & Processing

-- Media Items — core record for every uploaded file
create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,

  -- Original file info
  original_filename text not null,
  original_mime_type text not null,
  detected_mime_type text,
  file_size bigint not null,
  width integer,
  height integer,
  duration_seconds numeric,
  orientation integer,

  -- Storage paths
  original_storage_path text not null,
  thumbnail_path text,
  preview_path text,

  -- Hashes for dedup
  sha256_hash text,
  perceptual_hash text,

  -- Timestamps
  capture_time timestamptz,
  capture_time_source text,
  file_created_at timestamptz,
  file_modified_at timestamptz,
  upload_time timestamptz not null default now(),

  -- GPS
  gps_latitude double precision,
  gps_longitude double precision,
  gps_altitude double precision,
  gps_direction double precision,

  -- Processing status
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'completed', 'failed', 'partial')),
  processing_error text,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,

  -- Flags
  is_duplicate boolean not null default false,
  duplicate_of uuid references public.media_items(id) on delete set null,
  needs_review boolean not null default false,
  is_screenshot boolean not null default false,

  -- Raw EXIF stored as JSONB
  exif_data jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.media_items enable row level security;

create policy "mi_select" on public.media_items for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "mi_insert" on public.media_items for insert
  with check (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "mi_update" on public.media_items for update
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "mi_delete" on public.media_items for delete
  using (org_id in (select org_id from public.profiles where id = auth.uid()));

-- Processing Jobs — tracks each processing step
create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references public.media_items(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  step text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  result jsonb,
  attempt integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.processing_jobs enable row level security;

create policy "pj_select" on public.processing_jobs for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "pj_insert" on public.processing_jobs for insert with check (true);
create policy "pj_update" on public.processing_jobs for update with check (true);

-- Indexes
create index idx_media_collection on public.media_items(collection_id);
create index idx_media_org on public.media_items(org_id);
create index idx_media_sha256 on public.media_items(sha256_hash);
create index idx_media_phash on public.media_items(perceptual_hash);
create index idx_media_status on public.media_items(processing_status);
create index idx_media_capture on public.media_items(capture_time);
create index idx_media_upload on public.media_items(upload_time desc);
create index idx_pj_media on public.processing_jobs(media_item_id);
create index idx_pj_status on public.processing_jobs(status);
