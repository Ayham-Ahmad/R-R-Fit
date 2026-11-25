# sync.md — Backend ↔ Frontend reconciliation

Date: 2026-11-25  
Role: project-manager / integration review  
Scope: reconcile `backend.md` and `frontend.md` against the current working tree.

## 0. Bottom line

Both agents did real cleanup, but they treated `api/**` differently:

- **Backend agent** called `api/*.js` "browser-side data-access modules" and rewrote all six of them.
- **Frontend agent** called `api/*.js` "frontend code" because Vite bundles it, and edited `api/client.js`, `api/coach.api.js`, `api/trainee.api.js`.

The current files happen to contain both sets of edits (no conflict markers), and the project still builds:

- `cmd /c npm run build` — PASS (61 modules, chunk-size advisory only).
- Every API symbol imported by `frontend/js/app.js` still resolves to an export.
- No syntax errors were found in the changed JS files.

**Nothing is syntactically broken. The breakages below are contract, data, and UX regressions created by working in isolation.**

---

## 1. Who stepped into whose area

| File | Backend report | Frontend report | Current state |
| --- | --- | --- | --- |
| `api/client.js` | Modified (private `supabase`, `createApiError`, `updatePlatformSettings`, `getProofSignedUrl`, `mapArchive`, …) | Modified (added `DEFAULT_PLATFORM_SETTINGS`, rewrote `mapSettings()` fallbacks) | Both changes present; reward default disagrees with DB (see **B3**) |
| `api/coach.api.js` | Modified (validation, `requireCoachManageTrainee`, removed two dead exports) | Modified (removed the same two dead exports) | Duplicate work, merged by luck |
| `api/trainee.api.js` | Modified (rollback, `mainCoachId` certificate filter, removed `getProofScreenshotUrl`) | Modified (removed the same `getProofScreenshotUrl`) | Duplicate work, merged by luck |
| `api/admin.api.js`, `api/auth.api.js`, `api/leaderboard.api.js` | Modified | Inspected only | Backend owns these now |
| `frontend/**` | Explicitly not touched | Owned | No overlap |
| `backend/**`, `sql/**`, scripts, docs, `.env.example` | Owned | Explicitly not touched | No overlap |
| `assets/brand/logo-original.png` | Not touched; noticed staged deletion | Deleted | Both reports agree; no action needed |

**Rule to adopt now:** `api/**` is a **shared integration contract**, not backend-only and not frontend-only. Backend owns DB/Edge semantics; frontend owns UI consumption. Any change to an exported name, error code, enum, or default in `api/**` must be announced to both agents and recorded in this file before editing.

---

## 2. Confirmed breakages and sync actions

### B1 — Two owners for `api/**` (process risk, HIGH)

**Symptom:** Both agents independently added/removed the same symbols. It worked this time only because the edits were complementary. The next round will clobber one side.

**Evidence:** `backend.md` §3 vs `frontend.md` §1/§2; `git status` shows all six `api/*.js` modified.

**Fix:**
1. Freeze the current export list of `api/client.js`, `api/coach.api.js`, `api/trainee.api.js` as the integration contract.
2. Backend agent: before touching an `api/*.js` file, post the intended export/error-code change in `sync.md`.
3. Frontend agent: before relying on a new API field/code, confirm it exists in the current file, not in a report.
4. Do not merge either report's "I removed X" as a new action — those removals are already applied.

---

### B2 — Invalid leaderboard stage `"draft"` sent by the UI (functional bug, HIGH)

**Symptom:** Saving leaderboard settings when "published" is unchecked can fail with a generic toast instead of saving.

**Evidence:**
- `frontend/js/app.js:3555`: `leaderboardStage: data.has("leaderboardPublished") ? "published" : settings.leaderboardStage || "draft"`.
- `backend/supabase/schema.sql:243-245`: `leaderboard_stage` check allows only `calculating`, `published`, `closed`.
- `api/leaderboard.api.js:157-160`: backend now explicitly throws `INVALID_LEADERBOARD_STAGE` for anything else.
- `frontend/js/app.js` `errorMessage()` has **no** mapping for `INVALID_LEADERBOARD_STAGE`.

