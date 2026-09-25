-- Fix: validate_metric_entry's kind-specific check ran as a BEFORE trigger
-- ahead of the exactly_one_value CHECK constraint, so an entry with zero
-- (or multiple) value columns populated raised the trigger's own generic
-- exception instead of letting the exactly_one_value CHECK report its
-- dedicated 23514 violation. Kind-specific validation now only runs once
-- exactly one value column is populated; zero/multiple values fall through
-- to the CHECK constraint as originally intended.
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
