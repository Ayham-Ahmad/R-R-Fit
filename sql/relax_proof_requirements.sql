-- Relax workout proof requirements.
--
-- Trainees now submit only an uploaded screenshot as proof, plus an optional
-- comment. The comment is stored in proof_summary_en. Weights, RPE, and the
-- Arabic summary are no longer required (or collected from the trainee).
--
-- Run this in the Supabase SQL editor after deploying the frontend change.

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

  if new.proof_screenshot_path is not null
     and new.proof_screenshot_path is distinct from old.proof_screenshot_path then
    if split_part(new.proof_screenshot_path, '/', 1) <> new.trainee_id::text then
      raise exception 'Proof screenshot must belong to this trainee';
    end if;
    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'workout-proofs'
        and o.name = new.proof_screenshot_path
    ) then
      raise exception 'Proof screenshot was not uploaded';
    end if;
  end if;

  if v_role <> 'admin' and old.status <> 'pending' then
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
       or new.notes_ar is distinct from old.notes_ar
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
    if new.proof_screenshot_path is null then
      raise exception 'Proof screenshot is required';
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

commit;
