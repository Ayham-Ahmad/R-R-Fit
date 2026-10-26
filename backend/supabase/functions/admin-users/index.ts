import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const CONFIGURED_ORIGINS = (Deno.env.get("APP_ORIGIN") || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174"
];
const ALLOWED_ORIGINS = CONFIGURED_ORIGINS.length ? CONFIGURED_ORIGINS : DEFAULT_ORIGINS;
const MAX_BODY_BYTES = 16_384;
const TEMP_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";

type CallerProfile = {
  id: string;
  role: "admin" | "coach" | "trainee";
  name_en: string;
  name_ar: string;
};

type AccountAction = "create_coach" | "create_trainee" | "reset_password";

type RequestBody = {
  action?: AccountAction;
  email?: string;
  password?: string;
  nameEn?: string;
  nameAr?: string;
  phone?: string;
  goalEn?: string;
  goalAr?: string;
  coachId?: string;
  targetUserId?: string;
};

function isPrivateDevOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

function corsHeadersFor(request: Request) {
  const origin = (request.headers.get("Origin") || "").replace(/\/$/, "");
  const allowOrigin =
    ALLOWED_ORIGINS.includes(origin) ||
    (!CONFIGURED_ORIGINS.length && isPrivateDevOrigin(origin))
      ? origin
      : "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    Vary: "Origin"
  };
  if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;
  return headers;
}

