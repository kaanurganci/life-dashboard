-- Fix round 1 for v_daily_summary (review findings):
--
-- 1. habits_done must count DISTINCT habits, not rows. metric_entries allows
--    more than one same-day row per metric via `occurrence`, so counting
--    rows let a single habit logged true twice inflate habits_done above
--    habits_total (a >100% progress indicator).
--
-- 2. The scale sliders (sleep_quality, morning_readiness) must report the
--    occurrence-1 row, not max(value_num). A correction logged as a second
--    occurrence was being reported as whichever value was larger, which is
--    wrong when the correction is smaller than the original. occurrence = 1
--    is the slot the app's upsert always writes, and the unique constraint
--    on (user_id, metric_id, logged_on, occurrence) guarantees at most one
--    such row, so max() over it is unambiguous. A deliberate second reading
--    at a different occurrence is additional data, not a correction, and is
--    intentionally not surfaced here.
--
-- habits_total is unchanged (reviewer confirmed correct: active-registry
-- subquery, not entry-derived).
--
-- security_invoker = on is kept; the grant is re-issued below because
-- `create or replace view` was found to preserve prior grants in this
-- project (see verification note in the task report), but re-issuing is
-- cheap and removes any doubt.
create or replace view public.v_daily_summary
  with (security_invoker = on) as
select
  e.user_id,
  e.logged_on as day,
  max(e.value_num) filter (
    where m.slug = 'sleep_quality' and e.occurrence = 1)      as sleep_quality,
  max(e.value_num) filter (
    where m.slug = 'morning_readiness' and e.occurrence = 1)  as morning_readiness,
  count(distinct m.id) filter (where m.kind = 'boolean' and e.value_bool)
                                                                as habits_done,
  (select count(*) from public.metrics hm
    where hm.user_id = e.user_id
      and hm.kind = 'boolean'
      and hm.is_active)                                        as habits_total
from public.metric_entries e
join public.metrics m on m.id = e.metric_id
group by e.user_id, e.logged_on;

comment on view public.v_daily_summary is
  'One row per logged day. security_invoker = on so RLS on metric_entries/metrics '
  'applies to the calling authenticated user. habits_done counts distinct habits '
  '(not rows); sliders read occurrence = 1 only. See migration header for rationale.';

grant select on public.v_daily_summary to authenticated;
