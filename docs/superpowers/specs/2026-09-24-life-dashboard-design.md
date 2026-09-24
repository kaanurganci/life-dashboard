# Life Dashboard — Design Spec

**Date:** 2026-09-24
**Status:** Awaiting review
**Repo:** `C:\Users\kaanu\life-dashboard` (own git repo, sibling to the WAT framework)

## 1. Purpose

A mobile-first web dashboard that is (a) a low-friction daily data-entry point and
(b) a visualiser, writing to a centralised PostgreSQL database. The database is
later exposed to Claude over MCP so Claude can act as an autonomous mentor with
direct read access to the full history.

Two properties matter more than any feature:

1. **Entry friction must be near zero.** The morning log is two sliders and a
   checklist. If it takes more than ten seconds it will not survive contact with
   real mornings, and the dataset dies with it.
2. **The data must be trustworthy enough to reason on.** A mentor agent acting on
   silently-wrong data is worse than one with gaps. Hence derived values are
   computed by the database, not entered; machine-extracted data is confirmed by a
   human before it becomes canonical; and every row records where it came from.

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database | Supabase cloud (hosted Postgres) | No Docker or local Postgres on the machine; a phone needs a real HTTPS origin, which localhost cannot give it |
| Hosting | Vercel | Free, git-push deploys, and a server for the parse endpoint and webhooks |
| Schema shape | Registry + long-format entries for habits/metrics; typed tables for workouts | New habits are INSERTs, not migrations; erg splits and lift volume need real numeric columns and constraints |
| Write path | Optimistic UI + persisted retry queue | Gym and commute signal is flaky rather than absent; a persisted mutation cache gives the outbox almost free |
| Gym sessions | Logged in the Strong app, imported by screenshot | Decided 2026-09-24. An iPhone PWA cannot fire a reliable locked-screen rest timer, so competing with Strong mid-session was a losing design |
| Erg sessions | Typed manually in the dashboard | User preference; also more accurate than parsing a monitor photo |
| Split | Thin: `programs` + `program_days` only | Needed for the schedule view and planned-vs-actual adherence. Per-exercise targets and rest were only for in-session driving, which is out |
| MCP access | Read-only Postgres role over definer-rights views | An agent holding the service-role key can silently rewrite history |

### Non-goals

Rest timers and notifications. Set-by-set in-session logging. Plate calculator,
warm-up generation, live progression prompts. Multi-user support (the schema is
multi-user-shaped because RLS wants it, but no invite or sharing flow is built).
Native apps.

## 3. Tech stack

- **Next.js 15** (App Router, React 19), TypeScript
- **Tailwind v4** + **shadcn/ui** — copy-in components, so touch targets are ours to enlarge
- **supabase-js** from the client for reads and writes; **@supabase/ssr** for auth cookies
- **TanStack Query** with a persisted mutation cache (IndexedDB) — this *is* the retry queue
- **Zod** at every form boundary, mirroring the database constraints
- Types from `supabase gen types typescript`. **No ORM** — the SQL schema stays the single
  source of truth, which is what Claude reads over MCP
- Migrations as plain `.sql` under `supabase/migrations/`, applied with the Supabase CLI
- **Serwist** service worker; installable PWA
- **Recharts** for charts
- **Vitest** + **Testing Library** for units; **Playwright** for the two critical flows
  (morning log, screenshot confirm)

## 4. Architecture

```
iPhone (installed PWA)
   |
   |  optimistic writes, persisted mutation queue
   v
Next.js on Vercel ───────────────► Supabase Postgres (RLS)
   |    - /api/parse-upload            ▲   ▲
   |      (Claude vision → JSONB)      |   |
   |    - /api/health-webhook          |   | definer-rights views
   |    - Supabase Storage (images)    |   |
   |                                   |   |
   └───────────────────────────────────┘   |
                                           |
                        Claude via MCP ─────┘  (claude_ro, SELECT on views only)
```

Data flows one way into canonical tables. Machine-extracted data takes a detour
through `media_uploads.parsed_payload` and a human confirmation before it joins
them.

## 5. Data model

Every table carries `user_id uuid not null default auth.uid() references profiles(id)
on delete cascade` and an RLS policy of `user_id = auth.uid()`. The foreign key is
written out on every table in the migration; the DDL below omits it for brevity except
where it aids reading. Child tables (`erg_intervals`, `lift_sets`) denormalise
`user_id` rather than joining upward in their policies — one inheritance trigger buys
identical, index-friendly policies everywhere.

