# Backend cleanup report

Date: 2026-11-25  
Scope: backend only. No commits were made.

## 1. Objective

The requested work was a repair/cleanup pass for the R&R Fit backend:

- fix broken or incomplete backend behavior;
- remove unused, duplicated, stale, or dangerous code;
- align documentation and tooling with the real apply path;
- preserve every API export imported by `frontend/js/app.js`;
- do not introduce new product features;
- do not touch `frontend/**`;
- do not commit anything.

The frontend worktree already had unrelated changes in it, and an unrelated staged deletion of `assets/brand/logo-original.png` appeared during the session. None of those files were edited, reverted, staged, or committed by this work.

## 2. High-level approach

I treated `backend/supabase/migrations/` as the canonical apply path and the top-level snapshots (`schema.sql`, `rls_policies.sql`, `rpc_functions.sql`) as documentation that must mirror final migrated state.

The work was split into three areas:

1. API-layer repair across the six `api/*.js` modules.
2. SQL, migration, RLS, RPC, Edge Function, and cron cleanup.
3. Backend tooling, environment, and documentation cleanup.

After implementation, I did a combined compatibility review and corrected one decision that would have changed product behavior: I initially tightened `protect_platform_fields()` so only admins could change leaderboard settings, then reverted that because the existing coach UI owns the leaderboard-management page. The final trigger still protects brand and coach assignment, while coaches continue to manage leaderboard rules.

## 3. Files changed

### Created

- `backend/supabase/migrations/20261125000100_finalize_backend.sql`
- `backend/supabase/migrations/20261125000200_seed_exercises.sql`
- `scripts/run_backend_py.mjs`
- `backend.md` — this report.

### Modified

- `.env.example`
- `.gitignore`
- `README.md`
- `SECURITY.md`
- `package.json`
- `backend/requirements.txt`
- `backend/scripts/verify_db.py`
- `backend/supabase/config.toml`
- `backend/supabase/seed.sql`
- `backend/supabase/schema.sql`
- `backend/supabase/rls_policies.sql`
- `backend/supabase/rpc_functions.sql`
- `backend/supabase/migrations/20261026000300_fix_brand_name_ar.sql`
- `backend/supabase/migrations/20261123000100_lock_proof_metadata.sql`
- `backend/supabase/functions/admin-users/index.ts`
- `backend/supabase/functions/cleanup-proofs/index.ts`
- `api/client.js`
- `api/auth.api.js`
- `api/admin.api.js`
- `api/coach.api.js`
- `api/trainee.api.js`
- `api/leaderboard.api.js`
- `sql/fix_exercises.sql`
- `sql/schedule_cleanup.sql`

### Deleted

- `scripts/check_db_access.mjs`
- `sql/relax_proof_requirements.sql`
- `sql/proof_channels_and_cleanup.sql`
- `sql/update_media_paths.sql`
- `sql/clean_animation_codes.sql`

### Deliberately not touched

- `frontend/index.html`
- `frontend/js/app.js`
- `frontend/js/i18n.js`
- `frontend/js/extra-i18n.js`
- `frontend/js/extra-i18n-2.js`
- `frontend/styles/main.css`
- `frontend/styles/redesign.css`
- `assets/brand/logo-original.png`

These were unrelated worktree/index changes. I only read `frontend/js/app.js` as a compatibility reference for API imports and UI behavior.

## 4. API layer changes

### `api/client.js`

Added shared helpers and removed duplication:

- Exported `DEFAULT_PLATFORM_SETTINGS` because the current `frontend/js/app.js` imports it.
- Made the Supabase client private; callers now use `requireSupabase()`.
- Added `createApiError()` and `throwApiError()` so failures keep a human-readable message while gaining a stable `code`.
- Added `setProfileAccess()` for subscription/plan updates shared by admin and coach flows.
- Added `updatePlatformSettings()` as the single writer for the singleton settings row (`id = 1`). It validates the patch and trims string values.
- Added `getProofSignedUrl()` as the single signed-URL helper for `workout-proofs`.
- Added `mapArchive()` as the shared archive-row mapper.
- Made internal-only mappers/helpers private where nothing imported them: `formatPhone`, `mapSettings`, `normalizeLinks`, `mapCategory`, `mapWorkout`.
- Updated `invokeAccountFunction()` to throw normalized errors instead of raw strings.

