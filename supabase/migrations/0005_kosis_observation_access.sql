-- GeoLab Classroom: idempotent KOSIS observation snapshots.
-- Run after 0001_initial_schema.sql through 0004_climate_period_summaries.sql.

begin;

-- KOSIS imports use a deterministic external_id for each table/item/period/
-- classification combination. This makes a repeated --write safe.
create unique index if not exists geo_observations_snapshot_external_idx
  on public.geo_observations(snapshot_id, external_id);

-- An explicitly approved public snapshot may be read by the no-login browser
-- client. Draft snapshots remain server-only until they are published through
-- a learning material or marked public by the controlled ingest step.
drop policy if exists "public can read observations used by published materials"
  on public.geo_observations;

create policy "public can read observations used by published materials or public snapshots"
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
  or exists (
    select 1
    from public.source_snapshots as snapshots
    where snapshots.id = public.geo_observations.snapshot_id
      and snapshots.is_public = true
  )
);

comment on index public.geo_observations_snapshot_external_idx is
  'Idempotency key for normalized KOSIS observations within a source snapshot.';

commit;
