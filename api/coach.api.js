import {
  DAY_KEYS,
  buildSchedule,
  getCategories,
  getExercises,
  getLiveWeek,
  getPlatformSettings,
  getWeeks,
  mapExercise,
  mapTraineeProfile,
  normalizePhone,
  requireSupabase,
  unwrap
} from "./client.js";

function mapArchiveRow(row) {
  return {
    weekEn: row.week_en,
    weekAr: row.week_ar,
    traineeId: row.trainee_id,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    avatarStyle: row.avatar_style,
    completed: row.completed,
    total: row.total,
    percent: row.percent,
    score: row.score,
    rewardEn: row.reward_en,
    rewardAr: row.reward_ar
  };
}

function deriveRecentActivity(profiles, workouts) {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  return workouts
    .filter((row) => row.verification_status === "pending_review" || row.verification_status === "verified")
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
    .slice(0, 8)
    .map((row) => {
      const trainee = profileById.get(row.trainee_id);
      const verified = row.verification_status === "verified";
      return {
        id: row.id,
        badgeType: verified ? "success" : "warning",
        textEn: verified
          ? `${trainee?.name_en || "A trainee"} submitted a verified workout proof and earned leaderboard credit.`
          : `${trainee?.name_en || "A trainee"} submitted workout proof for coach review.`,
        textAr: verified
          ? `أرسلت ${trainee?.name_ar || "المتدربة"} إثبات تمرين موثقاً وحصلت على نقاط لوحة المتصدرات.`
          : `أرسلت ${trainee?.name_ar || "المتدربة"} إثبات تمرين بانتظار مراجعة المدربة.`,
        timeEn: new Date(row.updated_at || row.completed_at || Date.now()).toLocaleString("en"),
        timeAr: new Date(row.updated_at || row.completed_at || Date.now()).toLocaleString("ar-SA-u-ca-gregory")
      };
    });
}

export async function loadCoachWorkspace() {
  const client = requireSupabase();
  const [settings, categories, exercises, weeks, currentWeek] = await Promise.all([
    getPlatformSettings(),
    getCategories(),
    getExercises(),
    getWeeks(),
    getLiveWeek()
  ]);

  const [profilesResult, winnersResult, activityResult] = await Promise.all([
    client.from("profiles").select("*").eq("role", "trainee").order("name_en", { ascending: true }),
    client.rpc("get_leaderboard_archive"),
    client.from("activity_events").select("*").order("created_at", { ascending: false }).limit(20)
  ]);

  const profiles = unwrap(profilesResult, "Unable to load trainees") || [];
  const archiveRows = unwrap(winnersResult, "Unable to load previous winners") || [];
  const activityRows = unwrap(activityResult, "Unable to load activity") || [];

  let workouts = [];
  let daySettings = [];
  if (currentWeek) {
    const [workoutsResult, daysResult] = await Promise.all([
      client
        .from("scheduled_workouts")
        .select("*")
        .eq("week_id", currentWeek.id)
        .order("scheduled_date", { ascending: true })
        .order("created_at", { ascending: true }),
      client.from("trainee_day_settings").select("*").eq("week_id", currentWeek.id)
    ]);
    workouts = unwrap(workoutsResult, "Unable to load trainee schedules") || [];
    daySettings = unwrap(daysResult, "Unable to load rest days") || [];
  }

  const workoutsByTrainee = new Map();
  workouts.forEach((row) => {
    if (!workoutsByTrainee.has(row.trainee_id)) workoutsByTrainee.set(row.trainee_id, []);
    workoutsByTrainee.get(row.trainee_id).push(row);
  });

  const daysByTrainee = new Map();
  daySettings.forEach((row) => {
    if (!daysByTrainee.has(row.trainee_id)) daysByTrainee.set(row.trainee_id, []);
    daysByTrainee.get(row.trainee_id).push(row);
  });

  const trainees = profiles.map((row) =>
    mapTraineeProfile(row, {
      workouts: workoutsByTrainee.get(row.id) || [],
      daySettings: daysByTrainee.get(row.id) || [],
      weekStart: currentWeek?.startsOn
    })
  );

  const activities = activityRows.length
    ? activityRows.map((row) => ({
        id: row.id,
        badgeType: row.badge_type,
        textEn: row.text_en,
        textAr: row.text_ar,
        timeEn: new Date(row.created_at).toLocaleString("en"),
        timeAr: new Date(row.created_at).toLocaleString("ar-SA-u-ca-gregory")
      }))
    : deriveRecentActivity(profiles, workouts);

  return {
    settings,
    categories,
    exercises,
    weeks,
    currentWeek,
    trainees,
    previousWinners: archiveRows.map(mapArchiveRow),
    recentActivities: activities,
    saasCoaches: [
      {
        id: "main-coach",
        nameEn: settings.coachNameEn,
        nameAr: settings.coachNameAr,
        specialtyEn: "Strength & Postpartum Fitness",
        specialtyAr: "تمارين المقاومة ولياقة ما بعد الولادة",
        traineesCount: profiles.length,
        active: true
      }
    ]
  };
}

