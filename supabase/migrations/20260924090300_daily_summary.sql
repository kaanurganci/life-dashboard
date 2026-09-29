-- Phase 1 subset of the daily summary view (spec §6). Later phases extend the
-- column list with erg metres, lift volume, session counts and todos via
-- `create or replace view`.
--
-- security_invoker = on (deliberate reversal of spec §6): the app queries this
-- view as the `authenticated` role. A definer-rights view would bypass RLS on
-- its base tables, leaving the app's main read path with no row-level
-- protection. With security_invoker, the view resolves auth.uid() as the
-- calling user and RLS on metrics/metric_entries applies normally. The
-- read-only MCP role's definer-rights access moves to Phase 5 as separate
-- wrapper views granted only to that role.
create or replace view public.v_daily_summary
  with (security_invoker = on) as
select
  e.user_id,
  e.logged_on as day,
  max(e.value_num) filter (where m.slug = 'sleep_quality')     as sleep_quality,
  max(e.value_num) filter (where m.slug = 'morning_readiness') as morning_readiness,
  count(*) filter (where m.kind = 'boolean' and e.value_bool)  as habits_done,
  (select count(*) from public.metrics hm
    where hm.user_id = e.user_id
      and hm.kind = 'boolean'
      and hm.is_active)                                        as habits_total
from public.metric_entries e
join public.metrics m on m.id = e.metric_id
group by e.user_id, e.logged_on;

comment on view public.v_daily_summary is
  'One row per logged day. security_invoker = on so RLS on metric_entries/metrics '
  'applies to the calling authenticated user; see migration header for rationale.';

-- Objects created by migration receive no privileges for PostgREST roles in
-- this project, so access fails 42501 before any policy/RLS is consulted.
-- anon deliberately receives nothing.
grant select on public.v_daily_summary to authenticated;
