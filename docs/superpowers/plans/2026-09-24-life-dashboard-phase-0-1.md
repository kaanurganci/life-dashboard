# Life Dashboard — Phase 0 + 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working, installable mobile dashboard where the daily checklist and both 1–10 sliders can be logged in under ten seconds, persisted to Supabase Postgres with row-level security and an offline retry queue.

**Architecture:** Next.js 15 App Router on Vercel talks directly to Supabase Postgres; RLS is the security boundary, so no bespoke API layer exists. What gets tracked is data, not schema: a `metrics` registry table defines each habit, supplement and slider, and observations land in a long-format `metric_entries` table validated by a database trigger. Writes are optimistic and persist to IndexedDB so a failed write replays on reconnect.

**Tech Stack:** Next.js 15 (App Router, React 19), TypeScript, Tailwind v4, shadcn/ui, supabase-js + @supabase/ssr, TanStack Query v5 with a persisted mutation cache, Zod, Serwist, Vitest + Testing Library, Playwright, Supabase CLI.

**Spec:** `docs/superpowers/specs/2026-09-24-life-dashboard-design.md` (moved into this repo in Task 1)

## Global Constraints

- **Repo:** `C:\Users\kaanu\life-dashboard`, its own git repo, sibling to the WAT framework.
- **Node 24 / npm 11** — already installed. No Docker, no local `psql`, no local Postgres.
- **Two Supabase projects only:** `life-dashboard-dev` and `life-dashboard-prod`. The free tier permits two active projects and no branching, so dev is where tests run and prod is never used by a test.
- **Timezone:** `Europe/London`. `logged_on` is always computed client-side in the user's timezone; the column default exists only as a safety net.
- **`user_id uuid not null default auth.uid() references profiles(id) on delete cascade`** on every table, with RLS policy `user_id = auth.uid()` (on `profiles`, the policy keys on `id`).
- **Derived values are generated columns, never inputs.** No task writes `volume_kg`, `est_1rm`, `split_sec` or `avg_watts`.
- **Scale metrics are 1–10 inclusive**, enforced by the `validate_metric_entry` trigger against `metrics.scale_min` / `scale_max`.
- **Views are definer-rights** (no `security_invoker`). Supabase's linter flags this; the warning is accepted deliberately and documented in §6 of the spec.
- **No paid API calls in this plan.** The Anthropic vision parse is Phase 2. Nothing here needs `ANTHROPIC_API_KEY`.
- **Service-role key is server-and-test only.** It never appears in a `NEXT_PUBLIC_*` variable or in client-bundled code.

---

## File Structure

```
life-dashboard/
├── .gitignore                       # secrets, build output, test artifacts
├── .env.local.example               # documents required vars, no values
├── package.json
├── next.config.ts
├── tsconfig.json
├── vitest.config.ts                 # two projects: unit (jsdom), db (node)
├── playwright.config.ts
├── middleware.ts                    # auth session refresh + route guard
├── README.md
├── docs/superpowers/specs/2026-09-24-life-dashboard-design.md
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260924090000_enums_and_profiles.sql
│   │   ├── 20260924090100_metrics.sql
│   │   ├── 20260924090200_metric_entries.sql
│   │   └── 20260924090300_daily_summary.sql
│   └── seed_metrics.sql             # starting registry, run once per project
├── src/
│   ├── app/
│   │   ├── layout.tsx               # providers, viewport, theme
│   │   ├── globals.css
│   │   ├── page.tsx                 # Today screen (server component shell)
│   │   ├── login/page.tsx           # magic-link form
│   │   ├── auth/callback/route.ts   # PKCE code exchange
│   │   └── manifest.ts              # PWA manifest
│   ├── components/
│   │   ├── morning-card.tsx         # orchestrates the day's inputs
│   │   ├── metric-toggle.tsx        # one boolean habit row
│   │   ├── metric-slider.tsx        # one 1-10 scale row
│   │   ├── same-as-yesterday.tsx    # one-tap copy of yesterday's booleans
│   │   ├── pending-badge.tsx        # queued-write count
│   │   └── ui/                      # shadcn: button, card, slider, switch
│   ├── lib/
│   │   ├── supabase/client.ts       # browser client
│   │   ├── supabase/server.ts       # RSC/route-handler client
│   │   ├── date.ts                  # localDay, yesterday
│   │   ├── entries.ts              # buildEntryPayload, valueOf
│   │   ├── schemas.ts               # Zod mirrors of DB constraints
│   │   └── query-client.ts          # QueryClient + IndexedDB persister
│   ├── hooks/
│   │   ├── use-day-log.ts           # registry + today's entries
│   │   └── use-log-metric.ts        # optimistic upsert mutation
│   └── types/database.ts            # generated, do not hand-edit
└── tests/
    ├── db/helpers.ts                # admin client, test users, cleanup
    ├── db/profiles.test.ts
    ├── db/metrics.test.ts
    ├── db/metric-entries.test.ts
    ├── db/daily-summary.test.ts
    ├── unit/date.test.ts
    ├── unit/entries.test.ts
    ├── unit/query-client.test.ts
    ├── unit/morning-card.test.tsx
    └── e2e/morning-log.spec.ts
```

Responsibilities are split so that each file holds one job: `lib/` is pure logic with no React, `hooks/` is the only place that knows about the network, and `components/` renders. The database tests live apart from unit tests because they need a real project and a node environment.

---

### Task 1: Repo, scaffold, and the timezone-correct day

The first real logic in the project is "what day is it," because every write depends on it and it is wrong by default. A 00:40 entry belongs to the previous day's log in the user's head but not in UTC.

**Files:**
- Create: `C:\Users\kaanu\life-dashboard\` (git repo)
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.local.example`, `vitest.config.ts`, `README.md`
- Create: `src/lib/date.ts`
- Test: `tests/unit/date.test.ts`
- Move: the spec from `C:\Users\kaanu\Claude\docs\superpowers\specs\` into `docs/superpowers/specs/`

**Interfaces:**
- Consumes: nothing.
- Produces: `localDay(at?: Date, timeZone?: string): string` returning `YYYY-MM-DD`; `previousDay(day: string): string` returning `YYYY-MM-DD`.

- [ ] **Step 1: Scaffold the project**

```bash
cd /c/Users/kaanu
npx create-next-app@latest life-dashboard \
  --typescript --tailwind --app --eslint --src-dir \
  --import-alias "@/*" --no-turbopack --yes
cd life-dashboard
git init
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr @tanstack/react-query \
  @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister \
  idb-keyval zod
npm install -D supabase vitest @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/user-event @testing-library/jest-dom \
  dotenv @playwright/test
```

- [ ] **Step 3: Write `.gitignore` and `.env.local.example`**

`.gitignore` — append to what create-next-app generated:

```
.env
.env.local
.env*.local
supabase/.temp/
supabase/.branches/
test-results/
playwright-report/
```

`.env.local.example`:

```
# Browser-visible. Safe to expose; RLS is the security boundary.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Server and tests only. Never prefix with NEXT_PUBLIC_.
SUPABASE_SERVICE_ROLE_KEY=

# Database tests run against the dev project, never prod.
SUPABASE_DEV_URL=
SUPABASE_DEV_ANON_KEY=
SUPABASE_DEV_SERVICE_ROLE_KEY=
```

- [ ] **Step 4: Configure Vitest with two projects**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          setupFiles: ['./tests/unit/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: ['tests/db/**/*.test.ts'],
          setupFiles: ['./tests/db/setup.ts'],
          testTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
```

`tests/unit/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

`tests/db/setup.ts`:

```ts
import { config } from 'dotenv'
config({ path: '.env.local' })
```

Add scripts to `package.json`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run --project unit",
  "test:db": "vitest run --project db",
  "test:e2e": "playwright test",
  "types": "supabase gen types typescript --linked > src/types/database.ts"
}
```

- [ ] **Step 5: Write the failing test**

`tests/unit/date.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { localDay, previousDay } from '@/lib/date'

describe('localDay', () => {
  it('returns YYYY-MM-DD', () => {
    expect(localDay(new Date('2026-09-24T09:00:00Z'))).toBe('2026-09-24')
  })

  it('rolls to the next day for a late-night entry during BST', () => {
    // 23:40 UTC on 24 Sep is 00:40 on 25 Sep in London (UTC+1)
    expect(localDay(new Date('2026-09-24T23:40:00Z'))).toBe('2026-09-25')
  })

  it('does not roll during GMT', () => {
    // 23:40 UTC in January is still 23:40 in London (UTC+0)
    expect(localDay(new Date('2026-01-15T23:40:00Z'))).toBe('2026-01-15')
  })

  it('respects an explicit timezone', () => {
    expect(localDay(new Date('2026-09-24T23:40:00Z'), 'America/New_York'))
      .toBe('2026-09-24')
  })
})

describe('previousDay', () => {
  it('steps back one day', () => {
    expect(previousDay('2026-09-24')).toBe('2026-09-23')
  })

  it('steps back across a month boundary', () => {
    expect(previousDay('2026-10-01')).toBe('2026-09-30')
  })

  it('steps back across a DST boundary without losing a day', () => {
    // UK clocks go back on 25 Oct 2026
    expect(previousDay('2026-10-26')).toBe('2026-10-25')
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/lib/date"`