**Fix:**
- **Frontend agent:** replace the `"draft"` fallback with `"closed"` (or `"calculating"` if the intended UX is "stopped but not archived") and never send an empty stage.
- **Backend agent:** add `INVALID_LEADERBOARD_STAGE` to the shared error catalog (see **B4**) and keep the validation.

---

### B3 — Reward title default disagrees between frontend constant and DB (data consistency, MEDIUM)

**Symptom:** Same field shows two different strings depending on whether settings have loaded.

**Evidence:**
- `api/client.js:27`: `rewardTitleEn: "One extra free fitness class"` (frontend normalized to sentence case).
- `backend/supabase/schema.sql:245`, `backend/supabase/seed.sql:16`, `backend/supabase/migrations/20261025000100_schema.sql:209`: `'One Extra Free Fitness Class'` (title case).
- `api/client.js:185`: `mapSettings()` only falls back to the client constant when the DB value is empty.

**Fix:** Pick one canonical string.
- Recommended: keep the **DB value** (`One Extra Free Fitness Class`) to avoid touching stored production rows; change `api/client.js:27` back to it.
- If sentence case is the product decision: update `api/client.js`, `schema.sql`, `seed.sql`, the original schema migration, and add a small migration that updates existing `platform_settings` rows. Update both reports.

---

### B4 — Backend added error codes; frontend pruned the mappings (UX regression, MEDIUM/HIGH)

**Symptom:** Validation failures introduced by the backend surface as `errGeneric` ("Something went wrong") because the frontend's `errorMessage()` only maps a fixed set of codes.

**Evidence:** A scan of `throw`/`fail` codes in `api/*.js` and both Edge Functions against the `errorMessage()` map in `frontend/js/app.js` found these unmapped codes:

`EXERCISE_PRESET_INVALID`, `EXERCISE_MEDIA_PATH_INVALID`, `MISSING_TRAINEE`, `INVALID_LEADERBOARD_STAGE`, `SETTINGS_PATCH_REQUIRED`, `USER_REQUIRED`, `UNKNOWN_ACTION`, `INVALID_JSON`, `MISSING_FIELDS`, `METHOD_NOT_ALLOWED`, `NOT_CONFIGURED`, `UNAUTHORIZED`, `CLEANUP_FAILED`.

At least the first five are reachable from normal UI flows. `frontend.md` §2.1(f)/§2.6 removed the old proof-code entries and 218 i18n keys, so the generic fallback is now the only handler.

**Fix:**
1. Create one shared error catalog (suggested: `api/errors.js` exporting `ERROR_TO_I18N_KEY`), or extend `errorMessage()` in `app.js` with the missing codes.
2. Frontend agent: add EN+AR i18n keys for the new codes; keep 1:1 key parity (currently 621/621 after pruning).
3. Backend agent: do not introduce new `throw`/`fail` codes without adding them to that catalog in the same change; prefer existing codes (`TARGET_INVALID`, `PROOF_NOT_FOUND`, etc.) where semantics match.
4. Edge-Function-only codes (`METHOD_NOT_ALLOWED`, `NOT_CONFIGURED`, `UNAUTHORIZED`, `CLEANUP_FAILED`, `INVALID_JSON`, `MISSING_FIELDS`) can stay server-side, but `UNKNOWN_ACTION` should map to `errGeneric` explicitly.

---

### B5 — Archive cards read `winner.verified`, which the RPC never returns (data contract bug, MEDIUM)

**Symptom:** Previous-winner cards show `0` for "verified workouts" even when the winner has completed/verified sessions.

**Evidence:**
- `frontend/js/app.js:1968`, `:2623`, `:2655` use `formatNumber(winner.verified)`.
- `backend/supabase/migrations/20261125000100_finalize_backend.sql:259-273` (`get_leaderboard_archive()`) returns `completed`, `total`, `percent`, `score`, `reward_en/ar`, but **no `verified`** column.
- `api/client.js:117-133` (`mapArchive()`) therefore has no `verified` field.
- `backend/supabase/schema.sql:748-760` (`leaderboard_previous_winners`) also has no `verified` column.

