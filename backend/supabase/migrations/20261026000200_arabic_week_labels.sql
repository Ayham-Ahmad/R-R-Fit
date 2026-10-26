begin;

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

    if v_winner.trainee_id is not null and coalesce(v_winner.completed_count, 0) > 0 then
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

    select w.ends_on + 1
    into v_start
    from public.leaderboard_weeks w
    where w.id = v_old_week;

    update public.leaderboard_weeks
    set is_live = false, is_published = true
    where id = v_old_week;
  end if;

  v_start := coalesce(v_start, date_trunc('week', current_date)::date);
  v_end := v_start + 6;

  v_label_en := coalesce(
    nullif(p_label_en, ''),
    to_char(v_start, 'FMMonth DD') || ' – ' || to_char(v_end, 'FMMonth DD') || ' (Current Week)'
  );
  v_label_ar := coalesce(
    nullif(p_label_ar, ''),
    'الأسبوع الحالي ' || to_char(v_start, 'DD/MM/YYYY') || ' – ' || to_char(v_end, 'DD/MM/YYYY')
  );
  v_short_en := coalesce(nullif(p_short_en, ''), to_char(v_start, 'Mon DD') || ' – ' || to_char(v_end, 'Mon DD'));
  v_short_ar := coalesce(
    nullif(p_short_ar, ''),
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

revoke all on function public.start_new_leaderboard_week(text, text, text, text) from public;
grant execute on function public.start_new_leaderboard_week(text, text, text, text) to authenticated;

commit;
