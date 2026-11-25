-- R&R Fit - consolidated Row Level Security snapshot.
-- This file is documentation only. Apply backend/supabase/migrations/ in
-- filename order with `supabase db push` or `npm run backend:apply`.
begin;

alter table public.profiles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.leaderboard_weeks enable row level security;
alter table public.categories enable row level security;
alter table public.exercises enable row level security;
alter table public.trainee_day_settings enable row level security;
alter table public.scheduled_workouts enable row level security;
alter table public.activity_events enable row level security;
alter table public.leaderboard_previous_winners enable row level security;
alter table public.coach_certificates enable row level security;

-- Profiles ------------------------------------------------------------------
drop policy if exists "profiles_select_scope" on public.profiles;
create policy "profiles_select_scope"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (public.current_user_role() = 'coach' and (id = auth.uid() or coach_id = auth.uid()))
);

drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
on public.profiles for insert
to authenticated
with check (public.is_admin());

drop policy if exists "profiles_update_scope" on public.profiles;
create policy "profiles_update_scope"
on public.profiles for update
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (public.current_user_role() = 'coach' and coach_id = auth.uid())
)
with check (
  id = auth.uid()
  or public.is_admin()
  or (public.current_user_role() = 'coach' and coach_id = auth.uid())
);

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
on public.profiles for delete
to authenticated
using (public.is_admin());

-- Platform settings ---------------------------------------------------------
drop policy if exists "platform_settings_read_all" on public.platform_settings;
create policy "platform_settings_read_all"
on public.platform_settings for select
to authenticated
using (true);

drop policy if exists "platform_settings_write_privileged" on public.platform_settings;
create policy "platform_settings_write_privileged"
on public.platform_settings for all
to authenticated
using (public.is_coach_or_admin())
with check (public.is_coach_or_admin());

-- Weeks, categories, exercises ---------------------------------------------
drop policy if exists "weeks_read_authenticated" on public.leaderboard_weeks;
create policy "weeks_read_authenticated"
on public.leaderboard_weeks for select
to authenticated
using (is_published or is_live or public.is_coach_or_admin());

drop policy if exists "weeks_write_privileged" on public.leaderboard_weeks;
create policy "weeks_write_privileged"
on public.leaderboard_weeks for all
to authenticated
using (public.is_coach_or_admin())
with check (public.is_coach_or_admin());

drop policy if exists "categories_read_authenticated" on public.categories;
create policy "categories_read_authenticated"
on public.categories for select
to authenticated
using (true);

drop policy if exists "categories_write_privileged" on public.categories;
create policy "categories_write_privileged"
on public.categories for all
to authenticated
using (public.is_coach_or_admin())
with check (public.is_coach_or_admin());

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

drop policy if exists "exercises_write_privileged" on public.exercises;
create policy "exercises_write_privileged"
on public.exercises for all
to authenticated
using (public.is_coach_or_admin())
with check (public.is_coach_or_admin());

-- Trainee day settings ------------------------------------------------------
drop policy if exists "day_settings_read_scope" on public.trainee_day_settings;
create policy "day_settings_read_scope"
on public.trainee_day_settings for select
to authenticated
using (
  (trainee_id = auth.uid() and public.has_plan_access(auth.uid()))
  or public.can_manage_trainee(trainee_id)
  or public.is_admin()
);

drop policy if exists "day_settings_write_privileged" on public.trainee_day_settings;
create policy "day_settings_write_privileged"
on public.trainee_day_settings for all
to authenticated
using (public.can_manage_trainee(trainee_id) or public.is_admin())
with check (public.can_manage_trainee(trainee_id) or public.is_admin());

-- Scheduled workouts --------------------------------------------------------
-- Database-enforced subscription gate: no plan = no schedule rows for trainee.
drop policy if exists "scheduled_workouts_select_scope" on public.scheduled_workouts;
create policy "scheduled_workouts_select_scope"
on public.scheduled_workouts for select
to authenticated
using (
  (trainee_id = auth.uid() and public.has_plan_access(auth.uid()))
  or public.can_manage_trainee(trainee_id)
  or public.is_admin()
);

drop policy if exists "scheduled_workouts_insert_privileged" on public.scheduled_workouts;
create policy "scheduled_workouts_insert_privileged"
on public.scheduled_workouts for insert
to authenticated
with check (public.can_manage_trainee(trainee_id) or public.is_admin());

drop policy if exists "scheduled_workouts_update_scope" on public.scheduled_workouts;
create policy "scheduled_workouts_update_scope"
on public.scheduled_workouts for update
to authenticated
using (
  (trainee_id = auth.uid() and public.has_plan_access(auth.uid()))
  or public.can_manage_trainee(trainee_id)
  or public.is_admin()
)
with check (
  (trainee_id = auth.uid() and public.has_plan_access(auth.uid()))
  or public.can_manage_trainee(trainee_id)
  or public.is_admin()
);

