import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("ANON_KEY") || "";
console.log("env check:", { hasUrl: !!SUPABASE_URL, hasService: !!SERVICE_ROLE_KEY, hasAnon: !!ANON_KEY });
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

function corsHeadersFor(request: Request) {
  const origin = (request.headers.get("Origin") || "").replace(/\/$/, "");
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
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
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const {
    data: { user },
    error: userError
  } = await userClient.auth.getUser();

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
    return fail(403, "PROFILE_MISSING", callerError?.message || "Your account profile is unavailable.");
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail(400, "INVALID_JSON", "Invalid JSON body.");
  }

  if (body.action === "create_coach") {
    if (caller.role !== "admin") {
      return fail(403, "ADMIN_REQUIRED", "Only admins can create coaches.");
    }
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || crypto.randomUUID();
    const nameEn = (body.nameEn || "").trim();
    const nameAr = (body.nameAr || "").trim();
    const phone = (body.phone || "").trim();

    if (!email || !nameEn || !nameAr) {
      return fail(400, "MISSING_FIELDS", "Email, English name, and Arabic name are required.");
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name_en: nameEn, name_ar: nameAr }
    });

    if (createError || !created.user) {
      return fail(400, "CREATE_FAILED", createError?.message || "Failed to create user.");
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
      try { await admin.auth.admin.deleteUser(created.user.id); } catch {}
      return fail(400, "PROFILE_FAILED", profileError.message);
    }

    return json(200, { success: true, userId: created.user.id });
  }

  if (body.action === "create_trainee") {
    if (caller.role !== "admin" && caller.role !== "coach") {
      return fail(403, "UNAUTHORIZED", "You do not have permission to create trainees.");
    }
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || crypto.randomUUID();
    const nameEn = (body.nameEn || "").trim();
    const nameAr = (body.nameAr || "").trim();
    const phone = (body.phone || "").trim();
    const coachId = caller.role === "coach" ? caller.id : (body.coachId || caller.id);

    if (!email || !nameEn || !nameAr) {
      return fail(400, "MISSING_FIELDS", "Email, English name, and Arabic name are required.");
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name_en: nameEn, name_ar: nameAr }
    });

    if (createError || !created.user) {
      return fail(400, "CREATE_FAILED", createError?.message || "Failed to create user.");
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: created.user.id,
      role: "trainee",
      name_en: nameEn,
      name_ar: nameAr,
      email,
      phone: phone || null,
      coach_id: coachId
    }, { onConflict: "id" });

    if (profileError) {
      try { await admin.auth.admin.deleteUser(created.user.id); } catch {}
      return fail(400, "PROFILE_FAILED", profileError.message);
    }

    return json(200, { success: true, userId: created.user.id });
  }

  return fail(400, "UNKNOWN_ACTION", "Unknown action.");
});
