-- NoorFit Studio - secure database RPC functions
-- Run after schema.sql and rls_policies.sql.
begin;

-- Privacy-safe weekly standings. Never returns email, phone, or storage paths.
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
  where (p_week_id is not null and w.id = p_week_id)
     or (p_week_id is null and w.is_live = true)
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
      count(*) filter (where sw.status = 'completed')::integer as completed_count,
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

revoke all on function public.get_weekly_leaderboard(uuid, integer) from public;
grant execute on function public.get_weekly_leaderboard(uuid, integer) to authenticated;

-- Archive the current live winner, close the week, and start a new live week.
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
  v_start date := date_trunc('week', current_date)::date + 7;
  v_end date := v_start + 6;
  v_label_en text;
  v_label_ar text;
  v_short_en text;
  v_short_ar text;
begin
  if not public.is_coach_or_admin() then
    raise exception 'Only a coach or admin can start a new leaderboard week';
  end if;

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

    if v_winner.trainee_id is not null then
      insert into public.leaderboard_previous_winners (
        week_id, trainee_id, completed, total, percent, score,
        reward_en, reward_ar, week_en, week_ar
      )
      select
        v_old_week, v_winner.trainee_id, v_winner.completed_count, v_winner.total_count,
        v_winner.percent, v_winner.score, v_reward_en, v_reward_ar,
        w.short_en, w.short_ar
      from public.leaderboard_weeks w
      where w.id = v_old_week;
    end if;

    update public.leaderboard_weeks
    set is_live = false, is_published = true
    where id = v_old_week;
  end if;

  v_label_en := coalesce(
    nullif(p_label_en, ''),
    to_char(v_start, 'FMMonth DD') || ' – ' || to_char(v_end, 'FMMonth DD') || ' (Current Week)'
  );
  v_label_ar := coalesce(nullif(p_label_ar, ''), v_label_en);
  v_short_en := coalesce(nullif(p_short_en, ''), to_char(v_start, 'Mon DD') || ' – ' || to_char(v_end, 'Mon DD'));
  v_short_ar := coalesce(nullif(p_short_ar, ''), v_short_en);

  insert into public.leaderboard_weeks (
    label_en, label_ar, short_en, short_ar, starts_on, ends_on, is_live, is_published
  )
  values (
    v_label_en, v_label_ar, v_short_en, v_short_ar, v_start, v_end, true, true
  )
  returning id into v_new_week;

  insert into public.activity_events (coach_id, badge_type, text_en, text_ar)
  values (
    v_coach_id,
    'success',
    'A new weekly leaderboard started. All workout proofs are ready for the new week.',
    'بدأ أسبوع جديد للوحة المتصدرات. جميع إثباتات التمارين جاهزة للأسبوع الجديد.'
  );

  return v_new_week;
end;
$$;

revoke all on function public.start_new_leaderboard_week(text, text, text, text) from public;
grant execute on function public.start_new_leaderboard_week(text, text, text, text) to authenticated;

commit;
