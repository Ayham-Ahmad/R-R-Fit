import {
  SUPABASE_CONFIGURED,
  getAuthUser,
  getSession,
  getUserProfile,
  normalizeApiError,
  requireSupabase
} from "./client.js";

export function normalizeProfile(profile) {
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

export async function login({ email, password }) {
  try {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email: String(email || "").trim(),
      password
    });
    if (error) throw error;
    if (!data.session || !data.user) throw new Error("INVALID_CREDENTIALS");

    const profileRow = await getUserProfile(data.user.id);
    if (!profileRow) throw new Error("PROFILE_MISSING");
    if (!["admin", "coach", "trainee"].includes(profileRow.role)) {
      throw new Error("INVALID_ROLE");
    }

    return {
      session: data.session,
      user: data.user,
      profile: normalizeProfile(profileRow)
    };
  } catch (error) {
    throw new Error(normalizeApiError(error));
  }
}

export async function logout() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw new Error(normalizeApiError(error));
}

export async function getCurrentAuth() {
  if (!SUPABASE_CONFIGURED) return { session: null, user: null, profile: null };
  const session = await getSession();
  if (!session?.user) return { session: null, user: null, profile: null };
  const profileRow = await getUserProfile(session.user.id);
  return {
    session,
    user: session.user,
    profile: normalizeProfile(profileRow)
  };
}

export async function sendPasswordReset(email) {
  try {
    const client = requireSupabase();
    const { error } = await client.auth.resetPasswordForEmail(String(email || "").trim(), {
      redirectTo: `${window.location.origin}/?mode=reset-password`
    });
    if (error) throw error;
    return true;
  } catch (error) {
    throw new Error(normalizeApiError(error));
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
    throw new Error(normalizeApiError(error));
  }
}

export async function refreshProfile() {
  const user = await getAuthUser();
  const profileRow = await getUserProfile(user.id);
  return normalizeProfile(profileRow);
}