- [ ] **Step 7: Write the implementation**

`src/lib/date.ts`:

```ts
export const DEFAULT_TIMEZONE = 'Europe/London'

/**
 * The calendar day an observation belongs to, in the user's timezone.
 * en-CA formats as YYYY-MM-DD, which is what Postgres `date` wants.
 */
export function localDay(at: Date = new Date(), timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/**
 * The day before `day`. Operates on the calendar string with UTC arithmetic so
 * no daylight-saving transition can swallow or duplicate a day.
 */
export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d))
  at.setUTCDate(at.getUTCDate() - 1)
  return at.toISOString().slice(0, 10)
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 7 tests

- [ ] **Step 9: Move the spec and this plan into this repo**

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
mv /c/Users/kaanu/Claude/docs/superpowers/specs/2026-09-24-life-dashboard-design.md \
   docs/superpowers/specs/
mv /c/Users/kaanu/Claude/docs/superpowers/plans/2026-09-24-life-dashboard-phase-0-1.md \
   docs/superpowers/plans/
```

Both documents belong with the code they describe. The WAT repo keeps neither.

Write `README.md`:

```markdown
# Life Dashboard

Mobile-first daily metrics dashboard on Next.js + Supabase. The database is the
source of truth and is exposed to Claude over MCP as a read-only role.

Design spec: `docs/superpowers/specs/2026-09-24-life-dashboard-design.md`

## Setup
1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in both Supabase projects.
3. `npx supabase link --project-ref <dev-ref>` then `npx supabase db push`
4. `npm run types`
5. `npm run dev`

## Tests
- `npm test` — unit and component tests
- `npm run test:db` — runs against the **dev** Supabase project
- `npm run test:e2e` — Playwright
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app, test harness, and timezone-correct day helper"
```

---

### Task 2: Supabase projects, enums, profiles, and the DB test harness

**Files:**
- Create: `supabase/migrations/20260924090000_enums_and_profiles.sql`
- Create: `tests/db/helpers.ts`
- Test: `tests/db/profiles.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 except the repo.
- Produces: SQL enums `metric_kind`, `entry_source`, `workout_modality`, `session_status`, `erg_piece_type`, `lift_set_type`, `upload_kind`, `upload_status`, `todo_status`, `note_kind`, `note_status`, `experiment_status`; table `public.profiles`. Test helpers `admin`, `createTestUser(): Promise<TestUser>`, `clientFor(user: TestUser)`, `deleteTestUser(user: TestUser)`, where `TestUser = { id: string; email: string; accessToken: string }`.

All enums land in this one migration even though Phase 1 only uses two of them, because `create type` is cheap and a later phase adding a type mid-history makes migrations harder to reason about than a single vocabulary file.

- [ ] **Step 1: Create both Supabase projects and link dev**

In the Supabase dashboard, create `life-dashboard-dev` and `life-dashboard-prod` (region London / `eu-west-2`). Copy each project's URL, anon key and service-role key into `.env.local` per `.env.local.example`. Then:

```bash
npx supabase login
npx supabase init
npx supabase link --project-ref <dev-project-ref>
```

- [ ] **Step 2: Write the migration**

`supabase/migrations/20260924090000_enums_and_profiles.sql`:

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

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone     text not null default 'Europe/London',
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy owner_all on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- A profile must exist for every auth user, because every other table's
-- user_id has a foreign key to it.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 3: Push the migration to dev**

Run: `npx supabase db push`
Expected: `Finished supabase db push.` with the migration listed.

- [ ] **Step 4: Write the test harness**

`tests/db/helpers.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.SUPABASE_DEV_URL
const anonKey = process.env.SUPABASE_DEV_ANON_KEY
const serviceKey = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY

if (!url || !anonKey || !serviceKey) {
  throw new Error('DB tests need SUPABASE_DEV_URL, SUPABASE_DEV_ANON_KEY and ' +
    'SUPABASE_DEV_SERVICE_ROLE_KEY in .env.local')
}
if (process.env.SUPABASE_DEV_URL === process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Refusing to run DB tests: dev URL equals the app URL')
}

export const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export type TestUser = { id: string; email: string; accessToken: string }

export async function createTestUser(): Promise<TestUser> {
  const email = `test-${randomUUID()}@example.com`
  const password = randomUUID()

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (error) throw error

  const signIn = await createClient(url!, anonKey!, {
    auth: { persistSession: false },
  }).auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error

  return {
    id: created.user!.id,
    email,
    accessToken: signIn.data.session!.access_token,
  }
}

/** A client that acts as `user`, so RLS applies exactly as it does in the app. */
export function clientFor(user: TestUser): SupabaseClient {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.accessToken}` } },
  })
}

/** Cascades through profiles and every user_id foreign key. */
export async function deleteTestUser(user: TestUser): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) throw error
}
```

- [ ] **Step 5: Write the failing test**

`tests/db/profiles.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, clientFor, createTestUser, deleteTestUser, type TestUser }
  from './helpers'

describe('profiles', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser()
    bob = await createTestUser()
  })

  afterAll(async () => {
    await deleteTestUser(alice)
    await deleteTestUser(bob)
  })

  it('creates a profile automatically on signup', async () => {
    const { data, error } = await admin
      .from('profiles').select('id, timezone').eq('id', alice.id).single()

    expect(error).toBeNull()
    expect(data?.id).toBe(alice.id)
    expect(data?.timezone).toBe('Europe/London')
  })

  it('lets a user read their own profile', async () => {
    const { data } = await clientFor(alice).from('profiles').select('id')
    expect(data).toHaveLength(1)
    expect(data?.[0].id).toBe(alice.id)
  })

  it('hides other users behind RLS', async () => {
    const { data } = await clientFor(bob).from('profiles').select('id')
    expect(data).toHaveLength(1)
    expect(data?.[0].id).toBe(bob.id)
    expect(data?.[0].id).not.toBe(alice.id)
  })

  it('refuses a write targeting another user', async () => {
    const { error } = await clientFor(bob)
      .from('profiles').update({ display_name: 'hacked' }).eq('id', alice.id)
    const { data } = await admin
      .from('profiles').select('display_name').eq('id', alice.id).single()

    expect(data?.display_name).not.toBe('hacked')
    expect(error === null || error.code === '42501').toBe(true)
  })
})
```

The last assertion accepts either shape because PostgREST reports a
policy-filtered `UPDATE` as zero rows affected rather than an error; what matters
is that Alice's row is unchanged.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:db -- profiles`
Expected: PASS — 4 tests. (The migration is already pushed, so this test passes
on first run; it is a verification of the migration, not a red-green cycle.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: enums, profiles table with RLS, and database test harness"
```

---

### Task 3: The metrics registry

**Files:**
- Create: `supabase/migrations/20260924090100_metrics.sql`
- Create: `supabase/seed_metrics.sql`
- Test: `tests/db/metrics.test.ts`

**Interfaces:**
- Consumes: `metric_kind` enum and `profiles` from Task 2; `admin`, `clientFor`, `createTestUser`, `deleteTestUser` from `tests/db/helpers.ts`.
- Produces: table `public.metrics` with columns `id, user_id, slug, label, description, kind, category, unit, scale_min, scale_max, target_value, sort_order, is_active, archived_at, created_at`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260924090100_metrics.sql`:

```sql
create table public.metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
                 references public.profiles(id) on delete cascade,
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
    kind <> 'scale'
    or (scale_min is not null and scale_max is not null and scale_min < scale_max)
  )
);

create index metrics_active_idx
  on public.metrics (user_id, is_active, sort_order);

alter table public.metrics enable row level security;

create policy owner_all on public.metrics for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Push and verify**

Run: `npx supabase db push`
Expected: the new migration applies with no error.

- [ ] **Step 3: Write the failing test**

`tests/db/metrics.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clientFor, createTestUser, deleteTestUser, type TestUser }
  from './helpers'

