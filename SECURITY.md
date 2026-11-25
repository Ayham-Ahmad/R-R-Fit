# Security Policy

R&R Fit is a live application. If you find a security issue, please report it
privately so it can be fixed before details are made public.

## Reporting a vulnerability

Email **ayhamshahada03@gmail.com** with:

- A description of the issue and the affected URL, table, bucket, or endpoint.
- Steps to reproduce (a minimal example is ideal).
- The potential impact (e.g. can another user's data be read or changed?).

Please do **not** open a public GitHub issue for security reports. You should
receive an acknowledgement within a few days. Once the issue is resolved,
I'll let you know and, if you'd like, credit you in the release notes.

## Scope

- The live app at https://r-r-fit.pages.dev/
- This repository, including the Supabase schema, migrations, RLS policies,
  Edge Functions, and the frontend/API code.

## Key rotation checklist

Rotate credentials in this order, then verify the whole backend:

1. **Supabase service role key** — generate a new key in the Supabase Dashboard,
   update `SUPABASE_SERVICE_ROLE_KEY` in `.env` and in the Edge Function secrets
   (legacy alias `SERVICE_ROLE_KEY`), and remove the old key from every location.
2. **Direct Postgres URL** — rotate the database password, update
   `SUPABASE_DB_URL` (or legacy `DATABASE_URL`) in `.env`, and confirm
   `npm run backend:apply -- --dry-run` still parses cleanly.
3. **`CLEANUP_SECRET` / Vault** — generate a fresh secret, set it as the
   `cleanup-proofs` Edge Function secret, and replace the `cleanup_secret` entry
   in Vault using `sql/schedule_cleanup.sql`. The cron job must use the shared
   secret, never the service key.
4. **Edge Functions** — redeploy `admin-users` and `cleanup-proofs` so they pick
   up the new secrets, then confirm each function's health from the Dashboard.
5. **Cron verification** — check `cron.job` for the active
   `cleanup-workout-proofs` schedule and inspect the latest `net._http_response`
   row for a successful status code (see `sql/schedule_cleanup.sql`).
6. **Re-validate** — run `npm run backend:validate:strict` (equivalent to
   `backend/scripts/verify_db.py --validate --strict`) and resolve every error
   before considering the rotation complete.

Never place service-role credentials in `VITE_*` variables or frontend code.

## Please avoid

- Testing against real trainee accounts or personal data. Use your own demo
  accounts only.
- Denial-of-service, brute-force, or automated mass scanning.
- Reporting issues in third-party services (Supabase, Cloudflare) here — those
  should go to the vendor's own security program.
