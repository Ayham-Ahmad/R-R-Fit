// cleanup-proofs
//
// Deletes workout proof images from Storage after their retention window while
// keeping the workout record, status, comment, and coach note intact.
//
//   * verified / rejected proofs  -> image removed 3 days after the decision
//   * unreviewed proofs           -> image removed 14 days after completion
//
// Only the service role (or a caller with CLEANUP_SECRET) may run this job.
// Deploy with: supabase functions deploy cleanup-proofs
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

type ProofRow = {
  id: string;
  trainee_id: string;
  proof_screenshot_path: string;
  verification_status: string;
  verified_at: string | null;
  completed_at: string | null;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function decodeJwtRole(token: string): string {
  try {
    const payload = token.split(".")[1];
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const parsed = JSON.parse(atob(padded));
    return String(parsed.role || "");
  } catch {
    return "";
  }
}

function isAuthorized(request: Request): boolean {
  const secretHeader = request.headers.get("x-cleanup-secret") || "";
  if (CLEANUP_SECRET && secretHeader && secretHeader === CLEANUP_SECRET) {
    return true;
  }
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (SERVICE_ROLE_KEY && token === SERVICE_ROLE_KEY) return true;
  return decodeJwtRole(token) === "service_role";
}

async function runCleanup() {
  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const now = Date.now();
  const reviewedCutoff = new Date(now - REVIEWED_RETENTION_DAYS * 86400000).toISOString();
  const unreviewedCutoff = new Date(now - UNREVIEWED_RETENTION_DAYS * 86400000).toISOString();

  const reviewed = await client
    .from("scheduled_workouts")
    .select("id, trainee_id, proof_screenshot_path, verification_status, verified_at, completed_at")
    .not("proof_screenshot_path", "is", null)
    .in("verification_status", ["verified", "rejected"])
    .lte("verified_at", reviewedCutoff)
    .limit(BATCH_SIZE);

  if (reviewed.error) throw new Error(reviewed.error.message);

  const unreviewed = await client
    .from("scheduled_workouts")
    .select("id, trainee_id, proof_screenshot_path, verification_status, verified_at, completed_at")
    .not("proof_screenshot_path", "is", null)
    .eq("verification_status", "pending_review")
    .lte("completed_at", unreviewedCutoff)
    .limit(BATCH_SIZE);

  if (unreviewed.error) throw new Error(unreviewed.error.message);

  const rows = [...(reviewed.data || []), ...(unreviewed.data || [])] as ProofRow[];
  if (!rows.length) {
    return { reviewed: 0, unreviewed: 0, purged: 0, hasMore: false };
  }

  const paths = rows.map((row) => row.proof_screenshot_path).filter(Boolean);
  if (paths.length) {
    // Storage API remove is idempotent enough; ignore missing objects.
    await client.storage.from("workout-proofs").remove(paths);
  }

  let purged = 0;
  for (const row of rows) {
    const { error } = await client
      .from("scheduled_workouts")
      .update({
        proof_screenshot_path: null,
        proof_purged_at: new Date().toISOString()
      })
      .eq("id", row.id)
      .eq("proof_screenshot_path", row.proof_screenshot_path);
    if (!error) purged += 1;
  }

  return {
    reviewed: reviewed.data?.length || 0,
    unreviewed: unreviewed.data?.length || 0,
    purged,
    hasMore: (reviewed.data?.length || 0) >= BATCH_SIZE || (unreviewed.data?.length || 0) >= BATCH_SIZE
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") {
    return json(405, { error: "METHOD_NOT_ALLOWED" });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { error: "NOT_CONFIGURED", message: "Supabase service credentials are missing." });
  }
  if (!isAuthorized(request)) {
    return json(401, { error: "UNAUTHORIZED" });
  }

  try {
    const summary = await runCleanup();
    console.log("cleanup-proofs result", summary);
    return json(200, { ok: true, ...summary });
  } catch (error) {
    console.error("cleanup-proofs failed", error);
    return json(500, { error: "CLEANUP_FAILED", message: String(error?.message || error) });
  }
});
