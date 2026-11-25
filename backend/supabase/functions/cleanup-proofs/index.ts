// cleanup-proofs
//
// Deletes workout proof images from Storage after their retention window while
// keeping the workout record, status, comment, and coach note intact.
//
//   * verified / rejected proofs  -> image removed 3 days after the decision
//   * unreviewed proofs           -> image removed 14 days after completion
//
// Only a caller with CLEANUP_SECRET or a configured server-side service key
// may run this job. Never trust a JWT payload decoded from a request — it is
// unsigned and can be forged. Deploy with:
//   supabase functions deploy cleanup-proofs --no-verify-jwt
// Schedule it with the SQL in sql/schedule_cleanup.sql.

import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  || Deno.env.get("SERVICE_ROLE_KEY")
  || "";
const CLEANUP_SECRET = Deno.env.get("CLEANUP_SECRET") || "";

const REVIEWED_RETENTION_DAYS = 3;
const UNREVIEWED_RETENTION_DAYS = 14;
const BATCH_SIZE = 200;
const MAX_BATCHES = 10;

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

type ProofRow = {
  id: string;
  trainee_id: string;
  proof_screenshot_path: string;
  verification_status: string;
  verified_at: string | null;
  completed_at: string | null;
};

type CleanupTotals = {
  reviewed: number;
  unreviewed: number;
  purged: number;
  failed: number;
  batches: number;
  hasMore: boolean;
};

function corsHeadersFor(request: Request): Record<string, string> {
  const origin = (request.headers.get("Origin") || "").replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cleanup-secret",
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

function collectSecretKeys(): string[] {
  const keys = new Set<string>();
  const legacy = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || Deno.env.get("SERVICE_ROLE_KEY")
    || "").trim();
  if (legacy) keys.add(legacy);

  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const value of Object.values(parsed)) {
          if (typeof value === "string" && value.trim()) keys.add(value.trim());
        }
      }
    } catch (error) {
      console.error("Could not parse SUPABASE_SECRET_KEYS", error);
    }
  }
  return [...keys];
}

function authorize(request: Request): { ok: boolean; reason?: string } {
  const provided = (request.headers.get("x-cleanup-secret") || "").trim();

  // Preferred path: a dedicated shared secret. Works independently of API
  // key formats, key rotation, and the platform JWT check (when verify_jwt
  // is disabled for this function).
  if (CLEANUP_SECRET) {
    if (provided && provided === CLEANUP_SECRET) return { ok: true };
  } else if (provided) {
    return { ok: false, reason: "CLEANUP_SECRET_NOT_CONFIGURED" };
  }

  // Fallback paths: service role API keys.
  // New sb_secret_... keys must be sent on `apikey`; legacy service_role
  // JWTs are sent on `Authorization: Bearer`. Accept either header.
  const apiKey = (request.headers.get("apikey") || "").trim();
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!apiKey && !token) {
    return {
      ok: false,
      reason: CLEANUP_SECRET ? "MISSING_CREDENTIALS" : "CLEANUP_SECRET_NOT_CONFIGURED"
    };
  }

  // Exact match against keys configured on the server. A JWT payload decoded
  // from the request is NOT evidence of authority: anyone can craft one.
  for (const key of collectSecretKeys()) {
    if (apiKey && apiKey === key) return { ok: true };
    if (token && token === key) return { ok: true };
  }

  return { ok: false, reason: "BAD_CREDENTIALS" };
}

async function runCleanup(): Promise<CleanupTotals> {
  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const now = Date.now();
  const reviewedCutoff = new Date(now - REVIEWED_RETENTION_DAYS * 86400000).toISOString();
  const unreviewedCutoff = new Date(now - UNREVIEWED_RETENTION_DAYS * 86400000).toISOString();
  const reviewedCutoffMs = Date.parse(reviewedCutoff);
  const unreviewedCutoffMs = Date.parse(unreviewedCutoff);

  const totals: CleanupTotals = {
    reviewed: 0,
    unreviewed: 0,
    purged: 0,
    failed: 0,
    batches: 0,
    hasMore: false
  };

  const selectFields =
    "id, trainee_id, proof_screenshot_path, verification_status, verified_at, completed_at";

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    totals.batches = batch + 1;

    const reviewed = await client
      .from("scheduled_workouts")
      .select(selectFields)
      .not("proof_screenshot_path", "is", null)
      .is("proof_purged_at", null)
      .in("verification_status", ["verified", "rejected"])
      .or(`verified_at.lte.${reviewedCutoff},completed_at.lte.${reviewedCutoff}`)
      .limit(BATCH_SIZE);

    if (reviewed.error) throw new Error(reviewed.error.message);

    const unreviewed = await client
      .from("scheduled_workouts")
      .select(selectFields)
      .not("proof_screenshot_path", "is", null)
      .is("proof_purged_at", null)
      .eq("verification_status", "pending_review")
      .lte("completed_at", unreviewedCutoff)
      .limit(BATCH_SIZE);

    if (unreviewed.error) throw new Error(unreviewed.error.message);

    const reviewedRows = ((reviewed.data || []) as ProofRow[]).filter((row) => {
      const decisionAt = Date.parse(row.verified_at || row.completed_at || "");
      return Number.isFinite(decisionAt) && decisionAt <= reviewedCutoffMs;
    });
    const unreviewedRows = ((unreviewed.data || []) as ProofRow[]).filter((row) => {
      const completedAt = Date.parse(row.completed_at || "");
      return Number.isFinite(completedAt) && completedAt <= unreviewedCutoffMs;
    });

    const seen = new Set<string>();
    const rows = [...reviewedRows, ...unreviewedRows].filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    if (!rows.length) {
      totals.hasMore = false;
      break;
    }

    const paths = rows.map((row) => row.proof_screenshot_path).filter(Boolean);
    const { error: removeError } = paths.length
      ? await client.storage.from("workout-proofs").remove(paths)
      : { error: null };

    if (removeError) {
      throw new Error("Unable to remove proof objects from storage");
    }

    for (const row of rows) {
      const { error } = await client
        .from("scheduled_workouts")
        .update({
          proof_screenshot_path: null,
          proof_purged_at: new Date().toISOString()
        })
        .eq("id", row.id)
        .eq("proof_screenshot_path", row.proof_screenshot_path);
      if (error) {
        totals.failed += 1;
      } else {
        totals.purged += 1;
      }
    }

    totals.reviewed += reviewedRows.length;
    totals.unreviewed += unreviewedRows.length;

    const hasMore = reviewedRows.length >= BATCH_SIZE || unreviewedRows.length >= BATCH_SIZE;
    if (!hasMore) {
      totals.hasMore = false;
      break;
    }

    if (batch === MAX_BATCHES - 1) {
      totals.hasMore = true;
    }
  }

  return totals;
}

Deno.serve(async (request) => {
  const corsHeaders = corsHeadersFor(request);
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: corsHeaders });

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json(405, { error: "METHOD_NOT_ALLOWED" });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { error: "NOT_CONFIGURED", message: "Supabase service credentials are missing." });
  }

  const auth = authorize(request);
  if (!auth.ok) {
    return json(401, { error: "UNAUTHORIZED", reason: auth.reason || "UNKNOWN" });
  }

  try {
    const summary = await runCleanup();
    return json(200, { ok: true, ...summary });
  } catch (error) {
    console.error("cleanup-proofs failed", error);
    return json(500, { error: "CLEANUP_FAILED" });
  }
});
