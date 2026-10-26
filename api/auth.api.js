import {
  SUPABASE_CONFIGURED,
  getAuthUser,
  getSession,
  getUserProfile,
  normalizeApiError,
  requireSupabase
} from "./client.js";

async function reconcileProfileEmail(profileRow, authUser) {
  if (!profileRow || !authUser?.id) return profileRow;
  const authEmail = String(authUser.email || "").trim().toLowerCase();
  if (!authEmail) return profileRow;
  if (String(profileRow.email || "").trim().toLowerCase() === authEmail) return profileRow;
  const client = requireSupabase();
  const { data } = await client
    .from("profiles")
    .update({ email: authEmail })
    .eq("id", authUser.id)
    .select("*")
    .single();
  return data || profileRow;
}

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

    const profileRow = await reconcileProfileEmail(await getUserProfile(data.user.id), data.user);
    if (!profileRow) {
      await client.auth.signOut();
      throw new Error("PROFILE_MISSING");
    }
    if (!["admin", "coach", "trainee"].includes(profileRow.role)) {
      await client.auth.signOut();
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
  const profileRow = await reconcileProfileEmail(await getUserProfile(session.user.id), session.user);
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
