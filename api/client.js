import { createClient } from "@supabase/supabase-js";
import { createDrawingAvatar, createStickmanGif } from "../frontend/js/graphics.js";

const env = import.meta.env || {};
const SUPABASE_URL = String(env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = String(env.VITE_SUPABASE_ANON_KEY || "").trim();

export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      },
      global: {
        headers: { "X-Client-Info": "rr-fit-web" }
      }
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
  return supabase;
}

export function unwrap(result, fallbackMessage = "Database request failed") {
  if (result?.error) {
    const error = new Error(result.error.message || fallbackMessage);
    error.code = result.error.code;
    error.details = result.error.details;
    error.hint = result.error.hint;
    throw error;
  }
  return result?.data;
}

export function normalizePhone(phone) {
  let digits = String(phone || "").replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `966${digits.slice(1)}`;
  return digits;
}

export function formatPhone(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return "";
  if (digits.startsWith("966") && digits.length >= 12) {
    return `+966 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return `+${digits}`;
}

export function mapWeek(row) {
  if (!row) return null;
  return {
    id: row.id,
    isLive: Boolean(row.is_live),
    isPublished: Boolean(row.is_published),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    labelEn: row.label_en,
    labelAr: row.label_ar,
    shortEn: row.short_en,
    shortAr: row.short_ar
  };
}

export function mapSettings(row) {
  const settings = row || {};
  return {
    websiteNameEn: settings.website_name_en || "R&R Fit",
    websiteNameAr: settings.website_name_ar || "رنا رويال فتنيس",
    coachNameEn: settings.coach_name_en || "Coach",
    coachNameAr: settings.coach_name_ar || "المدربة",
    coachEmail: settings.coach_email || "",
    coachPhone: settings.coach_phone || "",
    whatsappPhone: normalizePhone(settings.whatsapp_phone || settings.coach_phone),
    mainCoachId: settings.main_coach_id || null,
    leaderboardEnabled: settings.leaderboard_enabled !== false,
    leaderboardPublished: settings.leaderboard_published !== false,
    strictVerification: settings.strict_verification !== false,
    leaderboardStage: settings.leaderboard_stage || "published",
    rewardTitleEn: settings.reward_title_en || "One Extra Free Fitness Class",
    rewardTitleAr: settings.reward_title_ar || "حصة تدريبية مجانية إضافية واحدة"
  };
}

function cleanExerciseDescription(value) {
  if (!value) return "";
  return String(value)
    .replace(/\s*\[ANIMATION_CODE\][\s\S]*$/i, "")
    .replace(/\s*\[ANIMATION_CODE\][\s\S]*?\[\/ANIMATION_CODE\]/gi, "")
    .trim();
}

export function mapExercise(row) {
  const presetKey = row.preset_key || "squat";
  let mediaUrl = createStickmanGif(presetKey);
  if (row.media_path) {
    if (typeof row.media_path === "string") {
      if (row.media_path.startsWith("data:") || row.media_path.startsWith("http://") || row.media_path.startsWith("https://")) {
        mediaUrl = row.media_path;
      } else if (row.media_path.startsWith("assets/") || row.media_path.startsWith("exercises/") || row.media_path.includes("/exercises/")) {
        mediaUrl = row.media_path.startsWith("/") ? row.media_path : `/${row.media_path}`;
      } else if (supabase) {
        const { data } = supabase.storage.from("exercise-media").getPublicUrl(row.media_path);
        if (data?.publicUrl) mediaUrl = data.publicUrl;
      }
    }
  }

  return {
    id: row.id,
    categoryId: row.category_id,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    descEn: cleanExerciseDescription(row.desc_en),
    descAr: cleanExerciseDescription(row.desc_ar),
    defaultSets: row.default_sets ?? 3,
    repsEn: row.reps_en || "12 reps",
    repsAr: row.reps_ar || "١٢ تكرار",
    restEn: row.rest_en || "60 sec",
    restAr: row.rest_ar || "٦٠ ثانية",
    presetKey,
    mediaPath: row.media_path || null,
    mediaUrl,
    isActive: row.is_active !== false
  };
}

export function mapCategory(row) {
  return {
    id: row.id,
    en: row.name_en,
    ar: row.name_ar,
    sortOrder: row.sort_order ?? 0
  };
}

function isoDateForDay(weekStart, dayKey) {
  if (!weekStart) return null;
  const index = DAY_KEYS.indexOf(dayKey);
  if (index < 0) return null;
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

export function mapWorkout(row) {
  return {
    uid: row.id,
    exerciseId: row.exercise_id,
    sets: row.sets,
    repsEn: row.reps_en,
    repsAr: row.reps_ar,
    restEn: row.rest_en,
    restAr: row.rest_ar,
    notesEn: row.notes_en || "",
    notesAr: row.notes_ar || "",
    status: row.status,
    verified: row.verification_status === "verified",
    verificationStatus: row.verification_status || "none",
    proofSummaryEn: row.proof_summary_en || "",
    proofSummaryAr: row.proof_summary_ar || "",
    proofWeights: row.proof_weights || "",
    proofRpe: row.proof_rpe,
    proofScreenshotPath: row.proof_screenshot_path || null,
    verificationNote: row.verification_note || "",
    weightLogEn: row.proof_weights || "",
    weightLogAr: row.proof_weights || "",
    watchLogEn: row.proof_summary_en || "",
    watchLogAr: row.proof_summary_ar || "",
    completedAt: row.completed_at,
    verifiedAt: row.verified_at,
    createdAt: row.created_at
  };
}

export function buildSchedule(workouts, daySettings, weekStart) {
  const schedule = {};
  const settingsByDay = new Map((daySettings || []).map((row) => [row.day_key, row]));

  DAY_KEYS.forEach((dayKey) => {
    schedule[dayKey] = {
      isRestDay: Boolean(settingsByDay.get(dayKey)?.is_rest_day),
      date: isoDateForDay(weekStart, dayKey),
      items: []
    };
  });

  (workouts || []).forEach((row) => {
    if (!schedule[row.day_key]) {
      schedule[row.day_key] = { isRestDay: false, date: row.scheduled_date, items: [] };
    }
    schedule[row.day_key].items.push(mapWorkout(row));
  });

  DAY_KEYS.forEach((dayKey) => {
    schedule[dayKey].items.sort((a, b) => {
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
  });

  return schedule;
}

export function mapTraineeProfile(row, { workouts = [], history = [], daySettings = [], weekStart } = {}) {
  const completed = workouts.filter((item) => item.status === "completed" && item.verification_status !== "rejected");
  const verified = workouts.filter((item) => item.verification_status === "verified");
  const pending = workouts.filter((item) => item.verification_status === "pending_review");
  const rejected = workouts.filter((item) => item.verification_status === "rejected");
  const latestProof = [...completed].sort((a, b) => {
    return new Date(b.completed_at || b.updated_at || 0) - new Date(a.completed_at || a.updated_at || 0);
  })[0];

  const schedule = buildSchedule(workouts, daySettings, weekStart);
  const seenProofs = new Set();
  const proofHistory = [...workouts, ...history]
    .filter((item) => ["completed", "skipped"].includes(item.status))
    .map((item) => ({ ...mapWorkout(item), dayKey: item.day_key }))
    .filter((item) => {
      if (seenProofs.has(item.uid)) return false;
      seenProofs.add(item.uid);
      return true;
    })
    .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  const hasPending = pending.length > 0;
  const hasVerified = verified.length > 0;
  const allCompletedVerified = completed.length > 0 && completed.every((item) => item.verification_status === "verified");

  return {
    id: row.id,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    email: row.email || "",
    whatsappPhone: normalizePhone(row.whatsapp_phone || row.phone),
    phoneDisplayEn: formatPhone(row.whatsapp_phone || row.phone),
    phoneDisplayAr: formatPhone(row.whatsapp_phone || row.phone),
    goalEn: row.goal_en || "",
    goalAr: row.goal_ar || "",
    subscriptionActive: row.subscription_active === true,
    planUnlocked: row.plan_unlocked === true,
    recurrence: row.recurrence || "weekly",
    recurrenceDays: row.recurrence_days || [],
    avatarStyle: row.avatar_style || "sara",
    avatarUrl: createDrawingAvatar(row.avatar_style || "sara"),
    schedule,
    proofHistory,
    coachVerifiedProof: allCompletedVerified || (hasVerified && !hasPending),
    proofVerified: allCompletedVerified,
    proofPending: hasPending,
    proofRejected: rejected.length > 0,
    proofSummaryEn: latestProof?.proof_summary_en || "No workout proof submitted yet",
    proofSummaryAr: latestProof?.proof_summary_ar || "لم يتم إرسال إثبات تمرين بعد",
    lastActivityEn: latestProof?.completed_at
      ? new Date(latestProof.completed_at).toLocaleString("en")
      : "No recent activity",
    lastActivityAr: latestProof?.completed_at
      ? new Date(latestProof.completed_at).toLocaleString("ar-SA-u-ca-gregory")
      : "لا يوجد نشاط حديث",
    weekId: latestProof?.week_id || null
  };
}

export function mapCoachProfile(settings) {
  return {
    nameEn: settings.coachNameEn,
    nameAr: settings.coachNameAr,
    email: settings.coachEmail,
    whatsappPhone: settings.whatsappPhone,
    phoneDisplayEn: settings.coachPhone || formatPhone(settings.whatsappPhone),
    phoneDisplayAr: settings.coachPhone || formatPhone(settings.whatsappPhone),
    avatarUrl: createDrawingAvatar("coach")
  };
}

export async function getPlatformSettings() {
  const client = requireSupabase();
  const data = unwrap(
    await client.from("platform_settings").select("*").eq("id", 1).maybeSingle(),
    "Unable to load platform settings"
  );
  if (!data) throw new Error("PLATFORM_SETTINGS_MISSING");
  return mapSettings(data);
}

export async function getCategories() {
  const client = requireSupabase();
  const data = unwrap(
    await client.from("categories").select("*").order("sort_order", { ascending: true }),
    "Unable to load exercise categories"
  );
  return (data || []).map(mapCategory);
}

export async function getExercises() {
  const client = requireSupabase();
  const data = unwrap(
    await client.from("exercises").select("*").order("created_at", { ascending: true }),
    "Unable to load exercises"
  );
  return (data || []).map(mapExercise);
}

export async function getWeeks() {
  const client = requireSupabase();
  const data = unwrap(
    await client.from("leaderboard_weeks").select("*").order("starts_on", { ascending: false }),
    "Unable to load leaderboard weeks"
  );
  return (data || []).map(mapWeek);
}

export async function getLiveWeek() {
  const client = requireSupabase();
  const data = unwrap(
    await client
      .from("leaderboard_weeks")
      .select("*")
      .eq("is_live", true)
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "Unable to load the live week"
  );
  return mapWeek(data);
}

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getAuthUser() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function getUserProfile(userId) {
  const client = requireSupabase();
  const data = unwrap(
    await client.from("profiles").select("*").eq("id", userId).maybeSingle(),
    "Unable to load your profile"
  );
  return data || null;
}

export function onAuthStateChange(callback) {
  if (!supabase) return { unsubscribe: () => {} };
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}

export async function invokeAccountFunction(payload) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("admin-users", { body: payload });
  if (error) {
    let message = error.message || "SERVER_NOT_CONFIGURED";
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
      else if (body?.message) message = body.message;
    } catch {
      // The edge function may be unreachable or returned a non-JSON response.
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function normalizeApiError(error) {
  const message = String(error?.message || error || "");
  if (/Invalid login credentials/i.test(message)) return "INVALID_CREDENTIALS";
  if (/Email not confirmed/i.test(message)) return "EMAIL_NOT_CONFIRMED";
  if (/User already registered/i.test(message)) return "EMAIL_EXISTS";
  if (/SUPABASE_NOT_CONFIGURED/i.test(message)) return "SUPABASE_NOT_CONFIGURED";
  if (/JWT expired/i.test(message)) return "SESSION_EXPIRED";
  return message || "UNKNOWN_ERROR";
}