### 5.1 Extensions and enums

```sql
create extension if not exists pgcrypto;

create type metric_kind       as enum ('boolean','scale','numeric','duration','text');
create type entry_source      as enum ('dashboard','device','import','ocr','agent');
create type workout_modality  as enum ('erg','lift','run','bike','swim','mobility','other');
create type session_status    as enum ('planned','in_progress','completed','skipped');
create type erg_piece_type    as enum ('ut2','at_interval','steady','test','warmup','other');
create type lift_set_type     as enum ('working','warmup','dropset','failure','amrap');
create type upload_kind       as enum ('strong_screenshot','erg_monitor','other');
create type upload_status     as enum ('pending','processing','parsed','confirmed','failed','ignored');
create type todo_status       as enum ('open','done','dropped');
create type note_kind         as enum ('observation','hypothesis','recommendation','nudge');
create type note_status       as enum ('new','acknowledged','acted','dismissed');
create type experiment_status as enum ('planned','running','completed','abandoned');
```

Enums are used for closed sets; `ALTER TYPE ... ADD VALUE` covers growth. Open-ended
vocabularies (`life_events.kind`, `exercises.primary_muscle`) stay `text` so they can
evolve without DDL.

### 5.2 Identity

```sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone     text not null default 'Europe/London',
  created_at   timestamptz not null default now()
);
```

`timezone` exists because "today" is a user-local concept. See 5.3.

### 5.3 Metric registry and entries

The core move: **what is tracked is data, not schema.**

```sql
create table metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid(),
  slug         text not null,
  label        text not null,
  description  text,
  kind         metric_kind not null,
  category     text not null,
  unit         text,
  scale_min    smallint,
  scale_max    smallint,
  target_value numeric,
  sort_order   smallint not null default 0,
  is_active    boolean not null default true,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, slug),
  constraint scale_bounds_present check (
    kind <> 'scale' or (scale_min is not null and scale_max is not null and scale_min < scale_max)
  )
);

create table metric_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  metric_id  uuid not null references metrics(id) on delete cascade,
  logged_on  date not null default (now() at time zone 'Europe/London')::date,
  logged_at  timestamptz not null default now(),
  occurrence smallint not null default 1 check (occurrence > 0),
  value_num  numeric,
  value_bool boolean,
  value_text text,
  note       text,
  source     entry_source not null default 'dashboard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, metric_id, logged_on, occurrence),
  constraint exactly_one_value check (
    (value_num is not null)::int + (value_bool is not null)::int
      + (value_text is not null)::int = 1
  )
);

create index metric_entries_day_idx    on metric_entries (user_id, logged_on desc);
create index metric_entries_metric_idx on metric_entries (metric_id, logged_on desc);
```

Two deliberate details:

**`logged_on` and `logged_at` are both stored.** `logged_on` is the day the
observation belongs to, computed in the user's timezone by the client so a 00:40
entry lands correctly; the column default is a safety net only. `logged_at` is when
it was actually typed. The gap between them is free signal — a habit ticked three
days late is recall, not observation, and a mentor should weight it accordingly.

**A trigger enforces value/kind agreement,** because a CHECK constraint cannot read
another table:

```sql
create or replace function validate_metric_entry() returns trigger
language plpgsql as $$
declare m metrics;
begin
  select * into m from metrics where id = new.metric_id;
  if m.user_id <> new.user_id then
    raise exception 'metric % does not belong to user %', new.metric_id, new.user_id;
  end if;

  case m.kind
    when 'boolean' then
      if new.value_bool is null then raise exception '% expects a boolean', m.slug; end if;
    when 'text' then
      if new.value_text is null then raise exception '% expects text', m.slug; end if;
    when 'scale' then
      if new.value_num is null then raise exception '% expects a number', m.slug; end if;
      if new.value_num < m.scale_min or new.value_num > m.scale_max then
        raise exception '% must be between % and %, got %',
          m.slug, m.scale_min, m.scale_max, new.value_num;
      end if;
    else -- numeric, duration
      if new.value_num is null then raise exception '% expects a number', m.slug; end if;
  end case;

  new.updated_at := now();
  return new;
end $$;

create trigger metric_entries_validate before insert or update on metric_entries
  for each row execute function validate_metric_entry();
```

The daily checklist (supplements, habits) and both 1–10 sliders (Sleep Quality,
Morning Readiness) are all rows in `metrics`. One screen renders all of them from the
registry, and retiring a habit is `is_active = false` with history intact.

