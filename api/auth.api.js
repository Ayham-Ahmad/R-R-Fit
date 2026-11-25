import {
  SUPABASE_CONFIGURED,
  getAuthUser,
  getSession,
  getUserProfile,
  requireSupabase,
  throwApiError
} from "./client.js";

const VALID_ROLES = ["admin", "coach", "trainee"];

async function reconcileProfileEmail(profileRow, authUser) {
  if (!profileRow || !authUser?.id) return profileRow;
  const authEmail = String(authUser.email || "").trim().toLowerCase();
  if (!authEmail) return profileRow;
  const profileEmail = String(profileRow.email || "").trim().toLowerCase();
  // Auth email changes are not confirmed until the user follows the emailed
  // link, so only fill a blank profile email; never overwrite an existing one.
  if (profileEmail === authEmail || profileEmail) return profileRow;

  const client = requireSupabase();
  const { data, error } = await client
    .from("profiles")
    .update({ email: authEmail })
    .eq("id", authUser.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || profileRow;
}

function normalizeProfile(profile) {
  if (!profile) return null;
  return {
    ...profile,
    role: profile.role,
    nameEn: profile.name_en,
    nameAr: profile.name_ar,
    email: profile.email,
    avatarStyle: profile.avatar_style,
    subscriptionActive: profile.subscription_active,
    planUnlocked: profile.plan_unlocked
  };
}

async function loadValidatedProfile(userId, authUser) {
  const profileRow = await reconcileProfileEmail(await getUserProfile(userId), authUser);
  if (!profileRow) throw new Error("PROFILE_MISSING");
  if (!VALID_ROLES.includes(profileRow.role)) throw new Error("INVALID_ROLE");
  return normalizeProfile(profileRow);
}

export async function login({ email, password }) {
  try {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email: String(email || "").trim(),
      password
    });
    if (error) throw error;
    if (!data.session || !data.user) throw new Error("INVALID_CREDENTIALS");

    let profile;
    try {
      profile = await loadValidatedProfile(data.user.id, data.user);
    } catch (error) {
      await client.auth.signOut();
      throw error;
    }

    return {
      session: data.session,
      user: data.user,
      profile
    };
  } catch (error) {
    throwApiError(error);
  }
}

export async function logout() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throwApiError(error);
}

export async function getCurrentAuth() {
  if (!SUPABASE_CONFIGURED) return { session: null, user: null, profile: null };
  try {
    const session = await getSession();
    if (!session?.user) return { session: null, user: null, profile: null };
    return {
      session,
      user: session.user,
      profile: await loadValidatedProfile(session.user.id, session.user)
    };
  } catch (error) {
    throwApiError(error);
  }
}

export async function sendPasswordReset(email, redirectTo) {
  try {
    const client = requireSupabase();
    const target = redirectTo || (typeof window !== "undefined" ? `${window.location.origin}/?mode=reset-password` : "");
    const options = target ? { redirectTo: target } : {};
    const { error } = await client.auth.resetPasswordForEmail(String(email || "").trim(), options);
    if (error) throw error;
    return true;
  } catch (error) {
    throwApiError(error);
  }
}

export async function updatePassword(password) {
  try {
    if (String(password || "").length < 10) throw new Error("PASSWORD_LENGTH");
    const client = requireSupabase();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    return true;
  } catch (error) {
    throwApiError(error);
  }
}

export async function refreshProfile() {
  const user = await getAuthUser();
  if (!user) return null;
  const profileRow = await reconcileProfileEmail(await getUserProfile(user.id), user);
  return normalizeProfile(profileRow);
}
