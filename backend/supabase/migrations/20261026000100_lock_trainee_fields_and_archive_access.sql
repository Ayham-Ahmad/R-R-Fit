begin;

create or replace function public.enforce_workout_proof_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_request_role text := coalesce(auth.role(), '');
begin
  if v_request_role = 'service_role' then
    return new;
  end if;

  if v_role <> 'admin' and old.status <> 'pending' then
    if new.trainee_id is distinct from old.trainee_id
       or new.exercise_id is distinct from old.exercise_id
       or new.week_id is distinct from old.week_id
       or new.scheduled_date is distinct from old.scheduled_date
       or new.day_key is distinct from old.day_key
       or new.sets is distinct from old.sets
       or new.status is distinct from old.status
       or new.proof_weights is distinct from old.proof_weights
       or new.proof_rpe is distinct from old.proof_rpe
       or new.proof_summary_en is distinct from old.proof_summary_en
       or new.proof_summary_ar is distinct from old.proof_summary_ar
       or new.proof_screenshot_path is distinct from old.proof_screenshot_path
       or new.completed_at is distinct from old.completed_at then
      raise exception 'Finalized workout results are locked';
    end if;
  end if;

  if v_role in ('coach', 'admin') then
    if new.verification_status in ('verified', 'rejected') then
      if old.status <> 'completed' or old.proof_screenshot_path is null then
        raise exception 'Only submitted workout proof can be verified or rejected';
      end if;
      new.verified_by = coalesce(auth.uid(), new.verified_by);
      new.verified_at = coalesce(new.verified_at, now());
    else
      new.verified_by = null;
      new.verified_at = null;
    end if;
    return new;
  end if;

  if auth.uid() is null or new.trainee_id is distinct from auth.uid() then
    raise exception 'A trainee can only submit proof for her own scheduled workouts';
  end if;

  if new.trainee_id is distinct from old.trainee_id
     or new.exercise_id is distinct from old.exercise_id
     or new.week_id is distinct from old.week_id
     or new.scheduled_date is distinct from old.scheduled_date
     or new.day_key is distinct from old.day_key
     or new.sets is distinct from old.sets
     or new.reps_en is distinct from old.reps_en
     or new.reps_ar is distinct from old.reps_ar
     or new.rest_en is distinct from old.rest_en
     or new.rest_ar is distinct from old.rest_ar
     or new.notes_en is distinct from old.notes_en
     or new.notes_ar is distinct from old.notes_ar then
    raise exception 'Workout assignment fields are managed by the coach';
  end if;

  if old.status <> 'pending' then
    raise exception 'Completed or skipped workouts are locked';
  end if;

  if new.verification_status is distinct from old.verification_status
     and new.verification_status in ('verified', 'rejected') then
    raise exception 'Only a coach or admin can verify or reject workout proof';
  end if;

  new.verified_by = null;
  new.verified_at = null;

  if new.status = 'completed' then
    if new.proof_screenshot_path is null
       or length(btrim(coalesce(new.proof_weights, ''))) < 2
       or length(btrim(coalesce(new.proof_summary_en, ''))) < 2
       or new.proof_rpe is null then
      raise exception 'Proof weights, summary, effort, and screenshot are required';
    end if;
    new.verification_status = 'pending_review';
    new.completed_at = coalesce(new.completed_at, now());
  else
    new.verification_status = 'none';
    new.completed_at = null;
    new.proof_screenshot_path = null;
  end if;

  return new;
end;
$$;

drop policy if exists "exercises_read_authenticated" on public.exercises;
create policy "exercises_read_authenticated"
on public.exercises for select
to authenticated
using (
  is_active
  or public.is_coach_or_admin()
  or exists (
    select 1
    from public.scheduled_workouts sw
    where sw.exercise_id = exercises.id
      and sw.trainee_id = auth.uid()
  )
);

commit;