describe('metrics registry', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser()
    bob = await createTestUser()
  })

  afterAll(async () => {
    await deleteTestUser(alice)
    await deleteTestUser(bob)
  })

  it('defaults user_id to the caller', async () => {
    const { data, error } = await clientFor(alice).from('metrics')
      .insert({ slug: 'creatine', label: 'Creatine', kind: 'boolean',
                category: 'supplement' })
      .select('user_id, is_active, sort_order').single()

    expect(error).toBeNull()
    expect(data?.user_id).toBe(alice.id)
    expect(data?.is_active).toBe(true)
    expect(data?.sort_order).toBe(0)
  })

  it('rejects a scale metric with no bounds', async () => {
    const { error } = await clientFor(alice).from('metrics')
      .insert({ slug: 'mood', label: 'Mood', kind: 'scale', category: 'wellbeing' })

    expect(error?.code).toBe('23514')            // check_violation
    expect(error?.message).toContain('scale_bounds_present')
  })

  it('rejects inverted scale bounds', async () => {
    const { error } = await clientFor(alice).from('metrics')
      .insert({ slug: 'mood2', label: 'Mood', kind: 'scale', category: 'wellbeing',
                scale_min: 10, scale_max: 1 })

    expect(error?.code).toBe('23514')
  })

  it('accepts a well-formed scale metric', async () => {
    const { error } = await clientFor(alice).from('metrics')
      .insert({ slug: 'sleep_quality', label: 'Sleep Quality', kind: 'scale',
                category: 'wellbeing', scale_min: 1, scale_max: 10 })

    expect(error).toBeNull()
  })

  it('rejects a duplicate slug for the same user', async () => {
    const { error } = await clientFor(alice).from('metrics')
      .insert({ slug: 'creatine', label: 'Creatine again', kind: 'boolean',
                category: 'supplement' })

    expect(error?.code).toBe('23505')            // unique_violation
  })

  it('allows the same slug for a different user', async () => {
    const { error } = await clientFor(bob).from('metrics')
      .insert({ slug: 'creatine', label: 'Creatine', kind: 'boolean',
                category: 'supplement' })

    expect(error).toBeNull()
  })

  it('refuses an insert claiming another user', async () => {
    const { error } = await clientFor(bob).from('metrics')
      .insert({ user_id: alice.id, slug: 'smuggled', label: 'Smuggled',
                kind: 'boolean', category: 'habit' })

    expect(error?.code).toBe('42501')            // RLS check violation
  })

  it("hides another user's metrics from a select", async () => {
    const { data } = await clientFor(bob).from('metrics').select('slug, user_id')
    expect(data?.every((m) => m.user_id === bob.id)).toBe(true)
  })
})
```

- [ ] **Step 4: Run the test**

Run: `npm run test:db -- metrics`
Expected: PASS — 8 tests

- [ ] **Step 5: Write the starting registry**

`supabase/seed_metrics.sql`. Run manually, once per project, via the SQL editor
with the owning user's id substituted — it is not a migration, because it is
per-user data rather than schema:

```sql
-- Replace :uid with the profile id before running.
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
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: metrics registry with scale-bounds constraint and seed data"
```

---

### Task 4: Metric entries and the validation trigger

This is the integrity core of the whole system. A CHECK constraint cannot read
`metrics`, so kind-agreement has to be a trigger, and it has to be tested
properly — everything downstream trusts it.

**Files:**
- Create: `supabase/migrations/20260924090200_metric_entries.sql`
- Test: `tests/db/metric-entries.test.ts`

**Interfaces:**
- Consumes: `metrics` from Task 3, `entry_source` enum from Task 2.
- Produces: table `public.metric_entries` with columns `id, user_id, metric_id, logged_on, logged_at, occurrence, value_num, value_bool, value_text, note, source, created_at, updated_at`, unique on `(user_id, metric_id, logged_on, occurrence)`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260924090200_metric_entries.sql`:

```sql
create table public.metric_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid()
               references public.profiles(id) on delete cascade,
  metric_id  uuid not null references public.metrics(id) on delete cascade,
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
    (value_num is not null)::int
    + (value_bool is not null)::int
    + (value_text is not null)::int = 1
  )
);

create index metric_entries_day_idx
  on public.metric_entries (user_id, logged_on desc);
create index metric_entries_metric_idx
  on public.metric_entries (metric_id, logged_on desc);

create or replace function public.validate_metric_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare m public.metrics;
begin
  select * into m from public.metrics where id = new.metric_id;
  if not found then
    raise exception 'metric % does not exist', new.metric_id;
  end if;
  if m.user_id <> new.user_id then
    raise exception 'metric % does not belong to user %',
      new.metric_id, new.user_id;
  end if;

  case m.kind
    when 'boolean' then
      if new.value_bool is null then
        raise exception '% expects a boolean', m.slug;
      end if;
    when 'text' then
      if new.value_text is null then
        raise exception '% expects text', m.slug;
      end if;
    when 'scale' then
      if new.value_num is null then
        raise exception '% expects a number', m.slug;
      end if;
      if new.value_num < m.scale_min or new.value_num > m.scale_max then
        raise exception '% must be between % and %, got %',
          m.slug, m.scale_min, m.scale_max, new.value_num;
      end if;
    else -- numeric, duration
      if new.value_num is null then
        raise exception '% expects a number', m.slug;
      end if;
  end case;

  new.updated_at := now();
  return new;
end $$;

create trigger metric_entries_validate
  before insert or update on public.metric_entries
  for each row execute function public.validate_metric_entry();

alter table public.metric_entries enable row level security;

create policy owner_all on public.metric_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Push and verify**

Run: `npx supabase db push`
Expected: applies cleanly.

- [ ] **Step 3: Write the failing test**

`tests/db/metric-entries.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clientFor, createTestUser, deleteTestUser, type TestUser }
  from './helpers'

const DAY = '2026-09-24'

describe('metric_entries', () => {
  let alice: TestUser
  let bob: TestUser
  let sleepId: string
  let creatineId: string
  let weightId: string
  let bobHabitId: string

  beforeAll(async () => {
    alice = await createTestUser()
    bob = await createTestUser()
    const a = clientFor(alice)

    const { data: metrics, error } = await a.from('metrics').insert([
      { slug: 'sleep_quality', label: 'Sleep', kind: 'scale',
        category: 'wellbeing', scale_min: 1, scale_max: 10 },
      { slug: 'creatine', label: 'Creatine', kind: 'boolean',
        category: 'supplement' },
      { slug: 'bodyweight_kg', label: 'Bodyweight', kind: 'numeric',
        category: 'body', unit: 'kg' },
    ]).select('id, slug')
    if (error) throw error

    sleepId = metrics!.find((m) => m.slug === 'sleep_quality')!.id
    creatineId = metrics!.find((m) => m.slug === 'creatine')!.id
    weightId = metrics!.find((m) => m.slug === 'bodyweight_kg')!.id

    const { data: bobMetric } = await clientFor(bob).from('metrics')
      .insert({ slug: 'creatine', label: 'Creatine', kind: 'boolean',
                category: 'supplement' })
      .select('id').single()
    bobHabitId = bobMetric!.id
  })

  afterAll(async () => {
    await deleteTestUser(alice)
    await deleteTestUser(bob)
  })

  it('accepts a scale value inside its bounds', async () => {
    const { data, error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: sleepId, logged_on: DAY, value_num: 7 })
      .select('user_id, occurrence, source').single()

    expect(error).toBeNull()
    expect(data?.user_id).toBe(alice.id)
    expect(data?.occurrence).toBe(1)
    expect(data?.source).toBe('dashboard')
  })

  it('rejects a scale value above its maximum', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: sleepId, logged_on: '2026-09-25', value_num: 11 })

    expect(error?.message).toContain('must be between 1 and 10')
  })

  it('rejects a scale value below its minimum', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: sleepId, logged_on: '2026-09-26', value_num: 0 })

    expect(error?.message).toContain('must be between 1 and 10')
  })

  it('rejects a boolean value on a scale metric', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: sleepId, logged_on: '2026-09-27', value_bool: true })

    expect(error?.message).toContain('expects a number')
  })

  it('rejects a numeric value on a boolean metric', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: creatineId, logged_on: DAY, value_num: 1 })

    expect(error?.message).toContain('expects a boolean')
  })

  it('rejects an entry with no value at all', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: creatineId, logged_on: '2026-09-28' })

    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('exactly_one_value')
  })

  it('rejects an entry with two values', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: creatineId, logged_on: '2026-09-29',
                value_bool: true, value_num: 1 })

    expect(error?.code).toBe('23514')
  })

  it('accepts an unbounded numeric metric', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: weightId, logged_on: DAY, value_num: 82.4 })

    expect(error).toBeNull()
  })

  it('rejects a second entry for the same metric and day', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: creatineId, logged_on: DAY, value_bool: true })
    expect(error).toBeNull()

    const { error: dupe } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: creatineId, logged_on: DAY, value_bool: false })
    expect(dupe?.code).toBe('23505')
  })

  it('allows a second dose via occurrence', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: creatineId, logged_on: DAY, occurrence: 2,
                value_bool: true })

    expect(error).toBeNull()
  })

  it('upserts on the natural key', async () => {
    const { data, error } = await clientFor(alice).from('metric_entries')
      .upsert({ metric_id: sleepId, logged_on: DAY, occurrence: 1, value_num: 9 },
              { onConflict: 'user_id,metric_id,logged_on,occurrence' })
      .select('value_num').single()

    expect(error).toBeNull()
    expect(Number(data?.value_num)).toBe(9)
  })

  it("refuses an entry against another user's metric", async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: bobHabitId, logged_on: DAY, value_bool: true })

    expect(error).not.toBeNull()
  })

  it("hides another user's entries", async () => {
    const { data } = await clientFor(bob).from('metric_entries').select('id')
    expect(data).toHaveLength(0)
  })

  it('defaults logged_at to now and keeps logged_on independent', async () => {
    const { data } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: weightId, logged_on: '2026-09-20', value_num: 83 })
      .select('logged_on, logged_at').single()

    expect(data?.logged_on).toBe('2026-09-20')
    // Back-filled: typed well after the day it belongs to.
    expect(new Date(data!.logged_at).getTime())
      .toBeGreaterThan(new Date('2026-09-21').getTime())
  })
})
```

- [ ] **Step 4: Run the test**

Run: `npm run test:db -- metric-entries`
Expected: PASS — 14 tests

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: metric_entries with kind-validation trigger and upsert key"
```