This predates both cleanups, but the backend's shared `mapArchive()` refactor and the frontend's i18n/DOM cleanup both touched this path without noticing it.

**Fix — choose one:**
- **Frontend (simplest):** change the three `winner.verified` references to `winner.completed`; keep `verifiedWorkoutsShort` translation as-is if "completed" is acceptable, or rename the label.
- **Backend:** add a `verified integer` output to `get_leaderboard_archive()` (e.g. `lw.completed` when strict verification is on), mirror it in `rpc_functions.sql`, and map it in `api/client.js:mapArchive()`.

Do not do both without agreeing on the value's meaning.

---

### B6 — New Edge Function secrets are not provisioned in the working `.env` (deployment gap, MEDIUM)

**Symptom:** Admin account creation/password reset and scheduled cleanup can fail or refuse requests after the backend hardening, with no local configuration explaining why.

**Evidence:**
- `.env.example:35-36` now documents `APP_ORIGIN` and `CLEANUP_SECRET` as required.
- The actual `.env` contains only `VITE_*`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` — no `APP_ORIGIN`, no `CLEANUP_SECRET`.
- `backend/supabase/functions/admin-users/index.ts` restricts CORS via `APP_ORIGIN`; `backend/supabase/functions/cleanup-proofs/index.ts` requires `x-cleanup-secret`/`CLEANUP_SECRET`; `sql/schedule_cleanup.sql` needs the same value in Vault.

**Fix:**
- **Backend agent:** provide the exact `supabase secrets set …` / Vault commands and the required origin string; state that these are Edge Function secrets, not `VITE_*` values.
- **Frontend agent:** do not smoke-test admin create/reset or proof-cleanup until those secrets are deployed; add them to the test handoff checklist.
- Operator: add both keys to the local `.env` for `supabase functions serve` as well.

---

### B7 — TODO #11 (animation/GIF choice) is still unimplemented, and the new default hides it (product gap, MEDIUM)

**Symptom:** Coaches uploading a GIF still get the `squat` animation unless they know an internal preset key; the documented request was to let them choose an uploaded GIF **or** an animation code.

**Evidence:**
- `docs/tofix.md:11`: "add like she can chose from uploading gif or an animation codes instead".
- `frontend.md` §3 says the dropdown was already absent and only file upload remains; `frontend/js/app.js:3601-3614` sends no `presetKey`.
- `api/coach.api.js:445,483` hard-defaults `preset_key` to `"squat"`; `EXERCISE_PRESET_KEYS` (`:28-37`) validates six fixed keys but no UI can supply them.
- `backend.md` §8 explicitly says graphics helpers were not moved and no new features were added.

**Fix:**
- Product decision required. Either:
  - close TODO #11 with a note that uploaded media replaces the animation, and document that `preset_key` is intentionally fixed; or
  - implement it jointly: backend accepts `presetKey` on `createExercise`/`updateExercise` (it already validates it), frontend adds the control and passes it. Neither agent should do half of this.

---

### B8 — Certificate visibility depends on `main_coach_id`, which certificate writes do not use (data contract risk, MEDIUM)

**Symptom:** After the backend hardening, a trainee can see zero certificates if the coach who uploaded them is not the configured `platform_settings.main_coach_id`.

**Evidence:**
- `api/trainee.api.js:94-99`: backend added `.eq("coach_id", settings.mainCoachId)` when `mainCoachId` is set.
- `api/coach.api.js:694`: certificates are inserted with `coach_id: user.id` (the logged-in coach), not `settings.mainCoachId`.
- `backend/supabase/seed.sql:6-18` does not set `main_coach_id`; only the admin/coach flow can populate it.

**Fix — pick one:**
- Backend: drop the `main_coach_id` filter until there is a guarantee that the single coach is the main coach, or make the filter fall back to the current coach's id.
- Frontend: when saving certificates, use the configured main coach id rather than `auth.user.id`.
- Backend/admin flow: always set `platform_settings.main_coach_id` when the single coach account is created.

---

## 3. Action items — Backend agent

1. **Own the contract list.** Publish the current export/error-code/default/enum list in this file (or a linked `api/contract.md`) before further `api/**` edits.
2. **B2:** keep `INVALID_LEADERBOARD_STAGE` validation; add the code to the shared error catalog.
3. **B3:** decide the canonical reward title and update `schema.sql`, `seed.sql`, the original schema migration, and any stored rows if needed. Tell frontend the chosen value.
4. **B4:** stop inventing UI-facing codes without catalog entries; reuse existing codes where possible.
5. **B5/B8:** decide whether the archive RPC gains `verified` and whether the certificate filter stays. Reply in this file with the decision.
6. **B6:** hand over the exact Edge Function secret/Vault commands and origin value.
7. **B7:** state whether `preset_key` is fixed by design or should become selectable.
8. Re-run `npm run backend:apply -- --dry-run`, `npm run backend:validate --strict`, and the two Edge Function syntax checks after any change.

## 4. Action items — Frontend agent

1. **B2:** change `frontend/js/app.js:3555` so it never sends `"draft"`; use `"closed"`.
2. **B3:** align `api/client.js:27` with the backend's chosen reward title.
3. **B4:** add missing codes to `errorMessage()` / a shared catalog and add EN+AR keys, preserving key parity.
4. **B5:** switch the three `winner.verified` reads to `winner.completed` unless backend adds the column.
5. **B8:** if the filter stays, write certificates under the configured main coach id.
6. **B7:** do not add a preset selector until backend confirms the payload field; do not silently leave TODO #11 "done".
7. Keep treating `api/**` as shared: coordinate every edit here first.
8. Re-run `npm run build`, `node --check` on changed JS, and the i18n key-parity/static-key check after changes.

## 5. Contracts to freeze (single source of truth)

| Contract | Current canonical location | Required action |
| --- | --- | --- |
| Exported API symbols | `api/client.js`, `api/coach.api.js`, `api/trainee.api.js`, `api/leaderboard.api.js`, `api/admin.api.js`, `api/auth.api.js` | Freeze current list; changes require both agents |
| Error code → message | `frontend/js/app.js:errorMessage()` + i18n dictionaries | Extract/extend into shared catalog (B4) |
| `leaderboard_stage` enum | `backend/supabase/schema.sql:243-245` | `calculating`, `published`, `closed` only; frontend must comply (B2) |
| Reward title default | DB default + seed (proposed) | Align `api/client.js` (B3) |
| Exercise preset keys | `api/coach.api.js:28-37` and `exercises.preset_key` check | Decide if selectable (B7) |
| Certificate owner | `coach_certificates.coach_id` | Decide relationship to `main_coach_id` (B8) |
| Archive row fields | `get_leaderboard_archive()` return table | Decide `verified` vs `completed` (B5) |
| Edge secrets | `.env.example` + deployed Edge/Vault secrets | Provision before smoke tests (B6) |

## 6. Verification checklist before anyone commits

- [ ] `cmd /c npm run build` passes (current baseline: PASS, 61 modules).
- [ ] All `t("...")` keys resolve in EN and AR; key counts identical.
- [ ] Every API import in `frontend/js/app.js` resolves to an export (current baseline: PASS).
- [ ] Every UI-facing error code has an i18n mapping or an intentional `errGeneric` note.
- [ ] `leaderboard-settings` save works with publish on **and** off.
- [ ] Admin brand rename updates tab title, meta description, landing copy, and seeded reward label consistently.
- [ ] Coach creates an exercise without a preset key; trainee sees a sensible animation/media.
- [ ] Certificate upload remains visible on the trainee "Your coach" card with `main_coach_id` set.
- [ ] Previous-winners cards show a real number, not `0`.
- [ ] `APP_ORIGIN` / `CLEANUP_SECRET` deployed; admin create/reset and cleanup smoke-tested.
- [ ] `sync.md` updated with the decisions from B2–B8 before the next edit round.

---

## 7. Frontend agent response (decisions + announced edits)

**Announcement before editing shared `api/**`:** I am changing exactly one value in `api/client.js` — `DEFAULT_PLATFORM_SETTINGS.rewardTitleEn` (B3). No exported symbol, error code, or enum in `api/**` is added, removed, or renamed by me in this round. The new error codes in B4 are added only to `frontend/js/app.js` and the i18n dictionaries; they are not introduced into `api/**`.

| Item | Frontend decision / action |
| --- | --- |
| **B1** | Acknowledged. `api/**` is treated as shared from now on; the only `api/**` edit this round is the announced B3 default alignment above. No report's "I removed X" was re-applied. |
| **B2** | **Fixed in `frontend/js/app.js`**: the `leaderboard-settings` submit now uses `"closed"` instead of `"draft"` and never sends an empty stage. |
| **B3** | **Aligning to DB canonical value**: `api/client.js` `rewardTitleEn` → `"One Extra Free Fitness Class"` (title case). Arabic already matches the DB (`حصة تدريبية مجانية إضافية واحدة`). No schema/seed/migration change from frontend. |
| **B4** | **Fixed in frontend only**: added mappings for the six reachable UI codes (`EXERCISE_PRESET_INVALID`, `EXERCISE_MEDIA_PATH_INVALID`, `MISSING_TRAINEE`, `INVALID_LEADERBOARD_STAGE`, `SETTINGS_PATCH_REQUIRED`, `USER_REQUIRED`) plus explicit `UNKNOWN_ACTION: "errGeneric"`, and six matching EN+AR i18n keys. Edge-only codes (`INVALID_JSON`, `MISSING_FIELDS`, `METHOD_NOT_ALLOWED`, `NOT_CONFIGURED`, `UNAUTHORIZED`, `CLEANUP_FAILED`) intentionally keep the existing `errGeneric`/regex fallbacks — no new keys for them. |
| **B5** | **Fixed in `frontend/js/app.js`**: the three archive-card reads of `winner.verified` now use `winner.completed`, since `get_leaderboard_archive()` has no `verified` column. The live-standings `entry.verified` read is a different object and was left alone. |
| **B6** | Acknowledged. No admin create/reset or proof-cleanup smoke test will be performed until `APP_ORIGIN` / `CLEANUP_SECRET` are deployed; added to the handoff checklist in `frontend.md`. |
| **B7** | **Held, not implemented.** No preset selector was added and `preset_key` remains fixed at `"squat"`. TODO #11 stays **open** — it is not "done". Needs a product decision from backend/PM: either close it by documenting that uploaded media replaces animation codes, or implement jointly (backend accepts `presetKey`, frontend adds the control). `frontend.md` §3 is being corrected to say this. |
| **B8** | **Held pending backend decision.** Backend action item 5 asks whether the `main_coach_id` filter stays or is dropped; changing certificate writes now could conflict with that decision. No certificate write path was modified this round. Once backend replies, frontend will either write under `mainCoachId` (if filter stays) or leave writes as-is (if filter is dropped). |

### Frontend verification results (recorded)

- `node --check` on `frontend/js/app.js`, `frontend/js/extra-i18n.js`, `api/client.js`, `api/errors.js` — **PASS**.
- i18n parity — **PASS**, 627 EN / 627 AR, no empty values. Six new keys were added in each language for the six UI-facing codes.
- All keys used by `api/errors.js` resolve in EN — **PASS**.
- Static `t()` resolution — **PASS** (561 static keys, 0 missing in EN or AR; count dropped from 568 because the duplicated regex fallbacks in `app.js` were replaced by the shared catalog).
- `grep` for `winner.verified`, `"draft"` in the leaderboard submit — **no matches**.
- `npm run build` — **PASS** (62 modules, 1.70 s, chunk-size advisory only; JS 510.31 kB).

### Additional coordination note (B1 / B4)

The backend agent added `api/errors.js` (`ERROR_TO_I18N_KEY`, `errorI18nKey`) while I was working. To avoid two competing catalogs, I did **not** edit that file; instead `frontend/js/app.js` now:

1. keeps a small **UI-specific override map** (the six codes above, where the frontend needs more precise messages than the catalog's `errGeneric`/legacy aliases), and
2. delegates everything else — including Edge-Function-only codes and the raw-string regex fallbacks — to `errorI18nKey()` from the shared catalog.

This means `api/errors.js` is the base catalog, and the frontend override map is intentional, not duplicated fallbacks. If backend wants to absorb the six precise messages into `api/errors.js`, it can do so by changing those six values to the new i18n keys; frontend will then drop its overrides.

**B3 update:** when I reached `api/client.js`, the value was already `"One Extra Free Fitness Class"` (aligned by the backend agent), so no edit by me was needed. DB, seed, and client now agree.

**Still awaiting backend/PM decisions:** B5 value semantics are settled by using `completed` in the archive UI (no backend reply yet — revisit if the RPC gains `verified`); B7 (preset selector) and B8 (certificate owner/filter) remain open as recorded above.

---

## 7. Backend agent response — decisions and pre-edit notice

Timestamp: 2026-11-25 (backend agent)  
Status: decisions recorded **before** the backend-side `api/**` edits below.

### 7.1 B1 — contract ownership

- I will publish the frozen export list, error catalog, defaults, and enums in `api/contract.md`.
- From this point on, `api/**` is shared. Any export/error-code/default/enum change must be written here first.
- No removals from the previous reports will be re-applied; the current files are the baseline.

### 7.2 B2 — leaderboard stage

- Keep `api/leaderboard.api.js` validation and keep `INVALID_LEADERBOARD_STAGE`.
- Canonical enum remains `calculating`, `published`, `closed` only.
- Frontend must change its `"draft"` fallback to `"closed"`. Backend will not relax the validation.

### 7.3 B3 — reward title

**Decision: keep the DB value as canonical.**

- Canonical English reward title: `One Extra Free Fitness Class`.
- Backend will change `api/client.js` `DEFAULT_PLATFORM_SETTINGS.rewardTitleEn` back to that title-case string.
- No schema migration is needed: `schema.sql`, `seed.sql`, and the original schema migration already use that value.
- Frontend does not need to change its translation copy; it only needs to import/use `DEFAULT_PLATFORM_SETTINGS`.

### 7.4 B4 — shared error catalog

- Backend will add `api/errors.js` exporting:
  - `ERROR_TO_I18N_KEY`
  - `errorI18nKey(errorOrCode)`
- `api/client.js` will attach `error.i18nKey` in `createApiError()` so the frontend can consume a stable key.
- **No new i18n keys are introduced.** The catalog maps every known UI-facing code to an existing key, so EN/AR key parity stays unchanged. Frontend only needs to use `error.i18nKey` (or import the catalog) instead of maintaining a second private map.
- To reduce new codes, two backend codes are being reused rather than invented:
  - `USER_REQUIRED` → `TARGET_INVALID`
  - `MISSING_TRAINEE` → `TARGET_NOT_FOUND`
- Codes explicitly kept with catalog entries: `EXERCISE_PRESET_INVALID`, `EXERCISE_MEDIA_PATH_INVALID`, `INVALID_LEADERBOARD_STAGE`, `SETTINGS_PATCH_REQUIRED`, `UNKNOWN_ACTION`.
- Edge-only codes are catalogued to `errGeneric`/`errEdgeConfig`; they are not expected in normal UI flows, but `UNKNOWN_ACTION` is explicitly mapped to `errGeneric`.

### 7.5 B5 — archive `verified`

**Backend decision: add the field.** Frontend does **not** need to change `winner.verified` reads.

- Add `verified integer not null default 0` to `leaderboard_previous_winners`.
- Backfill legacy archive rows with `verified = completed` as the best available historical value.
- Populate it from `get_weekly_leaderboard().verified_count` during rollover.
- Add `verified` to `get_leaderboard_archive()` output and to `api/client.js:mapArchive()`.
- Mirror the change in `schema.sql` and `rpc_functions.sql`.

### 7.6 B6 — Edge secrets / Vault commands

These are **Edge Function secrets**, not `VITE_*` values. Current `.env` has no `APP_ORIGIN` or `CLEANUP_SECRET`; operators must add both for `supabase functions serve` as well.

Generate a one-time cleanup secret (PowerShell):

```powershell
$b = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
($b | ForEach-Object { $_.ToString('x2') }) -join ''
```

Deploy functions and set secrets (project ref from the current `SUPABASE_URL` is `szqcvjnhlxsrebfgdgpu`):

```powershell
supabase link --project-ref szqcvjnhlxsrebfgdgpu
supabase functions deploy admin-users
supabase functions deploy cleanup-proofs --no-verify-jwt
supabase secrets set APP_ORIGIN="http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,https://<PRODUCTION_ORIGIN>"
supabase secrets set CLEANUP_SECRET="<64-char-hex-from-above>"
```

`APP_ORIGIN` must be the exact browser origin(s), including scheme and port; do **not** use the Supabase project URL and do not add a trailing slash. Local dev is covered by the built-in allowlist even if `APP_ORIGIN` is unset, but setting it explicitly is required for production.

Store the same secret in Vault (SQL editor, `postgres` role), then run `sql/schedule_cleanup.sql` with `<PROJECT_REF>` replaced by `szqcvjnhlxsrebfgdgpu`:

```sql
select vault.create_secret('<SAME_64_CHAR_HEX>', 'cleanup_secret', 'cleanup-proofs cron');
```

Local `.env` entries for `supabase functions serve`:

```dotenv
APP_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174
CLEANUP_SECRET=<same-64-char-hex>
```

### 7.7 B7 — exercise preset

**Decision: fixed by design for this cleanup.**

- Uploaded exercise media replaces the old animation-code/GIF choice.
- `preset_key` stays an internal animation fallback with the six allowed values already in `api/coach.api.js` and the DB check constraint.
- `createExercise()`/`updateExercise()` keep defaulting missing/empty values to `squat`.
- No new payload field will be added. TODO #11 should be closed with this note, not left ambiguous.

### 7.8 B8 — certificates and `main_coach_id`

**Decision: certificates are platform-wide; remove the restrictive filter and guarantee assignment on new setup.**

- `api/trainee.api.js`: drop the `.eq("coach_id", settings.mainCoachId)` filter. The existing `authenticated` RLS policy already governs reads.
- `backend/supabase/functions/admin-users/index.ts`: after creating the single coach profile, set `platform_settings.main_coach_id` to that coach id. If that settings write fails, roll back the new Auth user and return `SETTINGS_UPDATE_FAILED`.
- Frontend does not need to change certificate writes; `coach_id: user.id` remains correct under the single-coach invariant.

### 7.9 Intended backend edits after this notice

1. Create `api/contract.md`, `api/errors.js`.
2. Edit `api/client.js`, `api/leaderboard.api.js`, `api/coach.api.js`, `api/trainee.api.js`, `api/admin.api.js`.
3. Edit `backend/supabase/functions/admin-users/index.ts`.
4. Edit `backend/supabase/migrations/20261125000100_finalize_backend.sql`, `backend/supabase/schema.sql`, `backend/supabase/rpc_functions.sql`.
5. Re-run backend static checks and dry-runs listed in section 3.

### 7.10 Backend completion status

- [x] `api/contract.md` published with exports, codes, defaults, and enums.
- [x] `api/errors.js` created; `createApiError()` now attaches `error.i18nKey`.
- [x] B2: `INVALID_LEADERBOARD_STAGE` retained and catalogued.
- [x] B3: reward title canonicalized to `One Extra Free Fitness Class`.
- [x] B4: no new i18n keys; all static API/Edge codes catalogued.
- [x] B5: archive `verified` added to migration, snapshots, and `mapArchive()`.
- [x] B6: exact secret/Vault commands provided above.
- [x] B7: `preset_key` declared fixed by design.
- [x] B8: certificate filter removed; coach creation sets `main_coach_id`.
- [x] Syntax checks, API import check, error-catalog check, Vite build, SQL snapshot parity, transaction check, and backend dry-runs passed.

Pending for frontend agent (no backend work remains for these):

- [ ] Change `frontend/js/app.js:3555` draft fallback to `"closed"`.
- [ ] Consume `error.i18nKey` / `api/errors.js` instead of the private map.
- [ ] No frontend change needed for B5 or B8.
- [ ] No preset selector for B7.
