import {
  getAuthUser,
  getLiveWeek,
  getPlatformSettings,
  getUserProfile,
  getWeeks,
  invokeAccountFunction,
  requireSupabase,
  setProfileAccess,
  unwrap,
  updatePlatformSettings
} from "./client.js";

function mapUser(row) {
  const nameEn = row.name_en || "Unnamed user";
  const nameAr = row.name_ar || "مستخدمة بدون اسم";
  return {
    id: row.id,
    role: row.role,
    nameEn,
    nameAr,
    email: row.email || "",
    phone: row.whatsapp_phone || row.phone || "",
    goalEn: row.goal_en || "",
    goalAr: row.goal_ar || "",
    subscriptionActive: row.subscription_active === true,
    planUnlocked: row.plan_unlocked === true,
    coachId: row.coach_id,
    avatarStyle: row.avatar_style || "sara",
    createdAt: row.created_at,
    initials: nameEn
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("")
  };
}

// The edge function has used both userId and user.id over time; normalize them
// into the shape the UI consumes.
function mapAccountResult(result, fallbackEmail = "") {
  const user = result?.user && typeof result.user === "object" ? result.user : {};
  const id = user.id || result?.userId || null;
  const email = user.email || result?.email || fallbackEmail;
  if (!id) throw new Error("USER_CREATE_FAILED");
  return { ...user, id, email };
}

export async function loadAdminWorkspace() {
  const client = requireSupabase();
  const [settings, usersResult, weeks, currentWeek] = await Promise.all([
    getPlatformSettings(),
    client
      .from("profiles")
      .select(
        "id, role, name_en, name_ar, email, phone, whatsapp_phone, goal_en, goal_ar, subscription_active, plan_unlocked, coach_id, avatar_style, created_at"
      )
      .order("created_at", { ascending: false }),
    getWeeks(),
    getLiveWeek()
  ]);

  const users = (unwrap(usersResult, "Unable to load users") || []).map(mapUser);
  const coaches = users.filter((user) => user.role === "coach");
  const trainees = users.filter((user) => user.role === "trainee");
  const admins = users.filter((user) => user.role === "admin");

  let pendingProofs = 0;
  let verifiedWorkouts = 0;
  let totalWorkouts = 0;
  if (currentWeek) {
    const workoutsResult = await client
      .from("scheduled_workouts")
      .select("id, status, verification_status")
      .eq("week_id", currentWeek.id);
    const workouts = unwrap(workoutsResult, "Unable to load workout statistics") || [];
    pendingProofs = workouts.filter((row) => row.verification_status === "pending_review").length;
    verifiedWorkouts = workouts.filter((row) => row.verification_status === "verified").length;
    totalWorkouts = workouts.length;
  }

  const recentUsers = [...users]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5);

  return {
    settings,
    users,
    admins,
    coaches,
    trainees,
    coach: coaches.find((coach) => coach.id === settings.mainCoachId) || coaches[0] || null,
    currentWeek,
    weeks,
    stats: {
      totalUsers: users.length,
      totalTrainees: trainees.length,
      totalCoaches: coaches.length,
      activeSubscriptions: trainees.filter((user) => user.subscriptionActive && user.planUnlocked).length,
      pendingProofs,
      verifiedWorkouts,
      totalWorkouts
    },
    recentUsers
  };
}

export async function createCoachAccount({ email, password, nameEn, nameAr, phone }) {
  const result = await invokeAccountFunction({
    action: "create_coach",
    email,
    password,
    nameEn,
    nameAr,
    phone
  });
  return mapAccountResult(result, email);
}

export async function createTraineeAccount({ email, password, nameEn, nameAr, phone, goalEn, goalAr, coachId = null }) {
  const result = await invokeAccountFunction({
    action: "create_trainee",
    email,
    password,
    nameEn,
    nameAr,
    phone,
    goalEn,
    goalAr,
    coachId
  });
  return mapAccountResult(result, email);
}

export async function resetUserPassword(userId) {
  if (!userId) throw new Error("TARGET_INVALID");
  const result = await invokeAccountFunction({
    action: "reset_password",
    targetUserId: userId
  });
  if (!result || result.success !== true) throw new Error("PASSWORD_RESET_FAILED");
  const user = mapAccountResult(result);
  if (!user.email || !result.password) throw new Error("PASSWORD_RESET_FAILED");
  return {
    ...result,
    userId: user.id,
    user,
    password: result.password
  };
}

export async function setUserSubscription(userId, active) {
  return setProfileAccess(userId, active);
}

export async function updateAdminProfile({ nameEn, nameAr, email }) {
  const client = requireSupabase();
  const user = await getAuthUser();
  if (!user) throw new Error("AUTH_REQUIRED");
  const actor = await getUserProfile(user.id);
  if (actor?.role !== "admin") throw new Error("ADMIN_REQUIRED");

  const nextEmail = email?.trim().toLowerCase() || user.email;
  let emailConfirmationRequired = false;
  let profileEmail = user.email || "";
  if (nextEmail && nextEmail !== String(user.email || "").toLowerCase()) {
    const { data, error } = await client.auth.updateUser({ email: nextEmail });
    if (error) throw new Error(/already|registered/i.test(error.message) ? "EMAIL_EXISTS" : error.message);
    const confirmedEmail = String(data?.user?.email || "").trim().toLowerCase();
    if (confirmedEmail === nextEmail) {
      profileEmail = nextEmail;
    } else {
      emailConfirmationRequired = true;
    }
  }
  const profile = unwrap(
    await client
      .from("profiles")
      .update({
        name_en: nameEn?.trim(),
        name_ar: nameAr?.trim(),
        email: profileEmail
      })
      .eq("id", user.id)
      .select("*")
      .single(),
    "Unable to update the admin profile"
  );
  return { profile, emailConfirmationRequired };
}

export async function saveAdminBrandSettings({ websiteNameEn, websiteNameAr }) {
  if (!websiteNameEn?.trim() || !websiteNameAr?.trim()) throw new Error("BRAND_NAMES_REQUIRED");
  return updatePlatformSettings(
    {
      website_name_en: websiteNameEn.trim(),
      website_name_ar: websiteNameAr.trim()
    },
    "Unable to save the brand settings"
  );
}