Seed registry for launch: `sleep_quality` and `morning_readiness` (scale 1–10),
boolean habit rows for the current supplement stack, `bodyweight_kg` (numeric),
and `resting_hr` / `hrv_ms` (numeric, later fed by device).

### 5.4 Context: life events

```sql
create table life_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  kind       text not null,       -- travel | illness | deload | stress | medication | other
  label      text not null,
  starts_on  date not null,
  ends_on    date,
  notes      text,
  created_at timestamptz not null default now()
);
```

Small table, disproportionate value. Without recorded confounders every correlation
found in this dataset is suspect — "energy dropped in March" means nothing until you
know there was flu in March. Any correlation surfaced to the user must be annotated
with overlapping events.

### 5.5 Exercise catalog

```sql
create table exercises (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid(),
  name              text not null,
  slug              text not null,
  category          text,             -- squat | hinge | push | pull | carry | core | other
  primary_muscle    text,
  secondary_muscles text[] not null default '{}',
  equipment         text,
  strong_app_name   text,
  aliases           text[] not null default '{}',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (user_id, slug)
);

create index exercises_aliases_idx on exercises using gin (aliases);
```

`aliases` and `strong_app_name` are what let the screenshot parser resolve "DB Incline
Press" to an existing row instead of creating a duplicate. The review UI writes new
aliases back, so resolution improves with use.

### 5.6 Split

```sql
create table programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null, started_on date, ended_on date,
  is_active boolean not null default true, notes text,
  created_at timestamptz not null default now()
);

create table program_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  program_id uuid not null references programs(id) on delete cascade,
  day_index smallint not null,
  name text not null,                                   -- 'Upper A', 'UT2 60min'
  weekday_hint smallint check (weekday_hint between 0 and 6),   -- 0 = Monday
  modality workout_modality,
  sort_order smallint not null default 0,
  unique (program_id, day_index)
);
```

Deliberately thin. It exists to drive the schedule view and to give adherence
something to compare against, not to prescribe sets.

### 5.7 Workout sessions

```sql
create table workout_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid(),
  session_date   date not null,
  modality       workout_modality not null,
  status         session_status not null default 'completed',
  program_day_id uuid references program_days(id) on delete set null,
  started_at     timestamptz, ended_at timestamptz,
  title          text, notes text,
  session_rpe    numeric(3,1) check (session_rpe between 1 and 10),
  avg_hr smallint, max_hr smallint, kcal integer,
  source         entry_source not null default 'dashboard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workout_sessions_date_idx on workout_sessions (user_id, session_date desc);
```

`status` carries planned-vs-actual: a session written ahead of time is `planned`,
and adherence is the ratio of `completed` to `planned` per program day over a window.

### 5.8 Erg work

Ground truth is **distance and time only**. Split, pace and watts are the same fact in
three costumes, algebraically locked together by the Concept2 formula
(`watts = 2.80 / (sec_per_metre)^3`). Storing them independently guarantees they
disagree eventually and no one knows which to trust.

```sql
create table erg_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  piece_type erg_piece_type not null,
  spec text,                              -- '4x1000m/3:00r', '60min UT2'
  drag_factor smallint,
  target_split_sec numeric(6,2),
  notes text
);

create table erg_intervals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  erg_workout_id uuid not null references erg_workouts(id) on delete cascade,
  interval_no smallint not null,
  distance_m integer not null check (distance_m > 0),
  duration_sec numeric(8,2) not null check (duration_sec > 0),
  spm smallint, avg_hr smallint, max_hr smallint,
  rest_sec integer, rest_distance_m integer,
  rpe numeric(3,1) check (rpe between 1 and 10),
  split_sec numeric generated always as
    (duration_sec / nullif(distance_m,0) * 500) stored,
  avg_watts numeric generated always as
    (2.80 / nullif(power(duration_sec / nullif(distance_m,0), 3), 0)) stored,
  unique (erg_workout_id, interval_no)
);
```

Sanity check on the generated columns: 2000 m in 480 s gives
`split_sec = 480/2000*500 = 120` (a 2:00 split) and
`avg_watts = 2.80/0.24^3 = 202.5 W`, which is correct.

**UT2 and Interval AT are `piece_type` values, not separate tables.** A UT2 hour is
one interval row with a session-level RPE; a 4×1000 m AT session is four interval rows
with `rest_sec` populated. One shape, two input forms on top: UT2 is a short form,
AT is a repeating grid.

