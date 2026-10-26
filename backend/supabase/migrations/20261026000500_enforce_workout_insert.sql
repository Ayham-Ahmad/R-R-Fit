begin;

create or replace function public.enforce_workout_insert_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_request_role text := coalesce(auth.role(), '');
begin
  if v_request_role = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if v_role not in ('coach', 'admin') then
    raise exception 'Only a coach or admin can schedule workouts';
  end if;

  if new.status <> 'pending'
     or new.verification_status <> 'none'
     or new.completed_at is not null
     or new.proof_screenshot_path is not null
     or new.proof_weights is not null
     or new.proof_rpe is not null
     or new.proof_summary_en is not null
     or new.proof_summary_ar is not null
     or new.verification_note is not null
     or new.verified_by is not null
     or new.verified_at is not null then
    raise exception 'New workouts must be scheduled as pending';
  end if;

  return new;
end;
$$;

drop trigger if exists scheduled_workouts_enforce_insert on public.scheduled_workouts;
create trigger scheduled_workouts_enforce_insert
before insert on public.scheduled_workouts
for each row execute function public.enforce_workout_insert_rules();

commit;
