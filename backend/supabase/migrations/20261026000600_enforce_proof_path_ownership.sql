create unique index if not exists scheduled_workouts_proof_path_unique_idx
  on public.scheduled_workouts(proof_screenshot_path)
  where proof_screenshot_path is not null;

create or replace function public.enforce_proof_path_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_role text := coalesce(auth.role(), '');
begin
  if v_request_role = 'service_role' then
    return new;
  end if;

  if new.proof_screenshot_path is not null
     and new.proof_screenshot_path is distinct from old.proof_screenshot_path then
    if split_part(new.proof_screenshot_path, '/', 2) not like new.id::text || '-%' then
      raise exception 'Proof screenshot must belong to this workout';
    end if;
    if exists (
      select 1
      from public.scheduled_workouts w
      where w.proof_screenshot_path = new.proof_screenshot_path
        and w.id <> new.id
    ) then
      raise exception 'Proof screenshot has already been used';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists scheduled_workouts_enforce_proof_path on public.scheduled_workouts;
create trigger scheduled_workouts_enforce_proof_path
before update on public.scheduled_workouts
for each row execute function public.enforce_proof_path_ownership();
