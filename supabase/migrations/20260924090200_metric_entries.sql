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
declare
  m public.metrics;
  value_count int;
begin
  select * into m from public.metrics where id = new.metric_id;
  if not found then
    raise exception 'metric % does not exist', new.metric_id;
  end if;
  if m.user_id <> new.user_id then
    raise exception 'metric % does not belong to user %',
      new.metric_id, new.user_id;
  end if;

  value_count := (new.value_num is not null)::int
    + (new.value_bool is not null)::int
    + (new.value_text is not null)::int;

  -- Only run kind-specific validation once exactly one value column is
  -- populated. Zero or multiple values is the exactly_one_value CHECK's
  -- job to reject (with its own 23514 code); if this BEFORE trigger raised
  -- first for those cases, the constraint would never get a chance to run
  -- and callers would see a generic trigger error instead of 23514.
  if value_count = 1 then
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
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger metric_entries_validate
  before insert or update on public.metric_entries
  for each row execute function public.validate_metric_entry();

alter table public.metric_entries enable row level security;

create policy owner_all on public.metric_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- PostgREST connects as `anon` or `authenticated`; the admin API connects as
-- `service_role`. RLS filters ROWS, GRANT controls TABLE access, and both are
-- required: without these, every request fails 42501 before any policy is read.
grant select, insert, update, delete on public.metric_entries to authenticated;
grant all on public.metric_entries to service_role;
-- anon deliberately receives nothing: an unauthenticated caller has no rows here.
