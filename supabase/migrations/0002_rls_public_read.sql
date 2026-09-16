-- GeoLab Classroom: public no-login MVP access policy.
--
-- The browser uses a Supabase Publishable Key and reaches only rows allowed
-- to the anon/authenticated roles. Learner attempts stay server-only until a
-- validated, rate-limited submission endpoint is implemented.

begin;

alter table public.data_sources enable row level security;
alter table public.source_snapshots enable row level security;
alter table public.geo_observations enable row level security;
alter table public.learning_materials enable row level security;
alter table public.inquiry_activities enable row level security;
alter table public.learner_attempts enable row level security;

-- RLS policies do not remove table privileges. Remove the default client
-- privileges first, then grant only the read operations used by the public UI.
revoke all on table
  public.data_sources,
  public.source_snapshots,
  public.geo_observations,
  public.learning_materials,
  public.inquiry_activities,
  public.learner_attempts
from anon, authenticated;

grant select on table
  public.data_sources,
  public.source_snapshots,
  public.geo_observations,
  public.learning_materials,
  public.inquiry_activities
to anon, authenticated;

-- No direct browser read/write path for learner attempts yet.
revoke all on table public.learner_attempts from anon, authenticated;

drop policy if exists "public can read source metadata"
  on public.data_sources;

drop policy if exists "public can read source snapshots"
  on public.source_snapshots;

drop policy if exists "public can read geo observations"
  on public.geo_observations;

drop policy if exists "public can read published materials"
  on public.learning_materials;

drop policy if exists "public can read activities for published materials"
  on public.inquiry_activities;

create policy "public can read source metadata"
on public.data_sources
for select
to anon, authenticated
using (true);

create policy "public can read snapshots used by published materials"
on public.source_snapshots
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.learning_materials as materials
    where materials.status = 'published'
      and public.source_snapshots.id = any(materials.source_snapshot_ids)
  )
);

create policy "public can read observations used by published materials"
on public.geo_observations
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.learning_materials as materials
    where materials.status = 'published'
      and public.geo_observations.snapshot_id = any(materials.source_snapshot_ids)
  )
);

create policy "public can read published materials"
on public.learning_materials
for select
to anon, authenticated
using (status = 'published');

create policy "public can read activities for published materials"
on public.inquiry_activities
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.learning_materials as materials
    where materials.id = public.inquiry_activities.material_id
      and materials.status = 'published'
  )
);

commit;