export async function toggleTraineeAccess(traineeId, access) {
  const client = requireSupabase();
  return unwrap(
    await client
      .from("profiles")
      .update({ subscription_active: access, plan_unlocked: access })
      .eq("id", traineeId)
      .select("id, subscription_active, plan_unlocked")
      .single(),
    "Unable to update trainee access"
  );
}

export async function updateTraineeRecurrence(traineeId, recurrence, days) {
  if (!["weekly", "selected_days", "daily"].includes(recurrence)) {
    throw new Error("Invalid recurrence pattern");
  }
  const validDays = (days || []).filter((day) => DAY_KEYS.includes(day));
  const client = requireSupabase();
  return unwrap(
    await client
      .from("profiles")
      .update({ recurrence, recurrence_days: validDays })
      .eq("id", traineeId)
      .select("id, recurrence, recurrence_days")
      .single(),
    "Unable to update the recurrence pattern"
  );
}

export async function addWorkoutToDay({ traineeId, dayKey, exerciseId, weekId }) {
  if (!DAY_KEYS.includes(dayKey)) throw new Error("Invalid training day");
  const client = requireSupabase();
  const week = weekId ? { id: weekId } : await getLiveWeek();
  if (!week) throw new Error("NO_LIVE_WEEK");

  const [exerciseResult, weekResult] = await Promise.all([
    client.from("exercises").select("*").eq("id", exerciseId).single(),
    client.from("leaderboard_weeks").select("starts_on").eq("id", week.id).single()
  ]);
  const exercise = mapExercise(unwrap(exerciseResult, "Exercise not found"));
  const weekRow = unwrap(weekResult, "Week not found");
  const dayIndex = DAY_KEYS.indexOf(dayKey);
  const scheduledDate = new Date(`${weekRow.starts_on}T00:00:00Z`);
  scheduledDate.setUTCDate(scheduledDate.getUTCDate() + dayIndex);

  const inserted = unwrap(
    await client
      .from("scheduled_workouts")
      .insert({
        trainee_id: traineeId,
        exercise_id: exercise.id,
        week_id: week.id,
        scheduled_date: scheduledDate.toISOString().slice(0, 10),
        day_key: dayKey,
        sets: exercise.defaultSets,
        reps_en: exercise.repsEn,
        reps_ar: exercise.repsAr,
        rest_en: exercise.restEn,
        rest_ar: exercise.restAr,
        notes_en: "",
        notes_ar: "",
        status: "pending",
        verification_status: "none"
      })
      .select("*")
      .single(),
    "Unable to add the exercise to the schedule"
  );

  const daySetting = await client
    .from("trainee_day_settings")
    .upsert(
      {
        trainee_id: traineeId,
        week_id: week.id,
        day_key: dayKey,
        is_rest_day: false
      },
      { onConflict: "trainee_id,week_id,day_key" }
    );
  if (daySetting.error) {
    await client.from("scheduled_workouts").delete().eq("id", inserted.id);
    throw new Error(daySetting.error.message);
  }

  return inserted;
}

export async function removeWorkout(workoutId) {
  const client = requireSupabase();
  const existing = unwrap(
    await client.from("scheduled_workouts").select("status").eq("id", workoutId).single(),
    "Unable to load the workout"
  );
  if (existing.status === "completed") throw new Error("WORKOUT_COMPLETED_LOCKED");
  const { error } = await client.from("scheduled_workouts").delete().eq("id", workoutId);
  if (error) throw new Error(error.message);
}

export async function setRestDay({ traineeId, weekId, dayKey, isRestDay }) {
  if (!DAY_KEYS.includes(dayKey)) throw new Error("Invalid training day");
  const client = requireSupabase();
  const week = weekId ? { id: weekId } : await getLiveWeek();
  if (!week) throw new Error("NO_LIVE_WEEK");

  if (isRestDay) {
    const { data: completed, error: completedError } = await client
      .from("scheduled_workouts")
      .select("id")
      .eq("trainee_id", traineeId)
      .eq("week_id", week.id)
      .eq("day_key", dayKey)
      .eq("status", "completed")
      .limit(1);
    if (completedError) throw new Error(completedError.message);
    if (completed?.length) throw new Error("DAY_HAS_COMPLETED_WORKOUTS");
  }

  const daySetting = await client
    .from("trainee_day_settings")
    .upsert(
      {
        trainee_id: traineeId,
        week_id: week.id,
        day_key: dayKey,
        is_rest_day: isRestDay
      },
      { onConflict: "trainee_id,week_id,day_key" }
    )
    .select("*")
    .single();
  if (daySetting.error) throw new Error(daySetting.error.message);

  if (isRestDay) {
    const { error } = await client
      .from("scheduled_workouts")
      .delete()
      .eq("trainee_id", traineeId)
      .eq("week_id", week.id)
      .eq("day_key", dayKey)
      .neq("status", "completed");
    if (error) {
      await client
        .from("trainee_day_settings")
        .upsert(
          {
            trainee_id: traineeId,
            week_id: week.id,
            day_key: dayKey,
            is_rest_day: false
          },
          { onConflict: "trainee_id,week_id,day_key" }
        );
      throw new Error(error.message);
    }
  }

  return daySetting.data;
}

