-- Starting registry for one user. This is per-user DATA, not schema, so it is
-- deliberately NOT a migration: it runs once, by hand, per Supabase project.
--
-- HOW TO RUN (Supabase Studio → SQL Editor):
--   Paste this whole file and run it. The first statement looks up your own
--   profile id, so there is nothing to substitute by hand.
--
-- An earlier version of this file used psql's `:uid` bind-variable syntax, which
-- the web SQL editor does NOT interpret — pasting it produced a syntax error.
-- The CTE below replaces that, and works in both the editor and psql.
--
-- Safe to re-run: `on conflict (user_id, slug) do nothing` means existing rows
-- are left untouched, so adding a row to this file and re-running only inserts
-- the new one.

with me as (
  select id from public.profiles order by created_at limit 1
)
insert into public.metrics
  (user_id, slug, label, kind, category, unit, scale_min, scale_max, sort_order)
select me.id, v.slug, v.label, v.kind::metric_kind, v.category,
       v.unit, v.scale_min, v.scale_max, v.sort_order
from me, (values
  -- The two morning sliders. Order 1-2 so they render at the top of the card.
  ('sleep_quality',     'Sleep Quality',       'scale',   'wellbeing',  null,  1::smallint, 10::smallint,  1::smallint),
  ('morning_readiness', 'Morning Readiness',   'scale',   'wellbeing',  null,  1,          10,             2),

  -- Supplements: tick-box habits. Edit this block to match what you actually take.
  ('creatine',          'Creatine',            'boolean', 'supplement', null,  null,       null,          10),
  ('vitamin_d',         'Vitamin D',           'boolean', 'supplement', null,  null,       null,          11),
  ('omega_3',           'Omega 3',             'boolean', 'supplement', null,  null,       null,          12),
  ('magnesium',         'Magnesium',           'boolean', 'supplement', null,  null,       null,          13),

  -- Behavioural habits.
  ('sunlight_am',       'Sunlight before 9am', 'boolean', 'habit',      null,  null,       null,          20),
  ('no_phone_in_bed',   'No phone in bed',     'boolean', 'habit',      null,  null,       null,          21),

  -- Body metrics. Typed by hand for now; Phase 5 can feed these from Apple Health.
  ('bodyweight_kg',     'Bodyweight',          'numeric', 'body',       'kg',  null,       null,          30),
  ('resting_hr',        'Resting HR',          'numeric', 'body',       'bpm', null,       null,          31),
  ('hrv_ms',            'HRV',                 'numeric', 'body',       'ms',  null,       null,          32)
) as v(slug, label, kind, category, unit, scale_min, scale_max, sort_order)
on conflict (user_id, slug) do nothing;

-- Check what landed:
--   select slug, label, kind, category, sort_order
--   from public.metrics order by sort_order;
