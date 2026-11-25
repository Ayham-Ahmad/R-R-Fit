import {
  getAuthUser,
  getCategories,
  getExercises,
  getLiveWeek,
  getPlatformSettings,
  getStorageSignedUrls,
  getWeeks,
  mapCertificate,
  mapCoachProfile,
  mapTraineeProfile,
  normalizePhone,
  requireSupabase,
  unwrap
} from "./client.js";

async function removeProofObject(client, path) {
  if (!path) return;
  const { error } = await client.storage.from("workout-proofs").remove([path]);
  if (error) throw new Error(error.message);
}

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

  const coachAvatarUrls = await getStorageSignedUrls("coach-media", [settings.coachAvatarPath]);

  return {
    settings,
    categories,
    exercises,
    weeks,
    currentWeek,
    trainee,
    coach: mapCoachProfile(settings, coachAvatarUrls[settings.coachAvatarPath] || "")
  };
}

// Loaded on demand when the trainee opens the coach profile, so signed URLs are
// always fresh and the main workspace load stays fast.
export async function getTraineeCoachProfile() {
  const client = requireSupabase();
  const settings = await getPlatformSettings();
  // Certificates are platform-wide coach content. Do not filter by
  // main_coach_id: legacy rows and alternate coach accounts would disappear.
  // RLS still limits reads to authenticated users.
  const rows =
    unwrap(
      await client
        .from("coach_certificates")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      "Unable to load certificates"
    ) || [];

  const mediaUrls = await getStorageSignedUrls("coach-media", [
    settings.coachAvatarPath,
    ...rows.map((row) => row.file_path)
  ]);

  return {
    coach: mapCoachProfile(settings, mediaUrls[settings.coachAvatarPath] || ""),
    certificates: rows.map((row) => mapCertificate(row, mediaUrls[row.file_path]))
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
    await removeProofObject(client, screenshotPath);
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

  const { data: existing, error: loadError } = await client
    .from("scheduled_workouts")
    .select("id, proof_screenshot_path")
    .eq("id", workoutId)
    .eq("trainee_id", user.id)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error("MISSING_WORKOUT");

  const updated = unwrap(
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
  // Switching channels makes the old screenshot orphaned, so remove it once
  // the database no longer points at it.
  await removeProofObject(client, existing.proof_screenshot_path);
  return updated;
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