export async function updateWorkout(workoutId, updates) {
  const allowed = {};
  ["sets", "reps_en", "reps_ar", "rest_en", "rest_ar", "notes_en", "notes_ar"].forEach((key) => {
    if (updates[key] !== undefined) allowed[key] = updates[key];
  });
  if (!Object.keys(allowed).length) return null;
  const client = requireSupabase();
  return unwrap(
    await client.from("scheduled_workouts").update(allowed).eq("id", workoutId).select("*").single(),
    "Unable to update the workout"
  );
}

export async function createExercise({
  categoryId,
  nameEn,
  nameAr,
  descEn,
  descAr,
  defaultSets,
  repsEn,
  repsAr,
  restEn,
  restAr,
  presetKey,
  mediaFile = null
}) {
  if (!nameEn?.trim() || !nameAr?.trim()) throw new Error("EXERCISE_NAMES_REQUIRED");
  const client = requireSupabase();
  let mediaPath = null;

  if (mediaFile) {
    const allowedTypes = ["image/webp", "image/gif", "image/png", "image/jpeg"];
    if (!allowedTypes.includes(mediaFile.type)) {
      throw new Error("EXERCISE_MEDIA_TYPE_INVALID");
    }
    if (mediaFile.size > 2 * 1024 * 1024) {
      throw new Error("EXERCISE_MEDIA_TOO_LARGE");
    }
    const extension = mediaFile.type.split("/")[1].replace("jpeg", "jpg");
    mediaPath = `library/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage
      .from("exercise-media")
      .upload(mediaPath, mediaFile, { contentType: mediaFile.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);
  }

  try {
    return unwrap(
      await client
        .from("exercises")
        .insert({
          category_id: categoryId,
          name_en: nameEn.trim(),
          name_ar: nameAr.trim(),
          desc_en: descEn?.trim() || "Guided movement with controlled form.",
          desc_ar: descAr?.trim() || "تمرين موجه بأداء متوازن وصحيح.",
          default_sets: Number(defaultSets) || 3,
          reps_en: repsEn || "12 reps",
          reps_ar: repsAr || "١٢ تكرار",
          rest_en: restEn || "60 sec",
          rest_ar: restAr || "٦٠ ثانية",
          preset_key: presetKey,
          media_path: mediaPath
        })
        .select("*")
        .single(),
      "Unable to create the exercise"
    );
  } catch (error) {
    if (mediaPath) {
      await client.storage.from("exercise-media").remove([mediaPath]);
    }
    throw error;
  }
}

export async function deleteExercise(exerciseId) {
  const client = requireSupabase();
  return unwrap(
    await client
      .from("exercises")
      .update({ is_active: false })
      .eq("id", exerciseId)
      .select("id")
      .single(),
    "Unable to archive the exercise"
  );
}

export async function savePlatformSettings(settings) {
  if (!settings.websiteNameEn?.trim() || !settings.websiteNameAr?.trim()) {
    throw new Error("BRAND_NAMES_REQUIRED");
  }
  const client = requireSupabase();
  return unwrap(
    await client
      .from("platform_settings")
      .update({
        website_name_en: settings.websiteNameEn.trim(),
        website_name_ar: settings.websiteNameAr.trim(),
        coach_name_en: settings.coachNameEn.trim(),
        coach_name_ar: settings.coachNameAr.trim(),
        coach_email: settings.coachEmail?.trim() || "",
        coach_phone: settings.coachPhone?.trim() || "",
        whatsapp_phone: normalizePhone(settings.coachPhone)
      })
      .eq("id", 1)
      .select("*")
      .single(),
    "Unable to save platform settings"
  );
}

export async function getWorkoutProofDetails(traineeId) {
  const client = requireSupabase();
  const [profileResult, workoutsResult] = await Promise.all([
    client.from("profiles").select("*").eq("id", traineeId).single(),
    client
      .from("scheduled_workouts")
      .select("*")
      .eq("trainee_id", traineeId)
      .in("status", ["completed", "skipped"])
      .order("completed_at", { ascending: false })
      .limit(100)
  ]);
  return {
    profile: unwrap(profileResult, "Unable to load trainee"),
    workouts: unwrap(workoutsResult, "Unable to load proofs") || []
  };
}

export { buildSchedule };
