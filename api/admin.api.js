import {
  getAuthUser,
  getLiveWeek,
  getPlatformSettings,
  getWeeks,
  invokeAccountFunction,
  mapWeek,
  requireSupabase,
  unwrap
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
    coach: coaches[0] || null,
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
  return result.user;
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
  return result.user;
}

export async function resetUserPassword(userId) {
  if (!userId) throw new Error("USER_REQUIRED");
  return invokeAccountFunction({
    action: "reset_password",
    targetUserId: userId
  });
}

export async function setUserSubscription(userId, active) {
  const client = requireSupabase();
  return unwrap(
    await client
      .from("profiles")
      .update({ subscription_active: Boolean(active), plan_unlocked: Boolean(active) })
      .eq("id", userId)
      .select("id, subscription_active, plan_unlocked")
      .single(),
    "Unable to update this user's access"
  );
}

export async function updateAdminProfile({ nameEn, nameAr, email }) {
  const client = requireSupabase();
  const user = await getAuthUser();
  if (!user) throw new Error("AUTH_REQUIRED");
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
  const client = requireSupabase();
  return unwrap(
    await client
      .from("platform_settings")
      .update({
        website_name_en: websiteNameEn?.trim(),
        website_name_ar: websiteNameAr?.trim()
      })
      .eq("id", 1)
      .select("*")
      .single(),
    "Unable to save the brand settings"
  );
}

export { mapWeek };