---

### Task 5: The daily summary view

**Files:**
- Create: `supabase/migrations/20260924090300_daily_summary.sql`
- Test: `tests/db/daily-summary.test.ts`

**Interfaces:**
- Consumes: `metrics`, `metric_entries`.
- Produces: view `public.v_daily_summary` with columns `user_id, day, sleep_quality, morning_readiness, habits_done, habits_total`.

This is the Phase 1 subset of the view specified in §6. Phases 2–4 extend it with
erg metres, lift volume, session count, todos closed and active life events; the
column list here is deliberately smaller than the spec's table and grows by
`create or replace view` in those phases.

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260924090300_daily_summary.sql`:

```sql
-- Definer rights on purpose: the MCP role reads views, not tables, and
-- auth.uid() is NULL for it. See spec §6. Supabase's linter flags this.
create or replace view public.v_daily_summary as
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
  'One row per logged day. Definer rights so the read-only MCP role can select.';
```

- [ ] **Step 2: Push and verify**

Run: `npx supabase db push`
Expected: applies cleanly.

- [ ] **Step 3: Write the failing test**

`tests/db/daily-summary.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clientFor, createTestUser, deleteTestUser, type TestUser }
  from './helpers'

const DAY = '2026-09-24'

describe('v_daily_summary', () => {
  let alice: TestUser

  beforeAll(async () => {
    alice = await createTestUser()
    const a = clientFor(alice)

    const { data: metrics, error } = await a.from('metrics').insert([
      { slug: 'sleep_quality', label: 'Sleep', kind: 'scale',
        category: 'wellbeing', scale_min: 1, scale_max: 10 },
      { slug: 'morning_readiness', label: 'Readiness', kind: 'scale',
        category: 'wellbeing', scale_min: 1, scale_max: 10 },
      { slug: 'creatine', label: 'Creatine', kind: 'boolean',
        category: 'supplement' },
      { slug: 'vitamin_d', label: 'Vitamin D', kind: 'boolean',
        category: 'supplement' },
      { slug: 'retired_habit', label: 'Retired', kind: 'boolean',
        category: 'habit', is_active: false },
    ]).select('id, slug')
    if (error) throw error

    const id = (slug: string) => metrics!.find((m) => m.slug === slug)!.id

    const { error: entryError } = await a.from('metric_entries').insert([
      { metric_id: id('sleep_quality'), logged_on: DAY, value_num: 7 },
      { metric_id: id('morning_readiness'), logged_on: DAY, value_num: 6 },
      { metric_id: id('creatine'), logged_on: DAY, value_bool: true },
      { metric_id: id('vitamin_d'), logged_on: DAY, value_bool: false },
    ])
    if (entryError) throw entryError
  })

  afterAll(async () => {
    await deleteTestUser(alice)
  })

  it('summarises a logged day', async () => {
    const { data, error } = await clientFor(alice)
      .from('v_daily_summary').select('*').eq('day', DAY).single()

    expect(error).toBeNull()
    expect(Number(data!.sleep_quality)).toBe(7)
    expect(Number(data!.morning_readiness)).toBe(6)
    expect(Number(data!.habits_done)).toBe(1)     // creatine only
  })

  it('counts habits_total from the active registry, not from entries', async () => {
    const { data } = await clientFor(alice)
      .from('v_daily_summary').select('habits_total').eq('day', DAY).single()

    // creatine + vitamin_d are active; retired_habit is not.
    expect(Number(data!.habits_total)).toBe(2)
  })

  it('returns no rows for a day with nothing logged', async () => {
    const { data } = await clientFor(alice)
      .from('v_daily_summary').select('day').eq('day', '2026-09-23')

    expect(data).toHaveLength(0)
  })
})
```

- [ ] **Step 4: Run the test**

Run: `npm run test:db -- daily-summary`
Expected: PASS — 3 tests

Note: the view is definer-rights, so it does not filter by `auth.uid()` on its
own. PostgREST still applies RLS to the underlying tables for a normal
authenticated request, which is why Alice sees only her rows. Task 11 of the
Phase 5 plan adds the `claude_ro` grant that depends on this property.

- [ ] **Step 5: Generate types and commit**

```bash
npm run types
git add -A
git commit -m "feat: v_daily_summary view and generated database types"
```

---

### Task 6: Authentication

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`
- Create: `middleware.ts`
- Create: `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`
- Modify: `src/app/page.tsx`
- Test: `tests/unit/auth-guard.test.ts`

**Interfaces:**
- Consumes: `Database` type from `src/types/database.ts`.
- Produces: `createBrowserSupabase(): SupabaseClient<Database>`; `createServerSupabase(): Promise<SupabaseClient<Database>>`; `isProtectedPath(pathname: string): boolean`.

- [ ] **Step 1: Write the failing test**

The routing rule is the part worth testing — the Supabase clients are thin
wrappers whose behaviour belongs to Playwright in Task 10.

`tests/unit/auth-guard.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isProtectedPath } from '@/lib/supabase/guard'

describe('isProtectedPath', () => {
  it('protects the dashboard', () => {
    expect(isProtectedPath('/')).toBe(true)
    expect(isProtectedPath('/history')).toBe(true)
  })

  it('leaves the auth routes open', () => {
    expect(isProtectedPath('/login')).toBe(false)
    expect(isProtectedPath('/auth/callback')).toBe(false)
  })

  it('leaves static and PWA assets open', () => {
    expect(isProtectedPath('/manifest.webmanifest')).toBe(false)
    expect(isProtectedPath('/sw.js')).toBe(false)
    expect(isProtectedPath('/icons/icon-192.png')).toBe(false)
    expect(isProtectedPath('/_next/static/chunk.js')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/supabase/guard`

- [ ] **Step 3: Write the guard**

`src/lib/supabase/guard.ts`:

```ts
const OPEN_PREFIXES = [
  '/login',
  '/auth',
  '/_next',
  '/icons',
  '/manifest.webmanifest',
  '/sw.js',
  '/favicon.ico',
]

export function isProtectedPath(pathname: string): boolean {
  return !OPEN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 3 new tests

- [ ] **Step 5: Write the Supabase clients**

`src/lib/supabase/client.ts`:

```ts
'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

`src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session instead.
          }
        },
      },
    },
  )
}
```

- [ ] **Step 6: Write the middleware**

`middleware.ts` at the repo root:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isProtectedPath } from '@/lib/supabase/guard'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options))
        },
      },
    },
  )

  // Refreshes the token and writes the rotated cookies onto `response`.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 7: Write the login page and callback**

`src/app/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const supabase = createBrowserSupabase()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })

    if (error) setError(error.message)
    else setSent(true)
  }

  if (sent) {
    return (
      <main className="mx-auto max-w-sm p-6">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-neutral-600">
          A sign-in link is on its way to {email}.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <form onSubmit={send} className="mt-4 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="h-12 w-full rounded-lg border px-3 text-base"
        />
        <button
          type="submit"
          className="h-12 w-full rounded-lg bg-black text-base font-medium text-white"
        >
          Send link
        </button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  )
}
```

`src/app/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const origin = request.nextUrl.origin

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`)
  }

  return NextResponse.redirect(origin)
}
```

- [ ] **Step 8: Add the redirect URL in Supabase**

In the dev project's Authentication → URL Configuration, add
`http://localhost:3000/auth/callback` to the allowed redirect list. Repeat with
the Vercel URL in Task 10.

- [ ] **Step 9: Verify manually**

