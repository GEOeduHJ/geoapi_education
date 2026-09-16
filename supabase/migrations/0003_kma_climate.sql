-- GeoLab Classroom: KMA ASOS station catalog and normalized daily climate data.
-- Run after 0001_initial_schema.sql and 0002_rls_public_read.sql.

begin;

-- A snapshot may be public when it contains only approved, non-personal
-- education data. Published materials remain another way to expose snapshots.
alter table public.source_snapshots
  add column if not exists is_public boolean not null default false;

create table if not exists public.climate_stations (
  station_id text primary key,
  name_ko text not null,
  name_en text,
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  altitude_m numeric,
  law_code text,
  address text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.climate_daily_observations (
  id uuid primary key default gen_random_uuid(),
  station_id text not null references public.climate_stations(station_id) on delete restrict,
  snapshot_id uuid not null references public.source_snapshots(id) on delete restrict,
  observation_date date not null,
  ta_avg numeric,
  ta_max numeric,
  ta_min numeric,
  rn_day numeric,
  ws_avg numeric,
  hm_avg numeric,
  ss_day numeric,
  si_day numeric,
  raw_values jsonb not null default '{}'::jsonb,
  quality_flags text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (station_id, observation_date)
);

create index if not exists climate_daily_station_date_idx
  on public.climate_daily_observations(station_id, observation_date);

create index if not exists climate_daily_snapshot_idx
  on public.climate_daily_observations(snapshot_id);

alter table public.climate_stations enable row level security;
alter table public.climate_daily_observations enable row level security;

revoke all on table public.climate_stations, public.climate_daily_observations
from anon, authenticated;

grant select on table public.climate_stations, public.climate_daily_observations
to anon, authenticated;

drop policy if exists "public can read climate stations"
  on public.climate_stations;

create policy "public can read climate stations"
on public.climate_stations
for select
to anon, authenticated
using (true);

drop policy if exists "public can read climate observations"
  on public.climate_daily_observations;

create policy "public can read climate observations"
on public.climate_daily_observations
for select
to anon, authenticated
using (true);

drop policy if exists "public can read explicitly public snapshots"
  on public.source_snapshots;

create policy "public can read explicitly public snapshots"
on public.source_snapshots
for select
to anon, authenticated
using (is_public = true);

commit;

