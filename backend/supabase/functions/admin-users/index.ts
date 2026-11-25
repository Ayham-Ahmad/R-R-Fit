import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("ANON_KEY") || "";

const CONFIGURED_ORIGINS = (Deno.env.get("APP_ORIGIN") || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://r-r-fit.pages.dev"
];
const ALLOWED_ORIGINS = CONFIGURED_ORIGINS.length ? CONFIGURED_ORIGINS : DEFAULT_ORIGINS;
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function corsHeadersFor(request: Request): Record<string, string> {
  const origin = (request.headers.get("Origin") || "").replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    Vary: "Origin"
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

function generatePassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function accountResult(
  user: { id: string; email?: string | null },
  extra: Record<string, unknown> = {}
) {
  return {
    success: true,
    userId: user.id,
    user: { id: user.id, email: user.email || "" },
    ...extra
  };
}

Deno.serve(async (request) => {
  const corsHeaders = corsHeadersFor(request);
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: corsHeaders });
  const fail = (status: number, code: string, message: string) =>
    json(status, { error: code, message });

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return fail(405, "METHOD_NOT_ALLOWED", "Use POST.");
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return fail(500, "SERVER_NOT_CONFIGURED", "Account provisioning is not configured.");
  }

  const authHeader = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return fail(401, "AUTH_REQUIRED", "Sign in before managing accounts.");
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser(token);

  if (userError || !user) {
    return fail(401, "SESSION_INVALID", "Your session is invalid or expired.");
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("id, role, name_en, name_ar")
    .eq("id", user.id)
    .single();

  if (callerError || !caller) {
    console.error("caller lookup error:", callerError);
    return fail(403, "PROFILE_MISSING", "Your account profile is unavailable.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "INVALID_JSON", "Invalid JSON body.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(400, "INVALID_JSON", "Expected a JSON object.");
  }
  const payload = body as Record<string, unknown>;

  if (payload.action === "reset_password") {
    if (caller.role !== "admin") {
      return fail(403, "ADMIN_REQUIRED", "Only admins can reset passwords.");
    }
    if (!isUuid(payload.targetUserId)) {
      return fail(400, "TARGET_INVALID", "Invalid target user.");
    }

    const targetUserId = payload.targetUserId.trim();
    const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
    if (targetError || !targetData?.user) {
      const code = targetError ? "TARGET_LOOKUP_FAILED" : "TARGET_NOT_FOUND";
      return fail(targetError ? 502 : 404, code, "Target user could not be found.");
    }

    const password = generatePassword();
    const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, { password });
    if (updateError) {
      console.error("password reset failed:", updateError);
      return fail(502, "PASSWORD_RESET_FAILED", "Unable to reset the password.");
    }

    return json(200, accountResult(targetData.user, { password }));
  }

  if (payload.action === "create_coach") {
    if (caller.role !== "admin") {
      return fail(403, "ADMIN_REQUIRED", "Only admins can create coaches.");
    }

    const { data: existingCoach, error: coachLookupError } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "coach")
      .limit(1)
      .maybeSingle();

    if (coachLookupError) {
      return fail(500, "TARGET_LOOKUP_FAILED", "Unable to check the existing coach.");
    }
    if (existingCoach) {
      return fail(409, "COACH_EXISTS", "A coach account already exists.");
    }

    const email = String(payload.email || "").trim().toLowerCase();
    const password = payload.password ? String(payload.password) : generatePassword();
    const nameEn = String(payload.nameEn || "").trim();
    const nameAr = String(payload.nameAr || "").trim();
    const phone = String(payload.phone || "").trim();

    if (!email || !nameEn || !nameAr) {
      return fail(400, "MISSING_FIELDS", "Email, English name, and Arabic name are required.");
    }
    if (password.length < 10) {
      return fail(400, "PASSWORD_WEAK", "Password must be at least 10 characters.");
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name_en: nameEn, name_ar: nameAr }
    });

    if (createError || !created.user) {
      console.error("coach user create failed:", createError);
      return fail(400, "USER_CREATE_FAILED", "Unable to create the coach account.");
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: created.user.id,
      role: "coach",
      name_en: nameEn,
      name_ar: nameAr,
      email,
      phone: phone || null
    }, { onConflict: "id" });

    if (profileError) {
      console.error("coach profile save failed:", profileError);
      try { await admin.auth.admin.deleteUser(created.user.id); } catch {}
      return fail(400, "PROFILE_UPDATE_FAILED", "Unable to save the coach profile.");
    }

    const { error: settingsError } = await admin
      .from("platform_settings")
      .update({ main_coach_id: created.user.id })
      .eq("id", 1);

    if (settingsError) {
      console.error("main coach assignment failed:", settingsError);
      try { await admin.auth.admin.deleteUser(created.user.id); } catch {}
      return fail(400, "SETTINGS_UPDATE_FAILED", "Unable to assign the main coach.");
    }

    return json(200, accountResult(created.user, { password }));
  }

  if (payload.action === "create_trainee") {
    if (caller.role !== "admin" && caller.role !== "coach") {
      return fail(403, "UNAUTHORIZED", "You do not have permission to create trainees.");
    }

    const email = String(payload.email || "").trim().toLowerCase();
    const password = payload.password ? String(payload.password) : generatePassword();
    const nameEn = String(payload.nameEn || "").trim();
    const nameAr = String(payload.nameAr || "").trim();
    const phone = String(payload.phone || "").trim();
    const goalEn = String(payload.goalEn || "").trim();
    const goalAr = String(payload.goalAr || "").trim();

    if (!email || !nameEn || !nameAr) {
      return fail(400, "MISSING_FIELDS", "Email, English name, and Arabic name are required.");
    }
    if (password.length < 10) {
      return fail(400, "PASSWORD_WEAK", "Password must be at least 10 characters.");
    }

    let coachId: string | null = null;
    if (caller.role === "coach") {
      coachId = caller.id;
    } else if (isUuid(payload.coachId)) {
      const requestedCoachId = payload.coachId.trim();
      const { data: coachProfile, error: coachError } = await admin
        .from("profiles")
        .select("id")
        .eq("id", requestedCoachId)
        .eq("role", "coach")
        .maybeSingle();
      if (coachError || !coachProfile) {
        return fail(400, "TARGET_INVALID", "The selected coach does not exist.");
      }
      coachId = requestedCoachId;
    } else if (payload.coachId) {
      return fail(400, "TARGET_INVALID", "Invalid coach selection.");
    } else {
      const { data: coachProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("role", "coach")
        .limit(1)
        .maybeSingle();
      coachId = coachProfile?.id || null;
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name_en: nameEn, name_ar: nameAr }
    });

    if (createError || !created.user) {
      console.error("trainee user create failed:", createError);
      return fail(400, "USER_CREATE_FAILED", "Unable to create the trainee account.");
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: created.user.id,
      role: "trainee",
      name_en: nameEn,
      name_ar: nameAr,
      email,
      phone: phone || null,
      coach_id: coachId,
      goal_en: goalEn || null,
      goal_ar: goalAr || null
    }, { onConflict: "id" });

    if (profileError) {
      console.error("trainee profile save failed:", profileError);
      try { await admin.auth.admin.deleteUser(created.user.id); } catch {}
      return fail(400, "PROFILE_UPDATE_FAILED", "Unable to save the trainee profile.");
    }

    return json(200, accountResult(created.user, { password }));
  }

  return fail(400, "UNKNOWN_ACTION", "Unknown action.");
});
