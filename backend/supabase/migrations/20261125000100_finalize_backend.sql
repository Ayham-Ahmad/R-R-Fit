-- R&R Fit - final backend state.
--
-- This migration re-applies the objects that were overwritten by the old
-- base-file apply path and closes the remaining hardening gaps. It is safe to
-- run on databases that have already applied the earlier migrations.

begin;

-- ---------------------------------------------------------------------------
-- Helper functions are policy internals, not public RPCs.
-- ---------------------------------------------------------------------------
revoke all on function public.current_user_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_coach_or_admin() from public;
revoke all on function public.has_plan_access(uuid) from public;
revoke all on function public.can_manage_trainee(uuid) from public;
revoke all on function public.is_proof_path_locked(text) from public;

grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_coach_or_admin() to authenticated, service_role;
grant execute on function public.has_plan_access(uuid) to authenticated, service_role;
grant execute on function public.can_manage_trainee(uuid) to authenticated, service_role;
grant execute on function public.is_proof_path_locked(text) to authenticated, service_role;

-- Keep the plan-access check callable from policies without allowing arbitrary
-- users to probe another profile's subscription state.
create or replace function public.has_plan_access(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return false;
  end if;

  if auth.uid() is null then
    return coalesce(auth.role() = 'service_role', false);
  end if;

  if p_user_id <> auth.uid()
     and not public.is_admin()
     and not public.can_manage_trainee(p_user_id) then
    return false;
  end if;

  return coalesce((
    select subscription_active and plan_unlocked
    from public.profiles
    where id = p_user_id
  ), false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Recurrence days must only contain real day keys.
-- ---------------------------------------------------------------------------
update public.profiles
set recurrence_days = array['mon', 'wed', 'thu', 'sat']::text[]
where recurrence_days is null
   or array_position(recurrence_days, null::text) is not null
   or not (recurrence_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]);

alter table public.profiles
  drop constraint if exists profiles_recurrence_days_valid;
alter table public.profiles
  add constraint profiles_recurrence_days_valid
  check (
    recurrence_days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::text[]
    and array_position(recurrence_days, null::text) is null
  );

-- ---------------------------------------------------------------------------
-- Platform settings: brand and coach assignment stay admin-owned; coaches
-- continue to manage the leaderboard rules they own in the app.
-- ---------------------------------------------------------------------------
create or replace function public.protect_platform_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_role text := coalesce(auth.role(), '');
begin
  if v_request_role = 'service_role' or public.is_admin() then
    return new;
  end if;

  if new.website_name_en is distinct from old.website_name_en
     or new.website_name_ar is distinct from old.website_name_ar
     or new.main_coach_id is distinct from old.main_coach_id then
    raise exception 'Brand and coach assignment fields are managed by the admin';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Final workout proof rules.
--
-- Coach/admin review metadata must be processed before the finalized lock:
-- submitted workouts are already 'completed', so a note written during review
-- would otherwise be rejected as a trainee edit. Trainees remain locked out of
-- verification and retention metadata.
-- ---------------------------------------------------------------------------
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

  if v_role in ('coach', 'admin') then
    if new.verification_status in ('verified', 'rejected') then
      if old.status not in ('pending', 'completed') then
        raise exception 'Only submitted workout proof can be verified or rejected';
      end if;
      new.status = 'completed';
      new.completed_at = coalesce(old.completed_at, new.completed_at, now());
      new.verified_by = coalesce(auth.uid(), new.verified_by);
      new.verified_at = coalesce(new.verified_at, now());
    else
      new.verified_by = null;
      new.verified_at = null;
    end if;
    return new;
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
       or new.proof_channel is distinct from old.proof_channel
       or new.completed_at is distinct from old.completed_at
       or new.verification_status is distinct from old.verification_status
       or new.verification_note is distinct from old.verification_note
       or new.verified_by is distinct from old.verified_by
       or new.verified_at is distinct from old.verified_at
       or new.proof_purged_at is distinct from old.proof_purged_at then
      raise exception 'Finalized workout results are locked';
    end if;
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
     or new.notes_ar is distinct from old.notes_ar
     or new.verification_note is distinct from old.verification_note
     or new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at
     or new.proof_purged_at is distinct from old.proof_purged_at then
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
  new.proof_channel = coalesce(new.proof_channel, 'app');

  if new.status = 'completed' then
    if new.proof_channel = 'app' and new.proof_screenshot_path is null then
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

drop trigger if exists scheduled_workouts_enforce_proof on public.scheduled_workouts;
create trigger scheduled_workouts_enforce_proof
before update on public.scheduled_workouts
for each row execute function public.enforce_workout_proof_rules();

-- ---------------------------------------------------------------------------
-- Proof uploads must follow <trainee>/<workout>-<timestamp>.(webp|jpg).
-- ---------------------------------------------------------------------------
drop policy if exists "workout_proofs_insert_own" on storage.objects;
create policy "workout_proofs_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'workout-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}-[0-9]+[.](webp|jpg)$'
);