### 5.9 Lifting

Populated from confirmed screenshot imports, and hand-editable.

```sql
create table lift_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  set_no smallint not null,
  set_type lift_set_type not null default 'working',
  superset_group smallint,
  reps smallint check (reps >= 0),
  weight_kg numeric(6,2) check (weight_kg >= 0),
  rpe numeric(3,1) check (rpe between 1 and 10),
  rir smallint,
  completed_at timestamptz,
  is_pr boolean not null default false,
  notes text,
  volume_kg numeric generated always as
    (coalesce(reps,0) * coalesce(weight_kg,0)) stored,
  est_1rm numeric generated always as (
    case
      when reps is null or weight_kg is null or reps = 0 then null
      when reps = 1 then weight_kg
      else weight_kg * (1 + reps / 30.0)
    end) stored,
  unique (session_id, exercise_id, set_no)
);
```

`volume_kg` and `est_1rm` (Epley) are generated, never entered. `completed_at`, when
Strong's export provides per-set timestamps, yields actual rest as the gap between
consecutive sets — rest data as a byproduct, with no input.

### 5.10 Uploads and the parse pipeline

```sql
create table media_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  batch_id uuid not null default gen_random_uuid(),
  storage_path text not null,
  file_sha256 text not null,
  mime text, bytes integer,
  kind upload_kind not null,
  captured_at timestamptz,
  session_date date,
  status upload_status not null default 'pending',
  parsed_payload jsonb,
  parse_error text,
  parse_attempts smallint not null default 0,
  linked_session_id uuid references workout_sessions(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, file_sha256)
);
```

Flow:

```
photo → Supabase Storage → media_uploads(pending)
      → /api/parse-upload (Claude vision, strict JSON schema) → parsed_payload, status=parsed
      → review screen (editable diff, exercise mapping)
      → confirm → workout_sessions + lift_sets, status=confirmed
```

Four rules:

1. **A parse never writes to `lift_sets` directly.** It writes `parsed_payload`; only
   human confirmation promotes it. Vision models misread a cramped `8` as `3`, and
   because `est_1rm` is generated, one bad digit becomes a fake PR that then poisons
   every progression chart and anything the mentor concludes from them.
2. **`batch_id` groups multi-image sessions** so two or three screenshots of one long
   session review and promote as a single session rather than three fragments.
3. **`file_sha256` is unique per user,** so re-uploading the same screenshot cannot
   double-count volume.
4. **`parse_attempts` is capped at 3,** after which the row goes `failed` and the
   session must be entered by hand. Prevents a retry loop burning API credit.

`parsed_payload` shape (validated by Zod server-side before being stored):

```json
{
  "session_date": "2026-09-24",
  "title": "Upper A",
  "duration_min": 62,
  "exercises": [
    { "raw_name": "DB Incline Press",
      "resolved_exercise_id": null,
      "sets": [ { "reps": 8, "weight_kg": 30, "set_type": "working" } ] }
  ],
  "confidence": 0.86,
  "warnings": ["bottom row partially cut off"]
}
```

`resolved_exercise_id` is filled by alias lookup server-side; nulls become mapping
prompts in the review UI, and confirming a mapping appends to `exercises.aliases`.

### 5.11 Todos and schedule

```sql
create table todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null, notes text,
  status todo_status not null default 'open',
  priority smallint not null default 0,
  due_on date, due_at timestamptz,
  completed_at timestamptz,
  parent_todo_id uuid references todos(id) on delete cascade,
  recurrence text,                       -- RRULE string on a template row
  template_id uuid references todos(id) on delete set null,
  tags text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null,
  starts_at timestamptz not null, ends_at timestamptz,
  all_day boolean not null default false,
  kind text,                             -- work | training | personal | appointment
  location text, notes text,
  source text not null default 'manual', -- manual | gcal | program
  external_id text,
  program_day_id uuid references program_days(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ends_after_starts check (ends_at is null or ends_at > starts_at)
);
```

`source` and `external_id` exist so a Google Calendar sync can land here later without
a migration — this repo already holds working Google OAuth. `source = 'program'` blocks
are the split projected onto the calendar, which makes "what am I training today" and
"what's on today" the same screen.

### 5.12 Experiments and agent notes