drop policy if exists "scheduled_workouts_delete_privileged" on public.scheduled_workouts;
create policy "scheduled_workouts_delete_privileged"
on public.scheduled_workouts for delete
to authenticated
using (public.can_manage_trainee(trainee_id) or public.is_admin());

-- Activity and archive ------------------------------------------------------
drop policy if exists "activity_read_privileged" on public.activity_events;
create policy "activity_read_privileged"
on public.activity_events for select
to authenticated
using (public.is_coach_or_admin() or trainee_id = auth.uid());

drop policy if exists "activity_write_privileged" on public.activity_events;
create policy "activity_write_privileged"
on public.activity_events for all
to authenticated
using (public.is_coach_or_admin())
with check (public.is_coach_or_admin());

drop policy if exists "previous_winners_read_authenticated" on public.leaderboard_previous_winners;
create policy "previous_winners_read_authenticated"
on public.leaderboard_previous_winners for select
to authenticated
using (true);

drop policy if exists "previous_winners_write_privileged" on public.leaderboard_previous_winners;
create policy "previous_winners_write_privileged"
on public.leaderboard_previous_winners for all
to authenticated
using (public.is_coach_or_admin())
with check (public.is_coach_or_admin());

-- Coach certificates ---------------------------------------------------------
-- Every signed-in user may read the coach's certificates; only the coach owns
-- the rows, so only she can add, edit or remove them.
drop policy if exists "coach_certificates_read_authenticated" on public.coach_certificates;
create policy "coach_certificates_read_authenticated"
on public.coach_certificates for select
to authenticated
using (true);

drop policy if exists "coach_certificates_write_owner" on public.coach_certificates;
create policy "coach_certificates_write_owner"
on public.coach_certificates for all
to authenticated
using (coach_id = auth.uid() and public.is_coach_or_admin())
with check (coach_id = auth.uid() and public.is_coach_or_admin());

-- Private storage bucket ----------------------------------------------------
drop policy if exists "workout_proofs_insert_own" on storage.objects;
create policy "workout_proofs_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'workout-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}-[0-9]+[.](webp|jpg)$'
);

drop policy if exists "workout_proofs_read_scope" on storage.objects;
create policy "workout_proofs_read_scope"
on storage.objects for select
to authenticated
using (
  bucket_id = 'workout-proofs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_coach_or_admin()
  )
);

drop policy if exists "workout_proofs_update_own" on storage.objects;
create policy "workout_proofs_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'workout-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
  and not public.is_proof_path_locked(name)
)
with check (
  bucket_id = 'workout-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
  and not public.is_proof_path_locked(name)
);

drop policy if exists "workout_proofs_delete_scope" on storage.objects;
create policy "workout_proofs_delete_scope"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'workout-proofs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_coach_or_admin()
  )
  and not public.is_proof_path_locked(name)
);

-- Exercise library media: public files, privileged writes.
drop policy if exists "exercise_media_read_public" on storage.objects;
create policy "exercise_media_read_public"
on storage.objects for select
to public
using (bucket_id = 'exercise-media');

drop policy if exists "exercise_media_insert_privileged" on storage.objects;
create policy "exercise_media_insert_privileged"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'exercise-media'
  and public.is_coach_or_admin()
);

drop policy if exists "exercise_media_update_privileged" on storage.objects;
create policy "exercise_media_update_privileged"
on storage.objects for update
to authenticated
using (bucket_id = 'exercise-media' and public.is_coach_or_admin())
with check (bucket_id = 'exercise-media' and public.is_coach_or_admin());

drop policy if exists "exercise_media_delete_privileged" on storage.objects;
create policy "exercise_media_delete_privileged"
on storage.objects for delete
to authenticated
using (bucket_id = 'exercise-media' and public.is_coach_or_admin());

-- Coach media (profile photo + certificates): readable by every signed-in user,
-- writable only by the owning coach inside her own folder.
drop policy if exists "coach_media_read_authenticated" on storage.objects;
create policy "coach_media_read_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'coach-media');

drop policy if exists "coach_media_insert_owner" on storage.objects;
create policy "coach_media_insert_owner"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'coach-media'
  and public.is_coach_or_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "coach_media_update_owner" on storage.objects;
create policy "coach_media_update_owner"
on storage.objects for update
to authenticated
using (
  bucket_id = 'coach-media'
  and public.is_coach_or_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'coach-media'
  and public.is_coach_or_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "coach_media_delete_owner" on storage.objects;
create policy "coach_media_delete_owner"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'coach-media'
  and public.is_coach_or_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
