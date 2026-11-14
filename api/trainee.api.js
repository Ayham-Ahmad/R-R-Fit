import {
  getAuthUser,
  getCategories,
  getExercises,
  getLiveWeek,
  getPlatformSettings,
  getWeeks,
  mapTraineeProfile,
  normalizePhone,
  requireSupabase,
  unwrap
} from "./client.js";

export async function loadTraineeWorkspace() {
  const client = requireSupabase();
  const user = await getAuthUser();
  if (!user) throw new Error("AUTH_REQUIRED");
  const userId = user.id;

  const [settings, categories, exercises, weeks, currentWeek, profileResult, historyResult] = await Promise.all([
    getPlatformSettings(),
    getCategories(),
    getExercises(),
    getWeeks(),
    getLiveWeek(),
    client.from("profiles").select("*").eq("id", userId).single(),
    client
      .from("scheduled_workouts")
      .select("*")
      .eq("trainee_id", userId)
      .in("status", ["completed", "skipped"])
      .order("completed_at", { ascending: false })
      .limit(100)
  ]);
  const profile = unwrap(profileResult, "Unable to load your trainee profile");
  const history = unwrap(historyResult, "Unable to load your proof history") || [];

  let workouts = [];
  let daySettings = [];
  if (currentWeek && profile.subscription_active && profile.plan_unlocked) {
    const [workoutsResult, daysResult] = await Promise.all([
      client
        .from("scheduled_workouts")
        .select("*")
        .eq("trainee_id", userId)
        .eq("week_id", currentWeek.id)
        .order("scheduled_date", { ascending: true })
        .order("created_at", { ascending: true }),
      client
        .from("trainee_day_settings")
        .select("*")
        .eq("trainee_id", userId)
        .eq("week_id", currentWeek.id)
    ]);
    workouts = unwrap(workoutsResult, "Unable to load your schedule") || [];
    daySettings = unwrap(daysResult, "Unable to load your rest days") || [];
  }

  const trainee = mapTraineeProfile(profile, {
    workouts,
    history,
    daySettings,
    weekStart: currentWeek?.startsOn
  });

  return {
    settings,
    categories,
    exercises,
    weeks,
    currentWeek,
    trainee,
    coach: {
      nameEn: settings.coachNameEn,
      nameAr: settings.coachNameAr,
      email: settings.coachEmail,
      whatsappPhone: settings.whatsappPhone,
      phoneDisplayEn: settings.coachPhone,
      phoneDisplayAr: settings.coachPhone
    }
  };
}

export async function submitWorkoutProof({
  workoutId,
  comment,
  screenshotBlob = null
}) {
  if (!workoutId) throw new Error("MISSING_WORKOUT");
  const cleanComment = String(comment || "").trim();

  const client = requireSupabase();
  const user = await getAuthUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  if (!screenshotBlob) throw new Error("PROOF_FILE_REQUIRED");
  if (!(screenshotBlob instanceof Blob)) throw new Error("PROOF_FILE_INVALID");
  if (screenshotBlob.size > 10 * 1024 * 1024) throw new Error("PROOF_FILE_TOO_LARGE");
  const contentType = screenshotBlob.type;
  if (!["image/webp", "image/jpeg"].includes(contentType)) {
    throw new Error("PROOF_FILE_TYPE_INVALID");
  }
  const extension = contentType === "image/jpeg" ? "jpg" : "webp";

  const screenshotPath = `${user.id}/${workoutId}-${Date.now()}.${extension}`;
  const { error: uploadError } = await client.storage
    .from("workout-proofs")
    .upload(screenshotPath, screenshotBlob, {
      contentType,
      cacheControl: "3600",
      upsert: false
    });
  if (uploadError) throw new Error(uploadError.message);

  try {
    return unwrap(
      await client
        .from("scheduled_workouts")
        .update({
          status: "completed",
          proof_channel: "app",
          proof_summary_en: cleanComment || null,
          proof_screenshot_path: screenshotPath,
          verification_status: "pending_review",
          completed_at: new Date().toISOString()
        })
        .eq("id", workoutId)
        .eq("trainee_id", user.id)
        .select("*")
        .single(),
      "Unable to submit workout proof"
    );
  } catch (error) {
    if (screenshotPath) {
      await client.storage.from("workout-proofs").remove([screenshotPath]);
    }
    throw error;
  }
}

// The trainee shares the compressed proof on WhatsApp instead of uploading it.
// No screenshot is stored; the coach reviews and approves it from the queue.
export async function submitWhatsAppProof({ workoutId, comment }) {
  if (!workoutId) throw new Error("MISSING_WORKOUT");
  const cleanComment = String(comment || "").trim();

  const client = requireSupabase();
  const user = await getAuthUser();
  if (!user) throw new Error("AUTH_REQUIRED");

  return unwrap(
    await client
      .from("scheduled_workouts")
      .update({
        status: "completed",
        proof_channel: "whatsapp",
        proof_summary_en: cleanComment || null,
        proof_screenshot_path: null,
        verification_status: "pending_review",
        completed_at: new Date().toISOString()
      })
      .eq("id", workoutId)
      .eq("trainee_id", user.id)
      .select("*")
      .single(),
    "Unable to submit workout proof"
  );
}

export async function markWorkoutSkipped(workoutId) {
  const client = requireSupabase();
  const user = await getAuthUser();
  if (!user) throw new Error("AUTH_REQUIRED");
  return unwrap(
    await client
      .from("scheduled_workouts")
      .update({ status: "skipped", verification_status: "none" })
      .eq("id", workoutId)
      .eq("trainee_id", user.id)
      .select("*")
      .single(),
    "Unable to mark the workout as skipped"
  );
}

export async function getProofScreenshotUrl(path) {
  if (!path) return null;
  const client = requireSupabase();
  const { data, error } = await client.storage.from("workout-proofs").createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data?.signedUrl || null;
}

export async function saveTraineeProfile({ nameEn, nameAr, goalEn, goalAr, phone }) {
  if (!nameEn?.trim() || !nameAr?.trim()) throw new Error("NAMES_REQUIRED");
  const client = requireSupabase();
  const user = await getAuthUser();
  if (!user) throw new Error("AUTH_REQUIRED");
  return unwrap(
    await client
      .from("profiles")
      .update({
        name_en: nameEn.trim(),
        name_ar: nameAr.trim(),
        goal_en: goalEn?.trim() || "",
        goal_ar: goalAr?.trim() || "",
        whatsapp_phone: normalizePhone(phone)
      })
      .eq("id", user.id)
      .select("*")
      .single(),
    "Unable to save your profile"
  );
}