```sql
create table experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null,
  hypothesis text not null,
  protocol text,
  metric_id uuid references metrics(id) on delete set null,
  falsifier text not null,
  starts_on date not null, ends_on date not null,
  status experiment_status not null default 'planned',
  result text,
  verdict text check (verdict in ('supported','falsified','inconclusive')),
  concluded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ends_after_starts check (ends_on > starts_on)
);

create table agent_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  kind note_kind not null,
  horizon text,                          -- daily | weekly | monthly
  body text not null,
  evidence jsonb,
  confidence numeric(3,2) check (confidence between 0 and 1),
  status note_status not null default 'new',
  model text,
  experiment_id uuid references experiments(id) on delete set null,
  created_at timestamptz not null default now()
);

create table daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  logged_on date not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);
```

`falsifier` is `not null` on purpose: an experiment you cannot lose is not an
experiment. This mirrors the discipline already applied to positions in the portfolio
system, pointed at the body instead of the market.

`agent_notes` is the mentor's single narrow write door, deliberately analogous to the
validated `state-patch` contract in `tools/run_agent.py`.

### 5.13 Row-level security

```sql
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','metrics','metric_entries','life_events','exercises','programs',
    'program_days','workout_sessions','erg_workouts','erg_intervals','lift_sets',
    'media_uploads','todos','schedule_blocks','experiments','agent_notes','daily_notes'
  ] loop
    execute format('alter table %I enable row level security', t);
    if t = 'profiles' then
      execute format($f$create policy owner_all on %I for all
        using (id = auth.uid()) with check (id = auth.uid())$f$, t);
    else
      execute format($f$create policy owner_all on %I for all
        using (user_id = auth.uid()) with check (user_id = auth.uid())$f$, t);
    end if;
  end loop;
end $$;
```

A `set_user_id()` BEFORE INSERT trigger on child tables copies `user_id` from the
parent when the client omits it, so `erg_intervals` and `lift_sets` can never end up
orphaned from their policy.

## 6. Views — the MCP interface

These views are the contract Claude reads. They exist so that "how has my energy
tracked against training volume this month?" is `select * from v_daily_summary`
rather than an invented five-table join.

| View | One row per | Contents |
|---|---|---|
| `v_daily_summary` | day | both sliders, habits done/total, erg metres, mean split, lift volume, session count, todos closed, active life events |
| `v_metric_daily` | day × metric | long format with slug, label, unit, value, and the `logged_at − logged_on` recall lag |
| `v_lift_prs` | exercise | best `est_1rm`, best set, and when |
| `v_weekly_volume_by_muscle` | week × muscle | working-set count and tonnage from `primary_muscle` |
| `v_erg_progress` | week × piece_type | metres, mean split, mean watts, mean RPE |
| `v_adherence` | week × program_day | planned vs completed sessions |
| `v_experiment_status` | experiment | window, days elapsed, the metric's mean inside vs outside the window |

**Views are created with owner (definer) rights — not `security_invoker` — and that is
load-bearing.** Claude connects over MCP as a Postgres role, not through Supabase Auth,
so `auth.uid()` is NULL for it and RLS on the base tables would return zero rows.
Definer-rights views let the read-only role see data while the base tables stay locked
to the app. This is safe *only because the system has one user*; adding a second user
would require `security_invoker` plus a different MCP strategy, and that constraint is
recorded here so it is not discovered the hard way.

Charts default to 7- and 28-day rolling averages computed in these views. Day-to-day
readiness is mostly noise; the rolling lines are the signal, and raw dailies sit behind
a toggle.

`metric_streak(p_metric_id uuid, p_as_of date) returns integer` — a plpgsql function
rather than a view, because "streak with grace" is awkward as a window query.
Algorithm: walk backwards day by day from `p_as_of`, counting misses within the
trailing 7-day window; stop at the second miss inside any such window; return the
number of days walked before that point. One miss per rolling week does not break the
streak — the all-or-nothing version is what makes people abandon a log after a single
bad day, which costs the data as well as the habit.

## 7. Security

- App access is Supabase Auth (email magic link), one row in `profiles`, RLS everywhere.
  Sessions persist via refresh token, so login is once per device, not once per day.
- `SUPABASE_SERVICE_ROLE_KEY` is used only by `/api/parse-upload` and the webhook route.
  It is never shipped to the client and never given to an agent.
- MCP gets a dedicated role:

```sql
create role claude_ro login password :'claude_ro_password';  -- psql variable; never commit the literal
grant usage on schema public to claude_ro;
grant select on v_daily_summary, v_metric_daily, v_lift_prs,
  v_weekly_volume_by_muscle, v_erg_progress, v_adherence, v_experiment_status
  to claude_ro;
-- deliberately no table-level grants
```

  The handful of writes the mentor may perform are `SECURITY DEFINER` functions with
  `EXECUTE` granted to `claude_ro`: `agent_note_create(kind, horizon, body, evidence,
  confidence)` and `experiment_conclude(experiment_id, verdict, result)`. Everything
  else is read-only by construction rather than by prompt instruction.
- Storage bucket is private; images are served via short-lived signed URLs.
- The Apple Health webhook authenticates on a shared secret in a header and rejects
  payloads with a timestamp older than 24 hours.

## 8. Error handling

| Failure | Behaviour |
|---|---|
| Write fails offline | Mutation persists to IndexedDB, UI stays optimistic, queue drains on reconnect. A visible badge shows the pending count so queued data is never invisible |
| Write rejected by a constraint | Mutation is dropped from the queue, not retried forever, and surfaced as a correctable error on the originating form |
| Vision parse returns invalid JSON | Zod rejects it, `parse_attempts` increments, one retry with a stricter prompt, then `failed` |
| Parse succeeds but is wrong | The review diff is the control. Nothing reaches canonical tables unconfirmed |
| Unresolvable exercise name | Review UI mapping step; confirming writes the alias back |
| Duplicate screenshot | Unique `file_sha256` rejects it; UI says so rather than erroring |
| Supabase project paused (free tier) | Daily use keeps it warm; a weekly Vercel cron guarantees it |

## 9. Testing

- Constraint and trigger tests run against a real Postgres (`pgTAP`, or a Vitest suite
  over a throwaway Supabase branch): the value/kind trigger, the generated erg columns
  against known Concept2 values, `est_1rm` at `reps = 1`, the dedupe constraint, and an
  RLS test asserting a second user sees nothing.
- Unit tests for alias resolution and the Zod payload schema.
- Playwright covers the two flows whose breakage would end the project: the ten-second
  morning log, and upload → parse → confirm → rows exist.
- The parse endpoint is tested against **fixture JSON, not live API calls.** Real
  screenshots are exercised in a small manual pass — three images, agreed in advance,
  per the project's paid-API rule.

## 10. Build order

| Phase | Contents | Done when |
|---|---|---|
| 0 | Repo scaffold, Supabase project, migrations, auth + RLS, generated types | Logged in on the phone, empty dashboard renders |
| 1 | Morning card: registry checklist, both sliders, daily summary, PWA install | A week of real morning logs, under ten seconds each |
| 2 | Workout ingest: upload → parse → confirm; manual UT2 and AT erg forms | A Strong session and an erg session both land correctly |
| 3 | Todos, schedule view, split projection, adherence | Split visible per day; adherence ratio computes |
| 4 | Charts on rolling averages, `life_events`, `experiments`, `agent_notes`, streaks | First n-of-1 experiment running with a real falsifier |
| 5 | `claude_ro` + MCP wiring, Apple Health webhook, Strong CSV backfill, Concept2 sync | Claude answers a question about the last 30 days unaided |

Phase 1 is independently useful — daily logging starts before anything else exists.

## 11. Prerequisites

| Needed | Where | Note |
|---|---|---|
| Supabase project + keys | Vercel env + local `.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `ANTHROPIC_API_KEY` | Vercel env | **Not yet available.** The existing `CLAUDE_CODE_OAUTH_TOKEN` authenticates headless `claude -p`, not API calls. This blocks only the parse path in phase 2 — the manual erg forms in the same phase are unaffected and can ship first |
| Supabase CLI | Local | Migrations and type generation |
| Strong CSV export | One-off | History backfill in phase 5 |
| Health Auto Export (iOS) | Phone | Optional, phase 5 |

## 12. Risks and open questions

- **Vision parse accuracy is the main product risk.** If confirmation turns out to be
  tedious in practice, the fallback is the Strong CSV export on a routine (weekly
  rather than per-session), which is exact. The `media_uploads` state machine and
  `source` column accommodate either without a schema change.
- **Free-tier pausing** is mitigated by a weekly cron, but a month away from the app
  would need a manual unpause.
- **Definer-rights views** are a single-user decision, documented in §6.
- **Generated erg columns** assume the standard Concept2 constant (2.80).
  Machine-specific calibration is out of scope; if it ever matters, the constant moves
  to a column.
- **`daily_notes` and `agent_notes` will hold** the most useful free text in the system
  and are the least structured. Accepted: Claude reads prose well.