Compatibility was checked: every API import in `frontend/js/app.js` still resolves to an exported symbol.

### `api/auth.api.js`

- Made `normalizeProfile()` private.
- Added `VALID_ROLES` and `loadValidatedProfile()` so `admin`, `coach`, and `trainee` are validated consistently during login/current-auth loading.
- Changed `reconcileProfileEmail()` to only fill a blank profile email. It no longer overwrites an existing profile email with an unconfirmed auth-email change.
- Added a safe `redirectTo` argument to `sendPasswordReset()` and guarded `window` access so the function can be used outside a browser context.
- Replaced manual `new Error(normalizeApiError(...))` wrapping with `throwApiError()`.
- `refreshProfile()` now handles a missing user instead of dereferencing `null`.

### `api/admin.api.js`

- Added `mapAccountResult()` to normalize Edge Function responses that may use `userId`, `user.id`, or both.
- `createCoachAccount()` and `createTraineeAccount()` now return the normalized user object expected by the UI.
- `resetUserPassword()` now validates the result, requires a generated password, and returns `{ userId, user, password, ... }` in the shape the modal expects.
- `loadAdminWorkspace()` now selects the configured main coach when available instead of blindly selecting the first coach.
- Added an admin role check before allowing admin profile updates.
- Replaced duplicated subscription and settings writers with the shared helpers.
- Removed the unused `mapWeek` re-export.

### `api/coach.api.js`

- Added exercise preset validation against the six DB-allowed keys: `squat`, `hipthrust`, `plank`, `latpulldown`, `shoulderpress`, `cardio`.
- Added media-path validation for both uploaded Storage paths and bundled `exercises/ex_exN.svg` paths.
- `createExercise()` now defaults `preset_key` to `squat` instead of sending `null`, which previously violated the `NOT NULL` check constraint.
- `updateExercise()` now validates `presetKey` and `mediaPath` instead of passing arbitrary values through.
- Added `removeStorageObject()` so Storage cleanup failures are surfaced instead of being silently ignored.
- Added `requireCoachManageTrainee()` for defense-in-depth before coach mutations.
- Added explicit authentication/error checks for approval and activity-event writes.
- Replaced raw `Date.now()` avatar names with `crypto.randomUUID()`.
- Removed duplicated workspace data that the UI already gets from the leaderboard workspace:
  - `previousWinners`
  - `saasCoaches`
- Added rollback error checks for day-setting and workout mutations.
- Replaced direct settings SQL with `updatePlatformSettings()`.
- Removed dead exports: `getWorkoutProofDetails` and `buildSchedule`.

### `api/trainee.api.js`

- Added `removeProofObject()` and used it for proof upload rollback.
- `getTraineeCoachProfile()` now filters certificates by `platform_settings.main_coach_id` when configured.
- `submitWhatsAppProof()` now loads the existing workout first and removes any old screenshot object after switching channels, preventing orphaned proof files.
- Removed the duplicate `getProofScreenshotUrl()` helper; the leaderboard API now owns it via the shared client helper.

### `api/leaderboard.api.js`

- Uses shared `mapArchive` and `getProofSignedUrl` helpers.
- `loadLeaderboard()` now returns `activeWeek: null` when a requested week id is not found.
- `reviewWorkoutProof()` now checks authentication, trainee lookup, and activity-event write errors.
- `saveLeaderboardSettings()` validates `leaderboardStage` against the DB constraint values (`calculating`, `published`, `closed`).
- Preserved the original behavior of writing `strict_verification`, `leaderboard_stage`, the enabled/published flags, and reward text. This was a deliberate correction after review: coach users are expected to manage the leaderboard settings page.

## 5. SQL and migration changes

### Canonical apply path

The apply path is now:

1. Apply every file in `backend/supabase/migrations/*.sql` in strict filename order.
2. Apply `backend/supabase/seed.sql` only when explicitly requested.

`backend/scripts/verify_db.py --apply` no longer applies the top-level snapshots and never applies `seed.sql`.

### `20261125000100_finalize_backend.sql`

New final-state migration. It re-applies objects that could have been overwritten by the old snapshot-based apply path and closes remaining hardening gaps.

It contains:

- helper function privilege cleanup:
  - revoke `EXECUTE` from `PUBLIC` for `current_user_role`, `is_admin`, `is_coach_or_admin`, `has_plan_access`, `can_manage_trainee`, and `is_proof_path_locked`;
  - grant `EXECUTE` to `authenticated` and `service_role`.
- a guarded `has_plan_access(uuid)`:
  - returns `false` for null ids;
  - allows `service_role` when there is no authenticated user;
  - only lets a user probe another profile if they are an admin or that user's coach;
  - otherwise returns the profile's `subscription_active AND plan_unlocked`.
- a recurrence-day backfill and check constraint:
  - invalid/null values become `['mon','wed','thu','sat']`;
  - only `mon`–`sun` are allowed and null array elements are rejected.
- `protect_platform_fields()` restored to its product behavior:
  - admins/service role may change anything;
  - everyone else may not change `website_name_en`, `website_name_ar`, or `main_coach_id`;
  - leaderboard fields remain coach-managed, matching the UI.
- final `enforce_workout_proof_rules()`:
  - validates proof paths before review logic;
  - verifies the screenshot exists in `storage.objects` when the path changes;
  - processes coach/admin verification **before** the finalized lock, fixing the bug where a coach note or rejection on an already `completed` workout raised `Finalized workout results are locked`;
  - expands the finalized lock to include `verification_status`, `verification_note`, `verified_by`, `verified_at`, and `proof_purged_at`;
  - expands the trainee assignment lock to include the same verification metadata;
  - keeps trainees from verifying/rejecting their own proof;
  - preserves the app/WhatsApp channel behavior and screenshot requirement for app submissions.
- tighter storage insert policy for `workout-proofs`:
  - path must be `<trainee-uuid>/<workout-uuid>-<timestamp>.webp|jpg`.
- `get_leaderboard_archive()`:
  - uses `coalesce(w.short_en, lw.week_en)` and the Arabic equivalent so archived winners keep labels after a source week is deleted.
- `start_new_leaderboard_week()`:
  - rejects blank labels;
  - takes an advisory transaction lock to serialize rollover;
  - advances past the maximum existing `ends_on` to prevent overlapping weeks;
  - trims supplied labels before applying defaults.

### `20261125000200_seed_exercises.sql`

New insert-only seed migration generated from `data/exercises_migrated.json`.

- Seeds nine categories including `fullbody` for `Full Body`.
- Seeds 50 exercises.
- Strips leaked `[ANIMATION_CODE]` blocks from descriptions.
- Maps animation keys to allowed `preset_key` values.
- Points media at the 50 bundled SVGs: `exercises/ex_ex0.svg` through `exercises/ex_ex49.svg`.
- Uses `where not exists (... lower(name_en) = lower(...))` so custom edits to existing exercises are never overwritten.
- File encoding was verified as UTF-8 with no replacement characters.

### `20261123000100_lock_proof_metadata.sql`

The previously broken branch ordering was fixed in place:

- coach/admin verification handling now runs before the finalized-state lock;
- the lock now includes `verification_status`, `verified_by`, and `verified_at` in addition to note/purge metadata;
- trainee assignment lock now also protects `verified_by` and `verified_at`.

This migration and `schema.sql` were checked against the final migration function body and match exactly.

### `20261026000300_fix_brand_name_ar.sql`

- Wrapped in a real transaction.
- Disables `platform_settings_protect_fields` only for this update.
- Uses a `DO ... EXCEPTION` block to guarantee the trigger is re-enabled even if the update fails.

### Snapshots

