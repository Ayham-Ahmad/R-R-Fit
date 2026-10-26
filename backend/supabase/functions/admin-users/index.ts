import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

type CallerProfile = {
  id: string;
  role: "admin" | "coach" | "trainee";
  name_en: string;
  name_ar: string;
};

type RequestBody = {
  action?: "create_coach" | "create_trainee";
  email?: string;
  password?: string;
  nameEn?: string;
  nameAr?: string;
  phone?: string;
  goalEn?: string;
  goalAr?: string;
  coachId?: string;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function fail(status: number, code: string, message: string) {
  return json(status, { error: code, message });
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    return fail(401, "AUTH_REQUIRED", "Sign in before creating accounts.");
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

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return fail(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const action = body.action;
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
