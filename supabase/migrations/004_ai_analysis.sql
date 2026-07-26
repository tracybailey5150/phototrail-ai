-- PhotoTrail AI Phase 4: AI Analysis & OCR

-- Media AI Analysis — Claude visual analysis results
create table if not exists public.media_ai_analysis (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references public.media_items(id) on delete cascade unique,
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- Base analysis
  summary text,
  scene_type text,
  indoor_outdoor text,
  lighting text,
  time_of_day_visual text,
  activities jsonb not null default '[]'::jsonb,
  objects jsonb not null default '[]'::jsonb,
  visible_text jsonb not null default '[]'::jsonb,
  location_candidates jsonb not null default '[]'::jsonb,
  event_candidates jsonb not null default '[]'::jsonb,
  quality jsonb,
  confidence numeric(3,2),
  reasoning_summary text,

  -- Travel extensions
  landmarks jsonb,
  venue_candidates jsonb,
  transportation jsonb,
  weather_appearance text,
  scenic_score numeric(3,1),
  social_media_score numeric(3,1),
  memory_highlight_score numeric(3,1),
  suggested_event_name text,
  suggested_caption text,

  -- Project extensions
  room_candidates jsonb,
  workstream text,
  trade text,
  equipment jsonb,
  installation_status text,
  visible_issues jsonb,
  safety_concerns jsonb,
  suggested_field_report_note text,
  suggested_punch_item text,

  -- Metadata
  model_used text,
  analysis_mode text check (analysis_mode in ('travel', 'project')),
  raw_response jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.media_ai_analysis enable row level security;
create policy "maa_select" on public.media_ai_analysis for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "maa_insert" on public.media_ai_analysis for insert with check (true);
create policy "maa_update" on public.media_ai_analysis for update with check (true);

-- Media OCR — extracted text
create table if not exists public.media_ocr (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references public.media_items(id) on delete cascade unique,
  org_id uuid not null references public.organizations(id) on delete cascade,
  texts jsonb not null default '[]'::jsonb,
  raw_text text,
  extracted_serials jsonb not null default '[]'::jsonb,
  extracted_macs jsonb not null default '[]'::jsonb,
  extracted_room_numbers jsonb not null default '[]'::jsonb,
  model_used text,
  created_at timestamptz not null default now()
);

alter table public.media_ocr enable row level security;
create policy "ocr_select" on public.media_ocr for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "ocr_insert" on public.media_ocr for insert with check (true);
create policy "ocr_update" on public.media_ocr for update with check (true);

-- Media Equipment — extracted equipment from project photos
create table if not exists public.media_equipment (
  id uuid primary key default gen_random_uuid(),
  media_item_id uuid not null references public.media_items(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  manufacturer text,
  model text,
  device_type text,
  serial_number_raw text,
  serial_number_normalized text,
  mac_address_raw text,
  mac_address_normalized text,
  asset_tag text,
  confidence numeric(3,2),
  verification_status text not null default 'needs_review'
    check (verification_status in ('verified', 'needs_review', 'rejected', 'user_confirmed')),
  source text not null default 'visual_ai',
  created_at timestamptz not null default now()
);

alter table public.media_equipment enable row level security;
create policy "me_select" on public.media_equipment for select
  using (org_id in (select org_id from public.profiles where id = auth.uid()));
create policy "me_insert" on public.media_equipment for insert with check (true);
create policy "me_update" on public.media_equipment for update with check (true);

-- Indexes
create index idx_maa_media on public.media_ai_analysis(media_item_id);
create index idx_maa_org on public.media_ai_analysis(org_id);
create index idx_maa_scene on public.media_ai_analysis(scene_type);
create index idx_ocr_media on public.media_ocr(media_item_id);
create index idx_equip_media on public.media_equipment(media_item_id);
create index idx_equip_org on public.media_equipment(org_id);
create index idx_equip_serial on public.media_equipment(serial_number_normalized);
create index idx_equip_mac on public.media_equipment(mac_address_normalized);
