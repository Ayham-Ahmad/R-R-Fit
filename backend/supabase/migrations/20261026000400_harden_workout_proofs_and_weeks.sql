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

create or replace function public.prevent_finalized_workout_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_role text := coalesce(auth.role(), '');
begin
  if v_request_role = 'service_role'
     or auth.uid() is null
     or public.current_user_role() = 'admin' then
    return old;
  end if;
  if old.status = 'completed' then
    raise exception 'Completed workouts cannot be deleted';
  end if;
  return old;
end;
$$;

create or replace function public.get_weekly_leaderboard(
  p_week_id uuid default null,
  p_limit integer default 100
)
returns table (
  trainee_id uuid,
  name_en text,
  name_ar text,
  goal_en text,
  goal_ar text,
  avatar_style text,
  completed_count integer,
  verified_count integer,
  total_count integer,
  percent integer,
  score integer,
  rank_position integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_week_id uuid;
  v_enabled boolean;
  v_published boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select w.id
  into v_week_id
  from public.leaderboard_weeks w
  where (p_week_id is null and w.is_live = true)
     or (
       w.id = p_week_id
       and (public.is_coach_or_admin() or w.is_live or w.is_published)
     )
  order by w.starts_on desc
  limit 1;

  if v_week_id is null then
    return;
  end if;

  if not public.is_coach_or_admin() then
    select s.leaderboard_enabled, s.leaderboard_published
    into v_enabled, v_published
    from public.platform_settings s
    where s.id = 1;

    if not coalesce(v_enabled, false) or not coalesce(v_published, false) then
      return;
    end if;
  end if;

  return query
  with scores as (
    select
      p.id as athlete_id,
      p.name_en,
      p.name_ar,
      coalesce(p.goal_en, '') as goal_en,
      coalesce(p.goal_ar, '') as goal_ar,
      p.avatar_style,
      count(*) filter (
        where sw.status = 'completed' and sw.verification_status = 'verified'
      )::integer as completed_count,
      count(*) filter (where sw.verification_status = 'verified')::integer as verified_count,
      count(*)::integer as total_count
    from public.profiles p
    join public.scheduled_workouts sw on sw.trainee_id = p.id
    where p.role = 'trainee'
      and sw.week_id = v_week_id
    group by p.id, p.name_en, p.name_ar, p.goal_en, p.goal_ar, p.avatar_style
    having count(*) > 0
  ),
  calculated as (
    select
      s.*,
      case when s.total_count > 0
        then round((s.completed_count::numeric / s.total_count::numeric) * 100)::integer
        else 0
      end as percent_value
    from scores s
  )
  select
    c.athlete_id,
    c.name_en,
    c.name_ar,
    c.goal_en,
    c.goal_ar,
    c.avatar_style,
    c.completed_count,
    c.verified_count,
    c.total_count,
    c.percent_value,
    c.percent_value,
    row_number() over (
      order by c.percent_value desc, c.completed_count desc, c.name_en asc
    )::integer
  from calculated c
  order by c.percent_value desc, c.completed_count desc, c.name_en asc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

commit;
