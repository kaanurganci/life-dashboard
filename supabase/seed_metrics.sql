-- Replace :uid with the profile id before running.
-- Run manually, once per project, via the SQL editor with the owning user's
-- id substituted — this is per-user data, not schema, so it is not a migration.
insert into public.metrics
  (user_id, slug, label, kind, category, unit, scale_min, scale_max, sort_order)
values
  (:uid, 'sleep_quality',     'Sleep Quality',     'scale',   'wellbeing',  null, 1, 10,  1),
  (:uid, 'morning_readiness', 'Morning Readiness', 'scale',   'wellbeing',  null, 1, 10,  2),
  (:uid, 'creatine',          'Creatine',          'boolean', 'supplement', null, null, null, 10),
  (:uid, 'vitamin_d',         'Vitamin D',         'boolean', 'supplement', null, null, null, 11),
  (:uid, 'omega_3',           'Omega 3',           'boolean', 'supplement', null, null, null, 12),
  (:uid, 'magnesium',         'Magnesium',         'boolean', 'supplement', null, null, null, 13),
  (:uid, 'sunlight_am',       'Sunlight before 9am','boolean','habit',      null, null, null, 20),
  (:uid, 'no_phone_in_bed',   'No phone in bed',   'boolean', 'habit',      null, null, null, 21),
  (:uid, 'bodyweight_kg',     'Bodyweight',        'numeric', 'body',       'kg', null, null, 30),
  (:uid, 'resting_hr',        'Resting HR',        'numeric', 'body',       'bpm', null, null, 31),
  (:uid, 'hrv_ms',            'HRV',               'numeric', 'body',       'ms', null, null, 32);
