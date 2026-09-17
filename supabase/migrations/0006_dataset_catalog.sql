-- GeoLab Classroom: curated learner-facing dataset catalog.
-- Apply after 0005_kosis_observation_access.sql.

begin;

create table if not exists public.dataset_catalog (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null unique,
  scope text not null check (scope in ('domestic', 'world')),
  title text not null,
  provider text not null,
  topic text not null,
  space_label text not null,
  coverage_label text not null,
  period_min text not null,
  period_max text not null,
  period_label text not null,
  capabilities jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  description text not null,
  source_url text not null,
  storage_mode text not null check (storage_mode in ('supabase', 'server-cache', 'planned')),
  snapshot_id uuid references public.source_snapshots(id) on delete set null,
  boundary_source_key text,
  boundary_year integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists dataset_catalog_scope_status_idx
  on public.dataset_catalog(scope, status, title);

alter table public.dataset_catalog enable row level security;

drop policy if exists "public can read published dataset catalog" on public.dataset_catalog;
create policy "public can read published dataset catalog"
on public.dataset_catalog
for select
to anon, authenticated
using (status = 'published');

comment on table public.dataset_catalog is
  'Curated datasets that are safe to expose in the no-login learner UI.';
comment on column public.dataset_catalog.snapshot_id is
  'Optional immutable source snapshot used by this dataset. Climate tables may use metadata instead.';

commit;

