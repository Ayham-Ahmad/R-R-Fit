-- NoorFit Studio - PostgreSQL schema
-- Run this file first in the Supabase SQL editor or through backend/scripts/verify_db.py --apply.
begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (role source of truth)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'trainee' check (role in ('admin', 'coach', 'trainee')),
  name_en text not null default 'New Trainee',
  name_ar text not null default 'متدربة جديدة',
  email text,
  phone text,
  whatsapp_phone text,
  goal_en text default '',
  goal_ar text default '',
  avatar_style text not null default 'sara',
  coach_id uuid references public.profiles(id) on delete set null,
  subscription_active boolean not null default true,
  plan_unlocked boolean not null default true,
  recurrence text not null default 'weekly' check (recurrence in ('weekly', 'selected_days', 'daily')),
  recurrence_days text[] not null default array['mon', 'wed', 'thu', 'sat']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_coach_idx on public.profiles(coach_id);
create unique index if not exists profiles_email_unique_idx on public.profiles(lower(email)) where email is not null;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_coach_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('coach', 'admin') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.has_plan_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select subscription_active and plan_unlocked
    from public.profiles
    where id = p_user_id
  ), false);
$$;

create or replace function public.can_manage_trainee(p_trainee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.role = 'admin'
       or (p.role = 'coach' and (t.coach_id = p.id or t.coach_id is null))
    from public.profiles t
    join public.profiles p on p.id = auth.uid()
    where t.id = p_trainee_id and t.role = 'trainee'
  ), false);
$$;

-- Role and subscription fields may only be changed by privileged users.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text := public.current_user_role();
  v_request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if v_request_role = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() = new.id and new.role <> 'trainee' and v_actor_role not in ('admin', 'coach') then
      raise exception 'Only an admin can assign privileged roles';
    end if;
    return new;
  end if;

  if v_actor_role not in ('coach', 'admin') then
    if new.role is distinct from old.role
       or new.subscription_active is distinct from old.subscription_active
       or new.plan_unlocked is distinct from old.plan_unlocked
       or new.coach_id is distinct from old.coach_id then
      raise exception 'Role and subscription fields are managed by the coach or admin';
    end if;
  elsif v_actor_role <> 'admin' then
    if new.role is distinct from old.role or new.coach_id is distinct from old.coach_id then
      raise exception 'Only an admin can change roles or coach assignments';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_fields on public.profiles;
create trigger profiles_protect_fields
before insert or update on public.profiles
for each row execute function public.protect_profile_fields();

-- New auth users always enter as trainees. Roles are elevated by an admin only.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, name_en, name_ar, email, whatsapp_phone)
  values (
    new.id,
    'trainee',
    coalesce(nullif(new.raw_user_meta_data->>'name_en', ''), 'New Trainee'),
    coalesce(nullif(new.raw_user_meta_data->>'name_ar', ''), 'متدربة جديدة'),
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'whatsapp_phone', ''), null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Platform settings (single row)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_settings (
  id smallint primary key default 1 check (id = 1),
  website_name_en text not null default 'NoorFit Studio',
  website_name_ar text not null default 'نور فيت ستوديو',
  coach_name_en text not null default 'Coach Layla Al-Harbi',
  coach_name_ar text not null default 'المدربة ليلى الحربي',
  coach_email text not null default 'coach@noorfit.sa',
  coach_phone text not null default '+966 50 123 4567',
  whatsapp_phone text not null default '966501234567',
  main_coach_id uuid references public.profiles(id) on delete set null,
  leaderboard_enabled boolean not null default true,
  leaderboard_published boolean not null default true,
  strict_verification boolean not null default true,
  leaderboard_stage text not null default 'published'
    check (leaderboard_stage in ('calculating', 'published', 'closed')),
  reward_title_en text not null default 'One Extra Free Fitness Class',
  reward_title_ar text not null default 'حصة تدريبية مجانية إضافية واحدة',
  updated_at timestamptz not null default now()
);

drop trigger if exists platform_settings_set_updated_at on public.platform_settings;
create trigger platform_settings_set_updated_at
before update on public.platform_settings
for each row execute function public.set_updated_at();

insert into public.platform_settings (id)
values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Leaderboard weeks, categories, exercises
-- ---------------------------------------------------------------------------
create table if not exists public.leaderboard_weeks (
  id uuid primary key default gen_random_uuid(),
  label_en text not null,
  label_ar text not null,
  short_en text not null,
  short_ar text not null,
  starts_on date not null,
  ends_on date not null,
  is_live boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  constraint leaderboard_weeks_date_order check (ends_on >= starts_on)
);