`backend/supabase/schema.sql`, `rls_policies.sql`, and `rpc_functions.sql` are now explicitly marked as documentation-only snapshots. They were updated to mirror final migrated state:

- recurrence constraint and `has_plan_access` guard;
- helper grants;
- final proof trigger and final `protect_platform_fields`;
- proof storage insert regex;
- archive label fallback;
- rollover validation, advisory lock, max-end guard, and trimmed labels.

### `seed.sql`

- Changed `ON CONFLICT ... DO UPDATE` to `DO NOTHING` for platform settings and categories.
- Fresh installs still get correct values from schema defaults/migrations, while re-running seed no longer overwrites operator edits.

### `config.toml`

- Added `[functions.admin-users] verify_jwt = true`.
- Added `[functions.cleanup-proofs] verify_jwt = false`.

The cleanup function is called by `pg_cron`, not a user JWT, and is protected by `CLEANUP_SECRET`.

### `sql/schedule_cleanup.sql`

Rewritten/documented as the canonical manual cron scheduler:

- requires `CLEANUP_SECRET` as an Edge Function secret and the same value in Vault as `cleanup_secret`;
- uses the dedicated shared secret in the `x-cleanup-secret` header, not an API key;
- schedules `pg_cron` + `pg_net` at `03:15 UTC` daily;
- sets a 30-second `timeout_milliseconds` for Edge Function cold starts;
- unschedules any existing `cleanup-workout-proofs` job before recreating it;
- verifies the job is active;
- includes manual verification queries against `net._http_response`.

### `sql/fix_exercises.sql`

Marked as a legacy one-shot repair. It is no longer part of normal setup because the new seed migration inserts clean exercise rows.

### Deleted root SQL scripts

Deleted because they duplicated older migrations or could roll back newer proof/security behavior:

- `sql/relax_proof_requirements.sql`
- `sql/proof_channels_and_cleanup.sql`
- `sql/update_media_paths.sql`
- `sql/clean_animation_codes.sql`

`sql/schedule_cleanup.sql` and `sql/fix_exercises.sql` were kept as clearly labeled manual helpers.

## 6. Edge Function changes

### `backend/supabase/functions/admin-users/index.ts`

Rewritten to fix broken account operations and harden authorization.

- Reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`/`SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY`/`ANON_KEY`.
- CORS is restricted to `APP_ORIGIN` or a small local/Cloudflare allowlist.
- Rejects non-`POST` methods.
- Requires a bearer token and validates it with `auth.getUser(token)` using the anon client.
- Looks up the caller profile and role with the service-role client.
- Returns stable codes such as `AUTH_REQUIRED`, `SESSION_INVALID`, `PROFILE_MISSING`, `ADMIN_REQUIRED`, `TARGET_INVALID`, `PASSWORD_RESET_FAILED`, and `UNKNOWN_ACTION`.
- `reset_password`:
  - admin-only;
  - requires a valid UUID `targetUserId`;
  - confirms the target user with `admin.auth.admin.getUserById()`;
  - generates a strong password;
  - updates it with `admin.auth.admin.updateUserById()`;
  - returns the generated password in the normalized account result.
- `create_coach`:
  - admin-only;
  - enforces the single-coach invariant;
  - validates required names, email, and password length;
  - upserts the coach profile;
  - deletes the Auth user if profile persistence fails.
- `create_trainee`:
  - admin or coach only;
  - coaches are forced to assign the trainee to themselves;
  - admins may supply a valid coach id or fall back to the existing coach;
  - persists `goal_en` and `goal_ar`, which were previously dropped;
  - deletes the Auth user if profile persistence fails.
- All account responses now include `success`, `userId`, and `user: { id, email }`, which fixes the frontend's `created?.id` trainee auto-selection.

### `backend/supabase/functions/cleanup-proofs/index.ts`

Rewritten to make retention and authorization correct.

- Does not decode or trust JWT payloads from the request.
- Prefers `x-cleanup-secret` matched exactly against `CLEANUP_SECRET`.
- Falls back to exact service-key matches from `SUPABASE_SERVICE_ROLE_KEY`, `SERVICE_ROLE_KEY`, or a JSON `SUPABASE_SECRET_KEYS` map.
- Uses service-role Supabase client for DB and Storage access.
- Retention:
  - verified/rejected images: 3 days after decision;
  - unreviewed `pending_review` images: 14 days after completion.
- Queries only rows with a non-null `proof_screenshot_path` and null `proof_purged_at`.
- Removes Storage objects before clearing DB pointers.
- Sets `proof_screenshot_path = null` and `proof_purged_at = now()` while preserving status, comment, and coach note.
- Batches up to 200 candidates per query, 10 batches per invocation, and reports `reviewed`, `unreviewed`, `purged`, `failed`, `batches`, and `hasMore`.
- Returns stable errors: `METHOD_NOT_ALLOWED`, `NOT_CONFIGURED`, `UNAUTHORIZED`, and `CLEANUP_FAILED`.

## 7. Backend tooling and documentation changes

### `backend/scripts/verify_db.py`

Substantially repaired.

- `--apply`:
  - applies only `backend/supabase/migrations/*.sql`;
  - sorts by strict filename order;
  - wraps each file in its own transaction;
  - strips one outer standalone `BEGIN;`/`COMMIT;` pair before execution;
  - records numeric migration versions in `supabase_migrations.schema_migrations` when that table exists;
  - never applies the stale top-level snapshots;
  - never applies `seed.sql`.
- `--seed` applies only `seed.sql`.
- `--dry-run`:
  - works for apply, seed, validate, and bootstrap;
  - makes no DB connection and no writes;
  - never prints credential values.
- `--validate`:
  - uses the service-role key when available for structural checks;
  - falls back to a reduced anon-key read-only check;
  - checks required columns, three required RPCs, three Storage buckets, exact counts, platform settings, exercises, and auth settings;
  - verifies the rollover RPC from PostgREST's schema list rather than executing it;
  - uses `Prefer: count=exact` and reports honestly when exact counts are unavailable;
  - fails in service-role mode if the exercises table is empty.
- `--strict` turns warnings into a nonzero exit.
- `--bootstrap-admin`:
  - refuses to promote a non-admin profile without `--force`;
  - does not overwrite an existing password unless explicitly requested with `--reset-password`, `--password-stdin`, or `ADMIN_RESET_PASSWORD`;
  - prefers `ADMIN_PASSWORD` or stdin over the deprecated `--password` flag;
  - prompts with `getpass` when no source is supplied;
  - re-reads and validates the final profile.
- Env aliases were normalized:
  - `SUPABASE_DB_URL` / `DATABASE_URL`;
  - `SUPABASE_URL` / `VITE_SUPABASE_URL`;
  - `SUPABASE_ANON_KEY` / `ANON_KEY` / `VITE_SUPABASE_ANON_KEY`;
  - `SUPABASE_SERVICE_ROLE_KEY` / `SERVICE_ROLE_KEY`.
- Corrected the empty-exercise validation message to point to `npm run backend:apply`, which now includes the exercise seed migration.

### `scripts/run_backend_py.mjs`

New portable Python wrapper for all `backend:*` npm scripts.

- Prefers `.venv/Scripts/python.exe` on Windows.
- Falls back to `.venv/bin/python`.
- Falls back to `python` on PATH.
- Runs from the repository root and forwards all arguments.
- Reports a clear setup error if Python cannot be started.

### `package.json`

- Added `backend:setup`.
- Added `backend:validate:strict`.
- Replaced hard-coded Windows `.venv\Scripts\python.exe` commands with the portable wrapper.
- Left dev/build/preview/thumbs scripts unchanged.

### `backend/requirements.txt`

- Pinned `python-dotenv==1.2.4`.
- Pinned `psycopg[binary]==3.3.6`.
- Documented supported Python range `>=3.11,<3.15`.

### `.env.example`

Now documents the canonical backend and Edge Function variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL`
- `ADMIN_PASSWORD`
- `CLEANUP_SECRET`
- `SUPABASE_SECRET_KEYS`
- `APP_ORIGIN`

It also states that `CLEANUP_SECRET` is required for scheduled cleanup and that service credentials must never be placed in `VITE_*` variables.

### `README.md`

Updated to match reality:

- `api/` is described as browser-side data-access modules, not serverless handlers.
- Migrations are the source of truth.
- `schema.sql`/`rls_policies.sql`/`rpc_functions.sql` are documentation-only copies.
- `backend:apply` and `backend:seed` are separate steps.
- Portable wrapper and `--dry-run` usage are documented.
- Exercise seeding is documented as part of `20261125000200_seed_exercises.sql`.
- Removed references to deleted SQL files and `check_db_access.mjs`.
- Documented `/docs/` and `/data/` as ignored.
- Clarified `CLEANUP_SECRET` as required.

### `SECURITY.md`

Added a six-step key rotation checklist covering service-role key, Postgres URL, `CLEANUP_SECRET`/Vault, Edge Function redeploy, cron verification, and final strict validation.

### `scripts/check_db_access.mjs`

Deleted. It was a stale one-off diagnostic script that read `.env` manually and was superseded by `verify_db.py --validate`.

## 8. Decisions and trade-offs

- **Migrations are canonical.** The old snapshot-based apply path was the reason final-state objects were being overwritten.
- **Snapshots remain, but as documentation.** They are useful for review but are no longer applied.
- **`get_weekly_leaderboard.score` was left as `percent`.** Changing it would alter product logic.
- **Coach leaderboard management was preserved.** I caught and reverted an over-tightened `protect_platform_fields()` change during review.
- **Exercise seed is insert-only.** Custom edits to existing exercises are never overwritten.
- **`CLEANUP_SECRET` is required.** The scheduled job must not depend on legacy/new API key formats or user JWTs.
- **Frontend graphics helpers were not moved.** Moving `createDrawingAvatar`/`createStickmanGif` out of `frontend/js/graphics.js` would have required frontend edits, which were out of scope.
- **Root one-shot SQL files were removed or labeled legacy.** They duplicated migrations or could roll back newer security behavior.

## 9. Validation performed

All of the following were run successfully:

- `node --check` on all changed API and tooling JS files:
  - `api/client.js`
  - `api/auth.api.js`
  - `api/admin.api.js`
  - `api/coach.api.js`
  - `api/trainee.api.js`
  - `api/leaderboard.api.js`
  - `scripts/run_backend_py.mjs`
- `node --experimental-strip-types --check` on both Edge Functions.
- `python -m py_compile backend/scripts/verify_db.py` using the project virtualenv.
- JSON parse of `package.json`.
- TOML parse of `backend/supabase/config.toml`.
- API import compatibility check: every API import in `frontend/js/app.js` resolves to an exported symbol.
- Function-body parity checks between snapshots and the final migration for:
  - `protect_platform_fields`
  - `enforce_workout_proof_rules`
  - `has_plan_access`
  - `get_leaderboard_archive`
  - `start_new_leaderboard_week`
- SQL transaction-marker check across `backend/supabase/*.sql`, `backend/supabase/migrations/*.sql`, and `sql/*.sql`.
- Stale-reference grep for deleted scripts/SQL in `README.md` and `verify_db.py`.
- Dry-runs with no database connection or writes:
  - `verify_db.py --apply --dry-run`
  - `verify_db.py --seed --dry-run`
  - `verify_db.py --validate --dry-run`
  - `verify_db.py --bootstrap-admin --email admin@example.com --dry-run`
- UTF-8 check of the generated exercise seed: no replacement characters, Arabic labels intact, 50 exercise inserts present.

Live staging flows were **not** run because no staging credentials or staging target were provided.

## 10. Recommended next steps

Before production use, run these in a staging project:

1. `npm run backend:setup`
2. `npm run backend:apply -- --dry-run`
3. `npm run backend:apply`
4. `npm run backend:seed`
5. `npm run backend:validate --strict`
6. Deploy Edge Functions with the correct secrets:
   - `supabase functions deploy admin-users`
   - `supabase functions deploy cleanup-proofs --no-verify-jwt`
7. Verify:
   - coach approval and rejection with notes;
   - WhatsApp proof switching and old screenshot cleanup;
   - admin create/reset password flows;
   - trainee creation with goals;
   - exercise creation with missing preset key;
   - leaderboard rollover and archive labels;
   - cleanup-proofs secret authorization, retention, and Storage deletion.
8. Run `sql/schedule_cleanup.sql` with the real project reference and Vault secret.
9. Review the unrelated frontend and staged logo changes separately before any commit.

## 11. Post-sync reconciliation (`sync.md`)

After the project-manager review, I read `sync.md` and applied the backend action items. `api/**` is now treated as a shared integration contract, not backend-only or frontend-only.

### New/changed files for the sync pass

- Created `api/contract.md` — frozen export list, error catalog, defaults, enums, archive row shape, and B2–B8 decisions.
- Created `api/errors.js` — shared `ERROR_TO_I18N_KEY` catalog and `errorI18nKey()` helper.
- Changed `api/client.js`:
  - imports `errorI18nKey()` and attaches `error.i18nKey` in `createApiError()`;
  - restored canonical reward title `One Extra Free Fitness Class`;
  - added `verified` to `mapArchive()`;
  - reused `TARGET_INVALID` instead of `USER_REQUIRED`.
- Changed `api/admin.api.js`: reset-password validation now uses `TARGET_INVALID`.
- Changed `api/coach.api.js`: trainee guard now uses `TARGET_NOT_FOUND`.
- Changed `api/trainee.api.js`: removed the `main_coach_id` certificate filter so certificates stay visible with legacy/alternate coach ownership.
- Changed `backend/supabase/functions/admin-users/index.ts`: `create_coach` now sets `platform_settings.main_coach_id` and rolls back the Auth user if that write fails.
- Changed `backend/supabase/migrations/20261125000100_finalize_backend.sql`:
  - adds `leaderboard_previous_winners.verified integer not null default 0`;
  - backfills legacy rows with `verified = completed`;
  - exposes `verified` from `get_leaderboard_archive()`;
  - writes `verified_count` during rollover.
- Mirrored the archive changes in `backend/supabase/schema.sql` and `backend/supabase/rpc_functions.sql`.
- Updated `sync.md` §7 with decisions and pre-edit notice.

### Decisions recorded

- **B2:** keep `INVALID_LEADERBOARD_STAGE` and the `calculating`/`published`/`closed` enum; frontend must stop sending `"draft"`.
- **B3:** canonical reward title is `One Extra Free Fitness Class`; no data migration needed.
- **B4:** `api/errors.js` is the shared catalog. All catalog values map to existing EN/AR keys, so i18n key parity is unchanged. New UI-facing codes must be catalogued in the same change.
- **B5:** backend added archive `verified`; frontend may keep reading `winner.verified`.
- **B6:** exact Edge secret and Vault commands are in `sync.md` §7.6. `APP_ORIGIN` and `CLEANUP_SECRET` are Edge secrets, not `VITE_*` values.
- **B7:** `preset_key` is fixed by design for this cleanup; uploaded media replaces the animation choice.
- **B8:** certificate filter removed; `main_coach_id` is set when the single coach account is created.

### Additional validation after sync

- `node --check` passed for all API files including `api/errors.js`, and both Edge Functions.
- Static-code check: all 54 API/Edge error codes found in source are present in the 67-entry catalog.
- Catalog check: every catalog i18n key exists in the frontend dictionaries; no new translations were required.
- Vite build passed with 62 modules (chunk-size advisory only).
- `npm run backend:apply -- --dry-run` and `npm run backend:validate:strict -- --dry-run` passed.
- SQL snapshot parity passed for `get_leaderboard_archive()`, `start_new_leaderboard_week()`, `protect_platform_fields()`, `enforce_workout_proof_rules()`, and `has_plan_access()`.
- Scoped `git diff --check` is clean.

No commit was made.
