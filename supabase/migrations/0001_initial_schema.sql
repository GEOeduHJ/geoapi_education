-- GeoLab Classroom: source provenance and reusable learning activities.
-- Run after enabling PostGIS in the Supabase project.

create extension if not exists postgis;

create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  source_key text not null unique,
  title text not null,
  official_url text not null,
  auth_type text not null default 'none',
  terms_summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references public.data_sources(id) on delete restrict,
  fetched_at timestamptz not null default now(),
  valid_from date,
  valid_to date,
  request_fingerprint text not null,
  schema_version text not null default 'v1',
  raw_payload jsonb,
  row_count integer,
  checksum text,
  unique (data_source_id, request_fingerprint, schema_version)
);

create table if not exists public.geo_observations (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.source_snapshots(id) on delete cascade,
  external_id text,
  observed_at timestamptz,
  region_code text,
  label text,
  value numeric,
  unit text,
  category text,
  geometry geometry(Geometry, 4326),
  attributes jsonb not null default '{}'::jsonb
);

create index if not exists geo_observations_snapshot_idx on public.geo_observations(snapshot_id);
create index if not exists geo_observations_geometry_idx on public.geo_observations using gist(geometry);
create index if not exists geo_observations_region_idx on public.geo_observations(region_code);

create table if not exists public.learning_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  material_type text not null check (material_type in ('2d', '3d', 'chart')),
  purpose text,
  config jsonb not null default '{}'::jsonb,
  source_snapshot_ids uuid[] not null default '{}',
  provenance jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inquiry_activities (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.learning_materials(id) on delete cascade,
  title text not null,
  activity_type text not null,
  stage text not null check (stage in ('relate', 'focus', 'investigate', 'organize', 'generalize', 'transfer')),
  prompts jsonb not null default '[]'::jsonb,
  expected_evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.learner_attempts (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.inquiry_activities(id) on delete cascade,
  anonymous_learner_id text not null,
  answers jsonb not null default '{}'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);

alter table public.data_sources enable row level security;
alter table public.source_snapshots enable row level security;
alter table public.geo_observations enable row level security;
alter table public.learning_materials enable row level security;
alter table public.inquiry_activities enable row level security;
alter table public.learner_attempts enable row level security;

-- Initial public read policy for published educational materials and source metadata.
create policy "public can read source metadata" on public.data_sources for select using (true);
create policy "public can read source snapshots" on public.source_snapshots for select using (true);
create policy "public can read geo observations" on public.geo_observations for select using (true);
create policy "public can read published materials" on public.learning_materials for select using (status = 'published');
create policy "public can read activities for published materials" on public.inquiry_activities for select using (
  exists (
    select 1 from public.learning_materials materials
    where materials.id = inquiry_activities.material_id and materials.status = 'published'
  )
);

-- Learner attempts are intentionally not publicly readable. Insert/update policies
-- will be narrowed after the authentication and classroom deployment model is chosen.