function cleanText(value: unknown, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function cleanPhone(value: unknown) {
  return String(value || "").replace(/[^\d]/g, "").slice(0, 20);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function generateTemporaryPassword() {
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  let password = "Rr-";
  for (const byte of bytes) {
    password += TEMP_PASSWORD_ALPHABET[byte % TEMP_PASSWORD_ALPHABET.length];
  }
  return password;
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

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return fail(401, "AUTH_REQUIRED", "Sign in before managing accounts.");
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
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
    .single<CallerProfile>();

  if (callerError || !caller) {
    return fail(403, "PROFILE_MISSING", "Your account profile is unavailable.");
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return fail(413, "BODY_TOO_LARGE", "The request body is too large.");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return fail(413, "BODY_TOO_LARGE", "The request body is too large.");
  }

  let body: RequestBody;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail(400, "INVALID_JSON", "Request body must be a JSON object.");
    }
    body = parsed as RequestBody;
  } catch {
    return fail(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const action = body.action;
  if (action === "reset_password") {
    if (caller.role !== "admin") {
      return fail(403, "ADMIN_REQUIRED", "Only an admin can reset another account password.");
    }

    const targetUserId = cleanText(body.targetUserId, 64);
    if (!validUuid(targetUserId)) {
      return fail(400, "TARGET_INVALID", "Select a valid account.");
    }

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, email, role")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetError) {
      console.error("target profile lookup failed", targetError);
      return fail(500, "TARGET_LOOKUP_FAILED", "The account could not be loaded.");
    }
    if (!target) {
      return fail(404, "TARGET_NOT_FOUND", "The account was not found.");
    }

    const temporaryPassword = generateTemporaryPassword();
    const { data: resetData, error: resetError } = await admin.auth.admin.updateUserById(
      targetUserId,
      { password: temporaryPassword }
    );

    if (resetError) {
      console.error("password reset failed", resetError);
      return fail(500, "PASSWORD_RESET_FAILED", "The password could not be reset.");
    }

    return json(200, {
      user: {
        id: target.id,
        email: resetData?.user?.email || target.email || "",
        role: target.role
      },
      password: temporaryPassword
    });
  }

  if (!action || !["create_coach", "create_trainee"].includes(action)) {
    return fail(400, "INVALID_ACTION", "Unsupported account action.");
  }

  const email = cleanText(body.email, 254).toLowerCase();
  const password = String(body.password || "");
  const nameEn = cleanText(body.nameEn);
  const nameAr = cleanText(body.nameAr);
  const phone = cleanPhone(body.phone);

  if (!validEmail(email)) {
    return fail(400, "EMAIL_INVALID", "Enter a valid email address.");
  }
  if (password.length < 10) {
    return fail(400, "PASSWORD_WEAK", "The temporary password must be at least 10 characters.");
  }
  if (!nameEn || !nameAr) {
    return fail(400, "NAMES_REQUIRED", "Both English and Arabic names are required.");
  }

  if (action === "create_coach" && caller.role !== "admin") {
    return fail(403, "ADMIN_REQUIRED", "Only an admin can create the coach account.");
  }
  if (action === "create_trainee" && !["admin", "coach"].includes(caller.role)) {
    return fail(403, "COACH_REQUIRED", "Only the coach or admin can create trainee accounts.");
  }

  if (action === "create_coach") {
    const { count, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "coach");

    if (countError) {
      return fail(500, "COACH_CHECK_FAILED", "Unable to verify the coach account.");
    }
    if ((count || 0) > 0) {
      return fail(409, "COACH_EXISTS", "A coach account already exists.");
    }
  }

  let coachId: string | null = null;
  if (action === "create_trainee") {
    if (caller.role === "coach") {
      coachId = caller.id;
    } else {
      coachId = cleanText(body.coachId) || null;
      if (!coachId) {
        return fail(400, "COACH_REQUIRED", "Select the coach who owns this trainee.");
      }
      const { data: coach, error: coachError } = await admin
        .from("profiles")
        .select("id, role")
        .eq("id", coachId)
        .eq("role", "coach")
        .maybeSingle();
      if (coachError || !coach) {
        return fail(400, "COACH_NOT_FOUND", "The selected coach account was not found.");
      }
    }
  }

  const userMetadata =
    action === "create_coach"
      ? { name_en: nameEn, name_ar: nameAr, whatsapp_phone: phone }
      : {
          name_en: nameEn,
          name_ar: nameAr,
          whatsapp_phone: phone,
          goal_en: cleanText(body.goalEn, 240),
          goal_ar: cleanText(body.goalAr, 240)
        };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata
  });

  if (createError || !created.user) {
    const message = String(createError?.message || "");
    if (/already|registered|exists/i.test(message)) {
      return fail(409, "EMAIL_EXISTS", "An account with this email already exists.");
    }
    console.error("createUser failed", createError);
    return fail(500, "USER_CREATE_FAILED", "The account could not be created.");
  }

  const createdUserId = created.user.id;
  const profileUpdate =
    action === "create_coach"
      ? {
          role: "coach",
          name_en: nameEn,
          name_ar: nameAr,
          email,
          whatsapp_phone: phone,
          coach_id: null,
          subscription_active: true,
          plan_unlocked: true
        }
      : {
          role: "trainee",
          name_en: nameEn,
          name_ar: nameAr,
          email,
          whatsapp_phone: phone,
          goal_en: cleanText(body.goalEn, 240),
          goal_ar: cleanText(body.goalAr, 240),
          coach_id: coachId,
          subscription_active: true,
          plan_unlocked: true
        };

  const { error: profileError } = await admin
    .from("profiles")
    .update(profileUpdate)
    .eq("id", createdUserId);

  if (profileError) {
    console.error("profile update failed", profileError);
    await admin.auth.admin.deleteUser(createdUserId);
    return fail(500, "PROFILE_UPDATE_FAILED", "The account could not be prepared.");
  }

  if (action === "create_coach") {
    const { error: settingsError } = await admin
      .from("platform_settings")
      .update({
        coach_name_en: nameEn,
        coach_name_ar: nameAr,
        coach_email: email,
        coach_phone: phone,
        whatsapp_phone: phone,
        main_coach_id: createdUserId
      })
      .eq("id", 1);

    if (settingsError) {
      console.error("coach settings update failed", settingsError);
      await admin.auth.admin.deleteUser(createdUserId);
      return fail(500, "SETTINGS_UPDATE_FAILED", "The coach profile could not be linked to the studio.");
    }
  }

  return json(201, {
    user: {
      id: createdUserId,
      email,
      role: action === "create_coach" ? "coach" : "trainee",
      coachId
    }
  });
});