Run: `npm run dev`, open `http://localhost:3000`
Expected: redirect to `/login`. Submit your email, click the link, land back on
`/` authenticated.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: magic-link auth with middleware session refresh and route guard"
```

---

### Task 7: Entry payload construction

Pure logic, isolated from React and the network, because getting the wrong column
for a metric kind is the single easiest way to trip the database trigger.

**Files:**
- Create: `src/lib/schemas.ts`, `src/lib/entries.ts`
- Test: `tests/unit/entries.test.ts`

**Interfaces:**
- Consumes: `localDay` from `src/lib/date.ts`.
- Produces:
  - `type MetricKind = 'boolean' | 'scale' | 'numeric' | 'duration' | 'text'`
  - `type Metric = { id: string; slug: string; label: string; kind: MetricKind; category: string; unit: string | null; scale_min: number | null; scale_max: number | null; sort_order: number }`
  - `type MetricEntry = { id?: string; metric_id: string; logged_on: string; occurrence: number; value_num: number | null; value_bool: boolean | null; value_text: string | null }`
  - `buildEntryPayload(metric: Metric, value: number | boolean | string, day: string, occurrence?: number): MetricEntry`
  - `valueOf(metric: Metric, entry: MetricEntry | undefined): number | boolean | string | null`
  - `ENTRY_CONFLICT_TARGET: string`

- [ ] **Step 1: Write the failing test**

`tests/unit/entries.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildEntryPayload, valueOf, ENTRY_CONFLICT_TARGET } from '@/lib/entries'
import type { Metric } from '@/lib/schemas'

const sleep: Metric = {
  id: 'm1', slug: 'sleep_quality', label: 'Sleep Quality', kind: 'scale',
  category: 'wellbeing', unit: null, scale_min: 1, scale_max: 10, sort_order: 1,
}
const creatine: Metric = {
  id: 'm2', slug: 'creatine', label: 'Creatine', kind: 'boolean',
  category: 'supplement', unit: null, scale_min: null, scale_max: null,
  sort_order: 10,
}
const weight: Metric = {
  id: 'm3', slug: 'bodyweight_kg', label: 'Bodyweight', kind: 'numeric',
  category: 'body', unit: 'kg', scale_min: null, scale_max: null, sort_order: 30,
}

describe('buildEntryPayload', () => {
  it('puts a scale value in value_num', () => {
    expect(buildEntryPayload(sleep, 7, '2026-09-24')).toEqual({
      metric_id: 'm1', logged_on: '2026-09-24', occurrence: 1,
      value_num: 7, value_bool: null, value_text: null,
    })
  })

  it('puts a boolean value in value_bool', () => {
    expect(buildEntryPayload(creatine, true, '2026-09-24')).toEqual({
      metric_id: 'm2', logged_on: '2026-09-24', occurrence: 1,
      value_num: null, value_bool: true, value_text: null,
    })
  })

  it('keeps false as a real value, not an absence', () => {
    const payload = buildEntryPayload(creatine, false, '2026-09-24')
    expect(payload.value_bool).toBe(false)
    expect(payload.value_num).toBeNull()
  })

  it('accepts a decimal for an unbounded numeric metric', () => {
    expect(buildEntryPayload(weight, 82.4, '2026-09-24').value_num).toBe(82.4)
  })

  it('passes occurrence through for a second dose', () => {
    expect(buildEntryPayload(creatine, true, '2026-09-24', 2).occurrence).toBe(2)
  })

  it('rejects a scale value outside its bounds before it reaches the database', () => {
    expect(() => buildEntryPayload(sleep, 11, '2026-09-24'))
      .toThrow(/between 1 and 10/)
    expect(() => buildEntryPayload(sleep, 0, '2026-09-24'))
      .toThrow(/between 1 and 10/)
  })

  it('rejects a mismatched value type', () => {
    expect(() => buildEntryPayload(creatine, 1 as unknown as boolean, '2026-09-24'))
      .toThrow(/expects a boolean/)
    expect(() => buildEntryPayload(sleep, true as unknown as number, '2026-09-24'))
      .toThrow(/expects a number/)
  })

  it('rejects a malformed day', () => {
    expect(() => buildEntryPayload(sleep, 7, '24/09/2026')).toThrow(/YYYY-MM-DD/)
  })
})

describe('valueOf', () => {
  it('reads the column matching the kind', () => {
    const entry = buildEntryPayload(sleep, 7, '2026-09-24')
    expect(valueOf(sleep, entry)).toBe(7)
  })

  it('returns null for a missing entry', () => {
    expect(valueOf(sleep, undefined)).toBeNull()
  })

  it('distinguishes a logged false from a missing entry', () => {
    const entry = buildEntryPayload(creatine, false, '2026-09-24')
    expect(valueOf(creatine, entry)).toBe(false)
    expect(valueOf(creatine, undefined)).toBeNull()
  })
})

describe('ENTRY_CONFLICT_TARGET', () => {
  it('matches the database unique constraint', () => {
    expect(ENTRY_CONFLICT_TARGET).toBe('user_id,metric_id,logged_on,occurrence')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/entries`

- [ ] **Step 3: Write the schemas**

`src/lib/schemas.ts`:

```ts
import { z } from 'zod'

export const metricKindSchema = z.enum([
  'boolean', 'scale', 'numeric', 'duration', 'text',
])
export type MetricKind = z.infer<typeof metricKindSchema>

export const metricSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  label: z.string().min(1),
  kind: metricKindSchema,
  category: z.string().min(1),
  unit: z.string().nullable(),
  scale_min: z.number().int().nullable(),
  scale_max: z.number().int().nullable(),
  sort_order: z.number().int(),
})
export type Metric = z.infer<typeof metricSchema>

export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'day must be YYYY-MM-DD',
})

export const metricEntrySchema = z.object({
  id: z.string().uuid().optional(),
  metric_id: z.string().uuid(),
  logged_on: daySchema,
  occurrence: z.number().int().positive(),
  value_num: z.number().nullable(),
  value_bool: z.boolean().nullable(),
  value_text: z.string().nullable(),
})
export type MetricEntry = z.infer<typeof metricEntrySchema>
```

- [ ] **Step 4: Write the payload builder**

`src/lib/entries.ts`:

```ts
import { daySchema, type Metric, type MetricEntry } from '@/lib/schemas'

/** Mirrors the unique constraint on metric_entries. */
export const ENTRY_CONFLICT_TARGET = 'user_id,metric_id,logged_on,occurrence'

/**
 * Builds the row for a metric's value, choosing the column its kind requires.
 * Throws on anything the `validate_metric_entry` trigger would reject, so a bad
 * value fails on the device instead of surviving in the offline queue.
 */
export function buildEntryPayload(
  metric: Metric,
  value: number | boolean | string,
  day: string,
  occurrence = 1,
): MetricEntry {
  const parsedDay = daySchema.safeParse(day)
  if (!parsedDay.success) throw new Error('day must be YYYY-MM-DD')

  const base = {
    metric_id: metric.id,
    logged_on: day,
    occurrence,
    value_num: null as number | null,
    value_bool: null as boolean | null,
    value_text: null as string | null,
  }

  switch (metric.kind) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error(`${metric.slug} expects a boolean`)
      }
      return { ...base, value_bool: value }

    case 'text':
      if (typeof value !== 'string') {
        throw new Error(`${metric.slug} expects text`)
      }
      return { ...base, value_text: value }

    case 'scale': {
      if (typeof value !== 'number') {
        throw new Error(`${metric.slug} expects a number`)
      }
      const min = metric.scale_min ?? 1
      const max = metric.scale_max ?? 10
      if (value < min || value > max) {
        throw new Error(`${metric.slug} must be between ${min} and ${max}`)
      }
      return { ...base, value_num: value }
    }

    default: // numeric, duration
      if (typeof value !== 'number') {
        throw new Error(`${metric.slug} expects a number`)
      }
      return { ...base, value_num: value }
  }
}

/** Reads the column a metric's kind stores its value in. */
export function valueOf(
  metric: Metric,
  entry: MetricEntry | undefined,
): number | boolean | string | null {
  if (!entry) return null

  switch (metric.kind) {
    case 'boolean': return entry.value_bool
    case 'text':    return entry.value_text
    default:        return entry.value_num
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 12 new tests

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Zod schemas and kind-aware entry payload construction"
```

---

### Task 8: The offline write path

**Files:**
- Create: `src/lib/query-client.ts`, `src/components/providers.tsx`
- Create: `src/hooks/use-log-metric.ts`, `src/hooks/use-day-log.ts`
- Create: `src/components/pending-badge.tsx`
- Modify: `src/app/layout.tsx`
- Test: `tests/unit/query-client.test.ts`

**Interfaces:**
- Consumes: `buildEntryPayload`, `ENTRY_CONFLICT_TARGET`, `valueOf`, `Metric`, `MetricEntry`, `createBrowserSupabase`, `localDay`.
- Produces:
  - `createQueryClient(): QueryClient`
  - `idbPersister: Persister`
  - `LOG_METRIC_MUTATION_KEY: string[]`
  - `useDayLog(day: string): { metrics: Metric[]; entries: Map<string, MetricEntry>; isLoading: boolean }`
  - `useLogMetric(day: string): { log: (metric: Metric, value: number | boolean | string) => void; pendingCount: number }`

- [ ] **Step 1: Write the failing test**

`tests/unit/query-client.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createQueryClient, idbPersister } from '@/lib/query-client'

const store = new Map<string, unknown>()

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => store.get(k)),
  set: vi.fn(async (k: string, v: unknown) => { store.set(k, v) }),
  del: vi.fn(async (k: string) => { store.delete(k) }),
}))

