-- GeoLab Classroom: compact monthly summary view for long-range climate exploration.
-- Run after 0003_kma_climate.sql.

begin;

-- Keep the daily table as the reproducible source layer, but expose a compact
-- derived layer to the browser. A view avoids duplicating ten years of rows
-- and recalculates automatically after the collector upserts new daily data.
create or replace view public.climate_period_summaries
with (security_invoker = true)
as
with monthly_rows as (
  select
    station_id,
    date_trunc('month', observation_date)::date as period_start,
    (
      date_trunc('month', observation_date)
      + interval '1 month'
      - interval '1 day'
    )::date as period_end,
    extract(
      day from (
        date_trunc('month', observation_date)
        + interval '1 month'
        - interval '1 day'
      )
    )::integer as expected_observation_count,
    ta_avg,
    ta_max,
    ta_min,
    rn_day,
    ws_avg,
    hm_avg,
    ss_day,
    si_day
  from public.climate_daily_observations
)
select
  station_id,
  'month'::text as period_type,
  period_start,
  max(period_end)::date as period_end,
  max(expected_observation_count)::integer as expected_observation_count,
  avg(ta_avg) as ta_avg,
  count(ta_avg)::integer as ta_avg_valid_count,
  avg(ta_max) as ta_max,
  count(ta_max)::integer as ta_max_valid_count,
  avg(ta_min) as ta_min,
  count(ta_min)::integer as ta_min_valid_count,
  avg(rn_day) as rn_day,
  count(rn_day)::integer as rn_day_valid_count,
  avg(ws_avg) as ws_avg,
  count(ws_avg)::integer as ws_avg_valid_count,
  avg(hm_avg) as hm_avg,
  count(hm_avg)::integer as hm_avg_valid_count,
  avg(ss_day) as ss_day,
  count(ss_day)::integer as ss_day_valid_count,
  avg(si_day) as si_day,
  count(si_day)::integer as si_day_valid_count
from monthly_rows
group by station_id, period_start;

revoke all on table public.climate_period_summaries from anon, authenticated;
grant select on table public.climate_period_summaries to anon, authenticated;

comment on view public.climate_period_summaries is
  'Monthly derived climate summaries. Daily observations remain the source layer.';

commit;
