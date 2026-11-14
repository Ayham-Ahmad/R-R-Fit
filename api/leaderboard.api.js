import {
  getPlatformSettings,
  getWeeks,
  requireSupabase,
  unwrap
} from "./client.js";
import { createDrawingAvatar } from "../frontend/js/graphics.js";

function mapRpcEntry(row) {
  return {
    trainee: {
      id: row.trainee_id,
      nameEn: row.name_en,
      nameAr: row.name_ar,
      goalEn: row.goal_en || "",
      goalAr: row.goal_ar || "",
      avatarStyle: row.avatar_style || "sara",
      avatarUrl: createDrawingAvatar(row.avatar_style || "sara"),
      coachVerifiedProof: Number(row.verified_count) > 0,
      proofSummaryEn: `${row.verified_count} verified workouts`,
      proofSummaryAr: `${row.verified_count} تمريناً موثقاً`
    },
    completed: Number(row.completed_count) || 0,
    verified: Number(row.verified_count) || 0,
    total: Number(row.total_count) || 0,
    percent: Number(row.percent) || 0,
    score: Number(row.score) || 0,
    rank: Number(row.rank_position) || 0
  };
}

function mapArchive(row) {
  return {
    weekEn: row.week_en,
    weekAr: row.week_ar,
    traineeId: row.trainee_id,
    nameEn: row.name_en || "",
    nameAr: row.name_ar || "",
    avatarStyle: row.avatar_style || "sara",
    avatarUrl: createDrawingAvatar(row.avatar_style || "sara"),
    completed: Number(row.completed) || 0,
    total: Number(row.total) || 0,
    percent: Number(row.percent) || 0,
    score: Number(row.score) || 0,
    rewardEn: row.reward_en,
    rewardAr: row.reward_ar
  };
}

export async function loadLeaderboard({ weekId = null } = {}) {
  const client = requireSupabase();
  const settings = await getPlatformSettings();
  const [weeks, standingsResult, archiveResult] = await Promise.all([
    getWeeks(),
    client.rpc("get_weekly_leaderboard", {
      p_week_id: weekId || null,
      p_limit: 500
    }),
    client.rpc("get_leaderboard_archive")
  ]);

  const entries = (unwrap(standingsResult, "Unable to load weekly standings") || []).map(mapRpcEntry);
  const archiveRows = unwrap(archiveResult, "Unable to load previous winners") || [];
  const activeWeek = weekId
    ? weeks.find((week) => week.id === weekId)
    : weeks.find((week) => week.isLive) || weeks[0] || null;

  return {
    settings,
    weeks,
    week: activeWeek,
    entries,
    winner: entries[0] || null,
    previousWinners: archiveRows.map(mapArchive)
  };
}

export async function getProofLogs(traineeId) {
  const client = requireSupabase();
  const data = unwrap(
    await client
      .from("scheduled_workouts")
      .select(
        "id, day_key, exercise_id, status, verification_status, verification_note, proof_weights, proof_summary_en, proof_summary_ar, proof_rpe, proof_screenshot_path, proof_channel, proof_purged_at, completed_at"
      )
      .eq("trainee_id", traineeId)
      .in("status", ["completed", "skipped"])
      .order("completed_at", { ascending: false })
      .limit(100),
    "Unable to load workout proofs"
  );
  return (data || []).map((row) => ({
    workoutId: row.id,
    dayKey: row.day_key,
    exerciseId: row.exercise_id,
    status: row.status,
    verificationStatus: row.verification_status,
    verificationNote: row.verification_note || "",
    weights: row.proof_weights || "",
    summaryEn: row.proof_summary_en || "",
    summaryAr: row.proof_summary_ar || "",
    rpe: row.proof_rpe,
    screenshotPath: row.proof_screenshot_path,
    proofChannel: row.proof_channel || "app",
    proofPurgedAt: row.proof_purged_at || null,
    completedAt: row.completed_at
  }));
}

export async function getProofScreenshotUrl(path) {
  if (!path) return null;
  const client = requireSupabase();
  const { data, error } = await client.storage.from("workout-proofs").createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data?.signedUrl || null;
}

export async function reviewWorkoutProof({ workoutId, decision, note = "" }) {
  if (!["verified", "rejected"].includes(decision)) {
    throw new Error("INVALID_PROOF_DECISION");
  }
  const client = requireSupabase();
  const update = {
    verification_status: decision,
    verification_note: decision === "rejected"
      ? note || "Proof did not meet the anti-cheat requirements."
      : note || null
  };

  const result = unwrap(
    await client
      .from("scheduled_workouts")
      .update(update)
      .eq("id", workoutId)
      .eq("status", "completed")
      .select("*")
      .single(),
    "Unable to review the workout proof"
  );

  const user = await client.auth.getUser();
  const [{ data: traineeRow }] = await Promise.all([
    client.from("profiles").select("name_en, name_ar").eq("id", result.trainee_id).maybeSingle()
  ]);

  await client.from("activity_events").insert({
    coach_id: user?.data?.user?.id || null,
    trainee_id: result.trainee_id,
    badge_type: decision === "verified" ? "success" : "danger",
    text_en: decision === "verified"
      ? `Coach approved ${traineeRow?.name_en || "a trainee"}'s workout proof.`
      : `Coach rejected an unverified workout proof from ${traineeRow?.name_en || "a trainee"}.`,
    text_ar: decision === "verified"
      ? `اعتمدت المدربة إثبات تمرين المتدربة ${traineeRow?.name_ar || ""}.`
      : `استبعدت المدربة إثبات تمرين غير موثق للمتدربة ${traineeRow?.name_ar || ""}.`
  });

  return result;
}

export async function saveLeaderboardSettings(settings) {
  const client = requireSupabase();
  return unwrap(
    await client
      .from("platform_settings")
      .update({
        leaderboard_enabled: Boolean(settings.leaderboardEnabled),
        leaderboard_published: Boolean(settings.leaderboardPublished),
        strict_verification: Boolean(settings.strictVerification),
        leaderboard_stage: settings.leaderboardStage || "published",
        reward_title_en: settings.rewardTitleEn?.trim() || "",
        reward_title_ar: settings.rewardTitleAr?.trim() || ""
      })
      .eq("id", 1)
      .select("*")
      .single(),
    "Unable to save leaderboard settings"
  );
}

export async function startNewLeaderboardWeek(payload = {}) {
  const client = requireSupabase();
  return unwrap(
    await client.rpc("start_new_leaderboard_week", {
      p_label_en: payload.labelEn || null,
      p_label_ar: payload.labelAr || null,
      p_short_en: payload.shortEn || null,
      p_short_ar: payload.shortAr || null
    }),
    "Unable to start a new leaderboard week"
  );
}