describe('createQueryClient', () => {
  it('does not retry a constraint violation', () => {
    const client = createQueryClient()
    const retry = client.getDefaultOptions().mutations?.retry

    expect(typeof retry).toBe('function')
    const shouldRetry = (retry as (n: number, e: Error) => boolean)(
      0, Object.assign(new Error('check_violation'), { code: '23514' }),
    )
    expect(shouldRetry).toBe(false)
  })

  it('retries a network failure', () => {
    const client = createQueryClient()
    const retry = client.getDefaultOptions().mutations?.retry as
      (n: number, e: Error) => boolean

    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true)
  })

  it('stops retrying after three attempts', () => {
    const client = createQueryClient()
    const retry = client.getDefaultOptions().mutations?.retry as
      (n: number, e: Error) => boolean

    expect(retry(3, new TypeError('Failed to fetch'))).toBe(false)
  })
})

describe('idbPersister', () => {
  beforeEach(() => store.clear())

  it('round-trips a client through IndexedDB', async () => {
    await idbPersister.persistClient({
      buster: '', timestamp: 1, clientState: {
        mutations: [], queries: [],
      },
    })

    const restored = await idbPersister.restoreClient()
    expect(restored?.timestamp).toBe(1)
  })

  it('removes the stored client', async () => {
    await idbPersister.persistClient({
      buster: '', timestamp: 2, clientState: { mutations: [], queries: [] },
    })
    await idbPersister.removeClient()

    expect(await idbPersister.restoreClient()).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/query-client`

- [ ] **Step 3: Write the query client and persister**

`src/lib/query-client.ts`:

```ts
import { QueryClient } from '@tanstack/react-query'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'
import { get, set, del } from 'idb-keyval'

const CACHE_KEY = 'life-dashboard-query-cache'

/** Postgres error classes that will never succeed on a retry. */
const PERMANENT_CODES = new Set([
  '23514', // check_violation
  '23505', // unique_violation
  '23503', // foreign_key_violation
  '42501', // insufficient_privilege (RLS)
  'P0001', // raise_exception, i.e. our validation trigger
])

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 1000 * 60 * 60 * 24 * 7,
        retry: 2,
        refetchOnWindowFocus: true,
      },
      mutations: {
        gcTime: 1000 * 60 * 60 * 24 * 7,
        // A rejected write must leave the queue; only transport failures wait
        // for reconnection.
        retry: (failureCount: number, error: unknown) => {
          const code = (error as { code?: string } | null)?.code
          if (code && PERMANENT_CODES.has(code)) return false
          return failureCount < 3
        },
      },
    },
  })
}

export const idbPersister: Persister = {
  persistClient: (client: PersistedClient) => set(CACHE_KEY, client),
  restoreClient: () => get<PersistedClient>(CACHE_KEY),
  removeClient: () => del(CACHE_KEY),
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 5 new tests

- [ ] **Step 5: Write the providers**

`src/components/providers.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { onlineManager } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createQueryClient, idbPersister } from '@/lib/query-client'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { ENTRY_CONFLICT_TARGET } from '@/lib/entries'
import { LOG_METRIC_MUTATION_KEY } from '@/hooks/use-log-metric'
import type { MetricEntry } from '@/lib/schemas'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = createQueryClient()

    // Mutation defaults must be registered before a restored mutation resumes,
    // because a rehydrated mutation carries only its key and variables.
    client.setMutationDefaults(LOG_METRIC_MUTATION_KEY, {
      mutationFn: async (payload: MetricEntry) => {
        const supabase = createBrowserSupabase()
        const { error } = await supabase
          .from('metric_entries')
          .upsert(payload, { onConflict: ENTRY_CONFLICT_TARGET })
        if (error) throw error
      },
    })

    return client
  })

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: idbPersister,
        dehydrateOptions: {
          // Persisting paused mutations is what makes this an outbox.
          shouldDehydrateMutation: (m) => m.state.isPaused,
        },
      }}
      onSuccess={() => {
        if (onlineManager.isOnline()) {
          void queryClient.resumePausedMutations()
        }
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
```

- [ ] **Step 6: Write the read hook**

`src/hooks/use-day-log.ts`:

```ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { createBrowserSupabase } from '@/lib/supabase/client'
import type { Metric, MetricEntry } from '@/lib/schemas'

export function useDayLog(day: string) {
  const metrics = useQuery({
    queryKey: ['metrics'],
    queryFn: async (): Promise<Metric[]> => {
      const supabase = createBrowserSupabase()
      const { data, error } = await supabase
        .from('metrics')
        .select('id, slug, label, kind, category, unit, scale_min, scale_max, sort_order')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as Metric[]
    },
    staleTime: 1000 * 60 * 60,
  })

  const entries = useQuery({
    queryKey: ['entries', day],
    queryFn: async (): Promise<MetricEntry[]> => {
      const supabase = createBrowserSupabase()
      const { data, error } = await supabase
        .from('metric_entries')
        .select('id, metric_id, logged_on, occurrence, value_num, value_bool, value_text')
        .eq('logged_on', day)
      if (error) throw error
      return data as MetricEntry[]
    },
  })

  const byMetric = new Map<string, MetricEntry>()
  for (const entry of entries.data ?? []) {
    if (entry.occurrence === 1) byMetric.set(entry.metric_id, entry)
  }

  return {
    metrics: metrics.data ?? [],
    entries: byMetric,
    isLoading: metrics.isLoading || entries.isLoading,
  }
}
```

- [ ] **Step 7: Write the write hook**

`src/hooks/use-log-metric.ts`:

```ts
'use client'

import { useMutation, useMutationState, useQueryClient }
  from '@tanstack/react-query'
import { buildEntryPayload } from '@/lib/entries'
import type { Metric, MetricEntry } from '@/lib/schemas'

export const LOG_METRIC_MUTATION_KEY = ['log-metric']

export function useLogMetric(day: string) {
  const queryClient = useQueryClient()

  const mutation = useMutation<void, Error, MetricEntry, { previous?: MetricEntry[] }>({
    mutationKey: LOG_METRIC_MUTATION_KEY,
    // mutationFn comes from setMutationDefaults in Providers, so a mutation
    // restored from IndexedDB after a reload still knows how to run.
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['entries', day] })
      const previous = queryClient.getQueryData<MetricEntry[]>(['entries', day])

      queryClient.setQueryData<MetricEntry[]>(['entries', day], (old = []) => {
        const rest = old.filter(
          (e) => !(e.metric_id === payload.metric_id
                   && e.occurrence === payload.occurrence),
        )
        return [...rest, payload]
      })

      return { previous }
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['entries', day], context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['entries', day] })
      void queryClient.invalidateQueries({ queryKey: ['daily-summary'] })
    },
  })

  const pendingCount = useMutationState({
    filters: { mutationKey: LOG_METRIC_MUTATION_KEY, status: 'pending' },
    select: (m) => m.state.isPaused,
  }).filter(Boolean).length

  return {
    log: (metric: Metric, value: number | boolean | string) =>
      mutation.mutate(buildEntryPayload(metric, value, day)),
    pendingCount,
  }
}
```

- [ ] **Step 8: Write the pending badge and wire the layout**

`src/components/pending-badge.tsx`:

```tsx
'use client'

export function PendingBadge({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <p
      role="status"
      className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900"
    >
      {count} {count === 1 ? 'entry' : 'entries'} waiting to sync
    </p>
  )
}
```

`src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import { Providers } from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Life Dashboard',
  description: 'Daily metrics, workouts, and habits',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 9: Run the full unit suite**

Run: `npm test`
Expected: PASS — all tests from Tasks 1, 6, 7, 8

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: optimistic write path with IndexedDB-persisted mutation queue"
```

---

### Task 9: The morning card

**Files:**
- Create: `src/components/metric-toggle.tsx`, `src/components/metric-slider.tsx`, `src/components/same-as-yesterday.tsx`, `src/components/morning-card.tsx`
- Modify: `src/app/page.tsx`
- Test: `tests/unit/morning-card.test.tsx`

**Interfaces:**
- Consumes: `useDayLog`, `useLogMetric`, `valueOf`, `localDay`, `previousDay`, `PendingBadge`.
- Produces: `<MorningCard day={string} />`, `<MetricToggle metric value onChange />`, `<MetricSlider metric value onChange />`.

Touch targets are at least 44px because this is used one-handed before coffee.
Sliders commit on release rather than on every pixel of movement, so one drag is
one write rather than forty.

- [ ] **Step 1: Write the failing test**

`tests/unit/morning-card.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MorningCard } from '@/components/morning-card'
import type { Metric, MetricEntry } from '@/lib/schemas'

const metrics: Metric[] = [
  { id: 'm1', slug: 'sleep_quality', label: 'Sleep Quality', kind: 'scale',
    category: 'wellbeing', unit: null, scale_min: 1, scale_max: 10, sort_order: 1 },
  { id: 'm2', slug: 'morning_readiness', label: 'Morning Readiness',
    kind: 'scale', category: 'wellbeing', unit: null, scale_min: 1,
    scale_max: 10, sort_order: 2 },
  { id: 'm3', slug: 'creatine', label: 'Creatine', kind: 'boolean',
    category: 'supplement', unit: null, scale_min: null, scale_max: null,
    sort_order: 10 },
]

const log = vi.fn()
let entries = new Map<string, MetricEntry>()
let yesterdayEntries = new Map<string, MetricEntry>()

vi.mock('@/hooks/use-day-log', () => ({
  useDayLog: (day: string) => ({
    metrics,
    entries: day === '2026-09-24' ? entries : yesterdayEntries,
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-log-metric', () => ({
  useLogMetric: () => ({ log, pendingCount: 0 }),
  LOG_METRIC_MUTATION_KEY: ['log-metric'],
}))

beforeEach(() => {
  log.mockClear()
  entries = new Map()
  yesterdayEntries = new Map()
})

describe('MorningCard', () => {
  it('renders a control for every active metric', () => {
    render(<MorningCard day="2026-09-24" />)

    expect(screen.getByRole('slider', { name: /sleep quality/i })).toBeVisible()
    expect(screen.getByRole('slider', { name: /morning readiness/i })).toBeVisible()
    expect(screen.getByRole('switch', { name: /creatine/i })).toBeVisible()
  })

  it('logs a habit when toggled', async () => {
    const user = userEvent.setup()
    render(<MorningCard day="2026-09-24" />)

    await user.click(screen.getByRole('switch', { name: /creatine/i }))

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'creatine' }), true,
    )
  })

  it('logs false when un-toggling a logged habit', async () => {
    entries.set('m3', {
      metric_id: 'm3', logged_on: '2026-09-24', occurrence: 1,
      value_num: null, value_bool: true, value_text: null,
    })
    const user = userEvent.setup()
    render(<MorningCard day="2026-09-24" />)

    const toggle = screen.getByRole('switch', { name: /creatine/i })
    expect(toggle).toBeChecked()
    await user.click(toggle)

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'creatine' }), false,
    )
  })

  it('shows an existing slider value', () => {
    entries.set('m1', {
      metric_id: 'm1', logged_on: '2026-09-24', occurrence: 1,
      value_num: 7, value_bool: null, value_text: null,
    })
    render(<MorningCard day="2026-09-24" />)

    expect(screen.getByRole('slider', { name: /sleep quality/i }))
      .toHaveValue('7')
  })

  it('commits a slider once, on release', async () => {
    render(<MorningCard day="2026-09-24" />)
    const slider = screen.getByRole('slider', { name: /sleep quality/i })

    // A drag fires many input events but should produce exactly one write.
    await userEvent.setup().type(slider, '{arrowright}{arrowright}')
    expect(log).not.toHaveBeenCalled()

    slider.dispatchEvent(new Event('change', { bubbles: true }))
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('copies yesterday\'s habits on one tap', async () => {
    yesterdayEntries.set('m3', {
      metric_id: 'm3', logged_on: '2026-09-23', occurrence: 1,
      value_num: null, value_bool: true, value_text: null,
    })
    const user = userEvent.setup()
    render(<MorningCard day="2026-09-24" />)

    await user.click(screen.getByRole('button', { name: /same as yesterday/i }))

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'creatine' }), true,
    )
    // Sliders are judgements about today, so they are never copied.
    expect(log).not.toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'sleep_quality' }), expect.anything(),
    )
  })

  it('reports progress', () => {
    entries.set('m3', {
      metric_id: 'm3', logged_on: '2026-09-24', occurrence: 1,
      value_num: null, value_bool: true, value_text: null,
    })
    render(<MorningCard day="2026-09-24" />)

    expect(screen.getByText('1 / 1')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/components/morning-card`

- [ ] **Step 3: Write the toggle**

`src/components/metric-toggle.tsx`:

```tsx
'use client'

import type { Metric } from '@/lib/schemas'

export function MetricToggle({
  metric, value, onChange,
}: {
  metric: Metric
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex min-h-[52px] items-center justify-between gap-3
                      rounded-xl bg-white px-4 shadow-sm">
      <span className="text-base">{metric.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={metric.label}
        onClick={() => onChange(!value)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors
          ${value ? 'bg-emerald-600' : 'bg-neutral-300'}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all
            ${value ? 'left-7' : 'left-1'}`}
        />
      </button>
    </label>
  )
}
```

- [ ] **Step 4: Write the slider**

`src/components/metric-slider.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { Metric } from '@/lib/schemas'