-- ---------------------------------------------------------------------------
-- Archive rows expose an explicit verified-workout count. Legacy rows have no
-- stored value, so completed is the best available historical approximation.
-- ---------------------------------------------------------------------------
alter table public.leaderboard_previous_winners
  add column if not exists verified integer not null default 0;

update public.leaderboard_previous_winners
set verified = completed
where verified = 0 and coalesce(completed, 0) > 0;

-- ---------------------------------------------------------------------------
-- Archived winners keep their labels even when the source week is deleted.
-- The return type gains `verified`, so CREATE OR REPLACE is not enough:
-- Postgres cannot change a function's return type in place. Drop it first and
-- re-apply its grants after recreation (see the bottom of this file).
-- ---------------------------------------------------------------------------
drop function if exists public.get_leaderboard_archive();

create or replace function public.get_leaderboard_archive()
returns table (
  week_en text,
  week_ar text,
  trainee_id uuid,
  name_en text,
  name_ar text,
  avatar_style text,
  completed integer,
  verified integer,
  total integer,
  percent integer,
  score integer,
  reward_en text,
  reward_ar text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(w.short_en, lw.week_en) as week_en,
    coalesce(w.short_ar, lw.week_ar) as week_ar,
    lw.trainee_id,
    p.name_en,
    p.name_ar,
    p.avatar_style,
    lw.completed,
    lw.verified,
    lw.total,
    lw.percent,
    lw.score,
    lw.reward_en,
    lw.reward_ar
  from public.leaderboard_previous_winners lw
  left join public.profiles p on p.id = lw.trainee_id
  left join public.leaderboard_weeks w on w.id = lw.week_id
  where auth.uid() is not null
  order by lw.created_at desc
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- Serialize week rollover and keep new weeks from overlapping existing ones.
-- ---------------------------------------------------------------------------
create or replace function public.start_new_leaderboard_week(
  p_label_en text default null,
  p_label_ar text default null,
  p_short_en text default null,
  p_short_ar text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_week uuid;
  v_new_week uuid;
  v_coach_id uuid;
  v_reward_en text;
  v_reward_ar text;
  v_winner record;
  v_start date;
  v_end date;
  v_max_end date;
  v_label_en text;
  v_label_ar text;
  v_short_en text;
  v_short_ar text;
begin
  if not public.is_coach_or_admin() then
    raise exception 'Only a coach or admin can start a new leaderboard week';
  end if;

  if (p_label_en is not null and btrim(p_label_en) = '')
     or (p_label_ar is not null and btrim(p_label_ar) = '')
     or (p_short_en is not null and btrim(p_short_en) = '')
     or (p_short_ar is not null and btrim(p_short_ar) = '') then
    raise exception 'Week labels cannot be blank';
  end if;

  perform pg_advisory_xact_lock(hashtext('rr_leaderboard_week_rollover'));

  select w.id, s.main_coach_id, s.reward_title_en, s.reward_title_ar
  into v_old_week, v_coach_id, v_reward_en, v_reward_ar
  from public.leaderboard_weeks w
  cross join public.platform_settings s
  where w.is_live = true and s.id = 1
  order by w.starts_on desc
  limit 1;

  if v_old_week is not null then
    select *
    into v_winner
    from public.get_weekly_leaderboard(v_old_week, 1)
    limit 1;

    if v_winner.trainee_id is not null and coalesce(v_winner.completed_count, 0) > 0 then
      insert into public.leaderboard_previous_winners (
        week_id, trainee_id, completed, verified, total, percent, score,
        reward_en, reward_ar, week_en, week_ar
      )
      select
        v_old_week, v_winner.trainee_id, v_winner.completed_count, v_winner.verified_count,
        v_winner.total_count, v_winner.percent, v_winner.score, v_reward_en, v_reward_ar,
        w.short_en, w.short_ar
      from public.leaderboard_weeks w
      where w.id = v_old_week;
    end if;

    select w.ends_on + 1
    into v_start
    from public.leaderboard_weeks w
    where w.id = v_old_week;

    update public.leaderboard_weeks
    set is_live = false, is_published = true
    where id = v_old_week;
  end if;

  v_start := coalesce(v_start, date_trunc('week', current_date)::date);

  select max(w.ends_on)
  into v_max_end
  from public.leaderboard_weeks w;

  if v_max_end is not null and v_start <= v_max_end then
    v_start := v_max_end + 1;
  end if;

  v_end := v_start + 6;

  v_label_en := coalesce(
    nullif(btrim(p_label_en), ''),
    to_char(v_start, 'FMMonth DD') || ' – ' || to_char(v_end, 'FMMonth DD') || ' (Current Week)'
  );
  v_label_ar := coalesce(
    nullif(btrim(p_label_ar), ''),
    'الأسبوع الحالي ' || to_char(v_start, 'DD/MM/YYYY') || ' – ' || to_char(v_end, 'DD/MM/YYYY')
  );
  v_short_en := coalesce(nullif(btrim(p_short_en), ''), to_char(v_start, 'Mon DD') || ' – ' || to_char(v_end, 'Mon DD'));
  v_short_ar := coalesce(
    nullif(btrim(p_short_ar), ''),
    to_char(v_start, 'DD/MM') || ' – ' || to_char(v_end, 'DD/MM')
  );

  insert into public.leaderboard_weeks (
    label_en, label_ar, short_en, short_ar, starts_on, ends_on, is_live, is_published
  )
  values (
    v_label_en, v_label_ar, v_short_en, v_short_ar, v_start, v_end, true, true
  )
  returning id into v_new_week;

  if v_old_week is not null then
    insert into public.scheduled_workouts (
      trainee_id, exercise_id, week_id, scheduled_date, day_key,
      sets, reps_en, reps_ar, rest_en, rest_ar, notes_en, notes_ar,
      status, verification_status
    )
    select
      sw.trainee_id,
      sw.exercise_id,
      v_new_week,
      v_start + (array_position(array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], sw.day_key) - 1),
      sw.day_key,
      sw.sets,
      sw.reps_en,
      sw.reps_ar,
      sw.rest_en,
      sw.rest_ar,
      sw.notes_en,
      sw.notes_ar,
      'pending',
      'none'
    from public.scheduled_workouts sw
    join public.profiles p on p.id = sw.trainee_id
    where sw.week_id = v_old_week
      and p.role = 'trainee'
      and p.subscription_active
      and p.plan_unlocked
      and (
        p.recurrence in ('weekly', 'daily')
        or (p.recurrence = 'selected_days' and sw.day_key = any(p.recurrence_days))
      );

    insert into public.trainee_day_settings (trainee_id, week_id, day_key, is_rest_day)
    select ds.trainee_id, v_new_week, ds.day_key, ds.is_rest_day
    from public.trainee_day_settings ds
    join public.profiles p on p.id = ds.trainee_id
    where ds.week_id = v_old_week
      and p.role = 'trainee'
      and p.subscription_active
      and p.plan_unlocked
    on conflict (trainee_id, week_id, day_key) do nothing;
  end if;

  insert into public.activity_events (coach_id, badge_type, text_en, text_ar)
  values (
    v_coach_id,
    'success',
    'A new weekly leaderboard started. The previous schedule was carried forward for active trainees.',
    'بدأ أسبوع جديد للوحة المتصدرات. تم ترحيل الجدول السابق للمتدربات النشطات.'
  );

  return v_new_week;
end;
$$;

revoke all on function public.get_leaderboard_archive() from public;
grant execute on function public.get_leaderboard_archive() to authenticated;

revoke all on function public.start_new_leaderboard_week(text, text, text, text) from public;
grant execute on function public.start_new_leaderboard_week(text, text, text, text) to authenticated;

commit;