create unique index if not exists leaderboard_weeks_one_live_idx
  on public.leaderboard_weeks(is_live) where is_live = true;

create table if not exists public.categories (
  id text primary key,
  name_en text not null,
  name_ar text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references public.categories(id) on delete restrict,
  name_en text not null,
  name_ar text not null,
  desc_en text not null default '',
  desc_ar text not null default '',
  default_sets integer not null default 3 check (default_sets between 1 and 20),
  reps_en text not null default '12 reps',
  reps_ar text not null default '١٢ تكرار',
  rest_en text not null default '60 sec',
  rest_ar text not null default '٦٠ ثانية',
  preset_key text not null default 'squat'
    check (preset_key in ('squat', 'hipthrust', 'plank', 'latpulldown', 'shoulderpress', 'cardio')),
  media_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exercises_category_idx on public.exercises(category_id);

drop trigger if exists exercises_set_updated_at on public.exercises;
create trigger exercises_set_updated_at
before update on public.exercises
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Schedule and anti-cheat workout logs
-- ---------------------------------------------------------------------------
create table if not exists public.trainee_day_settings (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  week_id uuid not null references public.leaderboard_weeks(id) on delete cascade,
  day_key text not null check (day_key in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  is_rest_day boolean not null default false,
  created_at timestamptz not null default now(),
  unique (trainee_id, week_id, day_key)
);

create table if not exists public.scheduled_workouts (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  week_id uuid not null references public.leaderboard_weeks(id) on delete cascade,
  scheduled_date date not null,
  day_key text not null check (day_key in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  sets integer not null default 3 check (sets between 1 and 20),
  reps_en text not null default '12 reps',
  reps_ar text not null default '١٢ تكرار',
  rest_en text not null default '60 sec',
  rest_ar text not null default '٦٠ ثانية',
  notes_en text not null default '',
  notes_ar text not null default '',
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  proof_summary_en text,
  proof_summary_ar text,
  proof_weights text,
  proof_rpe integer check (proof_rpe between 1 and 10),
  proof_screenshot_path text,
  verification_status text not null default 'none'
    check (verification_status in ('none', 'pending_review', 'verified', 'rejected')),
  verification_note text,
  completed_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_workouts_trainee_week_idx
  on public.scheduled_workouts(trainee_id, week_id);
create index if not exists scheduled_workouts_week_status_idx
  on public.scheduled_workouts(week_id, verification_status);
create index if not exists scheduled_workouts_date_idx
  on public.scheduled_workouts(scheduled_date);

drop trigger if exists scheduled_workouts_set_updated_at on public.scheduled_workouts;
create trigger scheduled_workouts_set_updated_at
before update on public.scheduled_workouts
for each row execute function public.set_updated_at();

-- A trainee may submit proof, but only a coach/admin can verify or reject it.
create or replace function public.enforce_workout_proof_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_user_role();
  v_request_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if v_request_role = 'service_role' or v_role in ('coach', 'admin') then
    if new.verification_status in ('verified', 'rejected') then
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
     or new.sets is distinct from old.sets then
    raise exception 'Workout assignment fields are managed by the coach';
  end if;

  if new.verification_status is distinct from old.verification_status
     and new.verification_status in ('verified', 'rejected') then
    raise exception 'Only a coach or admin can verify or reject workout proof';
  end if;

  new.verified_by = null;
  new.verified_at = null;

  if new.status = 'completed' then
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
-- Activity feed and archived winners
-- ---------------------------------------------------------------------------
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.profiles(id) on delete set null,
  trainee_id uuid references public.profiles(id) on delete set null,
  badge_type text not null default 'success' check (badge_type in ('success', 'warning', 'danger', 'neutral')),
  text_en text not null,
  text_ar text not null,
  created_at timestamptz not null default now()
);

create index if not exists activity_events_created_idx on public.activity_events(created_at desc);

create table if not exists public.leaderboard_previous_winners (
  id uuid primary key default gen_random_uuid(),
  week_id uuid references public.leaderboard_weeks(id) on delete set null,
  trainee_id uuid references public.profiles(id) on delete set null,
  completed integer not null default 0,
  total integer not null default 0,
  percent integer not null default 0,
  score integer not null default 0,
  reward_en text not null,
  reward_ar text not null,
  week_en text not null,
  week_ar text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Private proof screenshot bucket (WebP under 100 KB)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workout-proofs', 'workout-proofs', false, 102400, array['image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 102400,
    allowed_mime_types = array['image/webp'];

commit;