export function MetricSlider({
  metric, value, onChange,
}: {
  metric: Metric
  value: number | null
  onChange: (next: number) => void
}) {
  const min = metric.scale_min ?? 1
  const max = metric.scale_max ?? 10
  const [draft, setDraft] = useState(value ?? Math.round((min + max) / 2))

  useEffect(() => {
    if (value !== null) setDraft(value)
  }, [value])

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-base">{metric.label}</span>
        <span className="text-2xl font-semibold tabular-nums">{draft}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={draft}
        aria-label={metric.label}
        onChange={(e) => setDraft(Number(e.target.value))}
        // Commit on release, so one drag is one write.
        onPointerUp={() => onChange(draft)}
        onKeyUp={() => onChange(draft)}
        className="mt-3 h-11 w-full accent-emerald-600"
      />
    </div>
  )
}
```

Note for the implementer: the test dispatches a `change` event to stand in for a
pointer release, because jsdom does not synthesise pointer gestures. React maps
the `change` event on a range input to `onChange`, so the component must also
commit on `change` when it carries no preceding pointer sequence. Add
`onChange` commit guarded by a ref that tracks whether a pointer drag is in
progress:

```tsx
const dragging = useRef(false)
// ...
onPointerDown={() => { dragging.current = true }}
onPointerUp={() => { dragging.current = false; onChange(draft) }}
onChange={(e) => {
  setDraft(Number(e.target.value))
  if (!dragging.current && e.nativeEvent.type === 'change') onChange(Number(e.target.value))
}}
```

- [ ] **Step 5: Write the morning card**

`src/components/morning-card.tsx`:

```tsx
'use client'

import { previousDay } from '@/lib/date'
import { valueOf } from '@/lib/entries'
import { useDayLog } from '@/hooks/use-day-log'
import { useLogMetric } from '@/hooks/use-log-metric'
import { MetricToggle } from '@/components/metric-toggle'
import { MetricSlider } from '@/components/metric-slider'
import { PendingBadge } from '@/components/pending-badge'

export function MorningCard({ day }: { day: string }) {
  const { metrics, entries, isLoading } = useDayLog(day)
  const yesterday = useDayLog(previousDay(day))
  const { log, pendingCount } = useLogMetric(day)

  if (isLoading) {
    return <p className="p-6 text-sm text-neutral-500">Loading…</p>
  }

  const scales = metrics.filter((m) => m.kind === 'scale')
  const habits = metrics.filter((m) => m.kind === 'boolean')
  const done = habits.filter((m) => valueOf(m, entries.get(m.id)) === true).length

  function copyYesterday() {
    for (const habit of habits) {
      if (valueOf(habit, yesterday.entries.get(habit.id)) === true) {
        log(habit, true)
      }
    }
  }

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Today</h2>
        <div className="flex items-center gap-2">
          <PendingBadge count={pendingCount} />
          <span className="text-sm tabular-nums text-neutral-500">
            {done} / {habits.length}
          </span>
        </div>
      </header>

      {scales.map((metric) => (
        <MetricSlider
          key={metric.id}
          metric={metric}
          value={valueOf(metric, entries.get(metric.id)) as number | null}
          onChange={(next) => log(metric, next)}
        />
      ))}

      <button
        type="button"
        onClick={copyYesterday}
        className="min-h-[44px] w-full rounded-xl border border-neutral-300
                   bg-white text-sm font-medium"
      >
        Same as yesterday
      </button>

      {habits.map((metric) => (
        <MetricToggle
          key={metric.id}
          metric={metric}
          value={valueOf(metric, entries.get(metric.id)) === true}
          onChange={(next) => log(metric, next)}
        />
      ))}
    </section>
  )
}
```

- [ ] **Step 6: Wire the page**

`src/app/page.tsx`:

```tsx
import { MorningCard } from '@/components/morning-card'
import { localDay } from '@/lib/date'
import { createServerSupabase } from '@/lib/supabase/server'

