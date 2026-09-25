-- PostgREST connects as `anon` or `authenticated`; the admin API connects as
-- `service_role`. RLS filters ROWS, GRANT controls TABLE access, and both are
-- required: without these, every request fails 42501 before any policy is read.
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
-- anon deliberately receives nothing: an unauthenticated caller has no rows here.
