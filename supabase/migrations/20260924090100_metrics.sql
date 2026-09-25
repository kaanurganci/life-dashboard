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

-- PostgREST connects as `anon` or `authenticated`; the admin API connects as
-- `service_role`. RLS filters ROWS, GRANT controls TABLE access, and both are
-- required: without these, every request fails 42501 before any policy is read.
grant select, insert, update, delete on public.metrics to authenticated;
grant all on public.metrics to service_role;
-- anon deliberately receives nothing: an unauthenticated caller has no rows here.