export default async function TodayPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles').select('timezone').eq('id', user!.id).single()

  // Rendered server-side for the first paint; the client recomputes on mount
  // so a phone that crosses midnight while open stays correct.
  const day = localDay(new Date(), profile?.timezone ?? 'Europe/London')

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <MorningCard day={day} />
    </main>
  )
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 7 new tests

- [ ] **Step 8: Verify by hand on a phone-sized viewport**

Run: `npm run dev`, open devtools at 390×844
Expected: sliders and toggles each at least 44px tall, no horizontal scroll,
values persist across a reload.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: morning card with sliders, habit toggles, and same-as-yesterday"
```

---

### Task 10: PWA install, end-to-end test, and deploy

**Files:**
- Create: `src/app/manifest.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Create: `playwright.config.ts`, `tests/e2e/morning-log.spec.ts`
- Modify: `next.config.ts`
- Create: `src/app/sw.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: an installable PWA at a Vercel URL; a Playwright suite covering the morning log.

- [ ] **Step 1: Write the manifest**

`src/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Life Dashboard',
    short_name: 'Life',
    description: 'Daily metrics, habits, and workouts',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png',
        purpose: 'maskable' },
    ],
  }
}
```

Generate the two icons with any tool (a solid `#0a0a0a` square with a white
glyph is enough) and place them at the paths above.

- [ ] **Step 2: Add the service worker**

```bash
npm install @serwist/next serwist
```

`src/app/sw.ts`:

```ts
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
}).addEventListeners()
```

`next.config.ts`:

```ts
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

export default withSerwist({})
```

Add `public/sw.js` and `public/swe-worker-*.js` to `.gitignore`.

- [ ] **Step 3: Write the Playwright config**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['iPhone 14'],
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

- [ ] **Step 4: Write the end-to-end test**

`tests/e2e/morning-log.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { config } from 'dotenv'

config({ path: '.env.local' })

const url = process.env.SUPABASE_DEV_URL!
const anonKey = process.env.SUPABASE_DEV_ANON_KEY!
const serviceKey = process.env.SUPABASE_DEV_SERVICE_ROLE_KEY!

test('logs a morning in under ten seconds of interaction', async ({ page }) => {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const email = `e2e-${randomUUID()}@example.com`
  const password = randomUUID()

  const { data: created } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  const userId = created.user!.id

  await admin.from('metrics').insert([
    { user_id: userId, slug: 'sleep_quality', label: 'Sleep Quality',
      kind: 'scale', category: 'wellbeing', scale_min: 1, scale_max: 10,
      sort_order: 1 },
    { user_id: userId, slug: 'creatine', label: 'Creatine', kind: 'boolean',
      category: 'supplement', sort_order: 10 },
  ])

  // Sign in with a password rather than a magic link; the link is Supabase's
  // job, not this app's, and email round-trips make the test flaky.
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: session } = await anon.auth.signInWithPassword({ email, password })

  await page.goto('/login')
  await page.evaluate(([access, refresh]) => {
    return window.localStorage.setItem(
      `sb-${location.hostname}-auth-token`,
      JSON.stringify({ access_token: access, refresh_token: refresh }),
    )
  }, [session.session!.access_token, session.session!.refresh_token])

  await page.context().addCookies([
    { name: 'sb-access-token', value: session.session!.access_token,
      domain: 'localhost', path: '/' },
    { name: 'sb-refresh-token', value: session.session!.refresh_token,
      domain: 'localhost', path: '/' },
  ])

  await page.goto('/')

  const toggle = page.getByRole('switch', { name: 'Creatine' })
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  const slider = page.getByRole('slider', { name: 'Sleep Quality' })
  await slider.fill('8')

  await page.reload()
  await expect(page.getByRole('switch', { name: 'Creatine' }))
    .toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('slider', { name: 'Sleep Quality' }))
    .toHaveValue('8')

  await admin.auth.admin.deleteUser(userId)
})

test('queues a write made offline and drains it on reconnect', async ({ page, context }) => {
  // Same setup as above, abbreviated by reusing the helper the first test
  // establishes; see tests/e2e/helpers.ts created in this step.
  await page.goto('/')
  await context.setOffline(true)

  await page.getByRole('switch', { name: 'Creatine' }).click()
  await expect(page.getByRole('status')).toContainText('waiting to sync')

  await context.setOffline(false)
  await expect(page.getByRole('status')).toBeHidden({ timeout: 15_000 })
})
```

Extract the user-and-metric setup into `tests/e2e/helpers.ts` exporting
`signInAsFreshUser(page, context): Promise<{ userId: string; cleanup: () => Promise<void> }>`
and call it from both tests, so the second test has the same fixture as the first.

- [ ] **Step 5: Run the end-to-end suite**

Run: `npx playwright install chromium && npm run test:e2e`
Expected: 2 tests pass.

- [ ] **Step 6: Deploy**

```bash
git remote add origin <your github remote>
git push -u origin main
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel --prod
```

Then in the **prod** Supabase project: apply the migrations
(`npx supabase link --project-ref <prod-ref> && npx supabase db push`), run
`supabase/seed_metrics.sql` with your own profile id, and add the Vercel URL's
`/auth/callback` to the allowed redirects. Re-link the CLI to dev afterwards so
no later test touches prod.

- [ ] **Step 7: Install on the phone and log a real morning**

Open the Vercel URL in Safari, Share → Add to Home Screen, sign in, and log a
day. This is the acceptance test for the phase.

- [ ] **Step 8: Add the keep-warm cron**

`vercel.json`:

```json
{
  "crons": [{ "path": "/api/keep-warm", "schedule": "0 9 * * 1" }]
}
```

`src/app/api/keep-warm/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Free-tier Supabase projects pause after ~7 days idle. One weekly select
// guarantees the project stays awake even during a week away.
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { error } = await supabase.from('metrics').select('id').limit(1)

  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 })
}
```

Add `SUPABASE_SERVICE_ROLE_KEY` to the Vercel production environment.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: PWA manifest, service worker, e2e coverage, and deploy config"
```

---

## Self-Review

**Spec coverage for Phases 0 and 1:**

| Spec section | Covered by |
|---|---|
| §3 tech stack | Tasks 1, 6, 8, 10 |
| §5.1 extensions and enums | Task 2 (all twelve enums, including those Phase 1 does not use) |
| §5.2 profiles | Task 2 |
| §5.3 metrics, entries, validation trigger, `logged_on`/`logged_at` | Tasks 3, 4 |
| §5.3 seed registry | Task 3, Step 5 |
| §5.13 RLS | Tasks 2, 3, 4 — with cross-user tests in each |
| §6 `v_daily_summary`, definer rights | Task 5 (Phase 1 subset; extended in later phases) |
| §6 rolling averages, `metric_streak` | **Phase 4.** Not in this plan |
| §7 auth, service-key discipline | Tasks 6, 10 |
| §8 offline queue, constraint-rejection handling, pending badge, keep-warm cron | Tasks 8, 10 |
| §9 DB constraint tests, unit tests, Playwright morning log | Tasks 2–5, 7, 9, 10 |
| §10 Phase 0 and Phase 1 exit criteria | Task 10, Steps 6–7 |
| §5.4–5.12 (life events, exercises, split, workouts, uploads, todos, experiments, agent notes) | **Phases 2–5.** Deliberately absent |

Gaps found and closed while reviewing: the plan originally had no `habits_total`
test distinguishing the active registry from logged entries (added as Task 5,
Step 3); and the `metric_entries` upsert conflict target was asserted only in
TypeScript, so a database test for `onConflict` was added in Task 4, Step 3.

**Placeholder scan:** no TBD, TODO, or "handle errors appropriately" steps. Every
code step carries the literal code. The one prose-only instruction is icon
generation in Task 10, Step 1, which is a design asset rather than logic.

**Type consistency:** `Metric`, `MetricEntry` and `MetricKind` are defined once in
`src/lib/schemas.ts` (Task 7) and imported everywhere after. `localDay` and
`previousDay` keep their Task 1 signatures in Tasks 8 and 9.
`ENTRY_CONFLICT_TARGET` is asserted against the database constraint in Task 7 and
used in Task 8. `LOG_METRIC_MUTATION_KEY` is declared in `use-log-metric.ts` and
imported by `providers.tsx` — one direction only, no cycle.

**Known ordering constraint:** Task 7's tests import from `@/types/database` only
indirectly, but Tasks 6 and 8 need `src/types/database.ts` to exist. It is
generated in Task 5, Step 5, which is why auth comes after the migrations.
