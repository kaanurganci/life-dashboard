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
