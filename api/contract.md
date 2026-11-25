# api/** integration contract

Frozen: 2026-11-25  
Owners: backend owns DB/Edge semantics; frontend owns UI consumption. `api/**` is shared.

Any change to an exported name, error code, default, enum, RPC row shape, or certificate/archive contract must be recorded in `sync.md` **before** editing.

## 1. Frozen exports

### `api/client.js`

`DAY_KEYS`, `DEFAULT_PLATFORM_SETTINGS`, `SUPABASE_CONFIGURED`, `buildSchedule`, `createApiError`, `getAuthUser`, `getCategories`, `getExercises`, `getLiveWeek`, `getPlatformSettings`, `getProofSignedUrl`, `getSession`, `getStorageSignedUrls`, `getUserProfile`, `getWeeks`, `invokeAccountFunction`, `mapArchive`, `mapCertificate`, `mapCoachProfile`, `mapExercise`, `mapTraineeProfile`, `mapWeek`, `normalizeApiError`, `normalizeLinkUrl`, `normalizePhone`, `onAuthStateChange`, `requireSupabase`, `setProfileAccess`, `throwApiError`, `unwrap`, `updatePlatformSettings`

### `api/errors.js`

`ERROR_TO_I18N_KEY`, `errorI18nKey`

### `api/auth.api.js`

`getCurrentAuth`, `login`, `logout`, `refreshProfile`, `sendPasswordReset`, `updatePassword`

### `api/admin.api.js`

`createCoachAccount`, `createTraineeAccount`, `loadAdminWorkspace`, `resetUserPassword`, `saveAdminBrandSettings`, `setUserSubscription`, `updateAdminProfile`

### `api/coach.api.js`

`addCoachCertificate`, `addWorkoutToDay`, `approveWorkout`, `createExercise`, `deleteCoachCertificate`, `deleteExercise`, `loadCoachWorkspace`, `removeWorkout`, `reorderCoachCertificates`, `restoreExercise`, `saveCoachAbout`, `savePlatformSettings`, `setRestDay`, `toggleTraineeAccess`, `updateCoachCertificate`, `updateExercise`, `updateTraineeRecurrence`, `updateWorkout`

### `api/trainee.api.js`

`getTraineeCoachProfile`, `loadTraineeWorkspace`, `markWorkoutSkipped`, `saveTraineeProfile`, `submitWhatsAppProof`, `submitWorkoutProof`

### `api/leaderboard.api.js`

`getProofLogs`, `getProofScreenshotUrl`, `loadLeaderboard`, `reviewWorkoutProof`, `saveLeaderboardSettings`, `startNewLeaderboardWeek`

## 2. Error catalog

Single source of truth: `api/errors.js`.

- `ERROR_TO_I18N_KEY` maps stable API/Edge codes to existing EN/AR i18n keys.
- `errorI18nKey(errorOrCode)` applies the same legacy string fallbacks used by `frontend/js/app.js`.
- `createApiError()` attaches `error.i18nKey`; new UI code should prefer it over a second private map.
- No new i18n keys were introduced by the sync work. Codes without a dedicated existing message intentionally resolve to `errGeneric`.

Catalogued codes:

`SUPABASE_NOT_CONFIGURED`, `PLATFORM_SETTINGS_MISSING`, `AUTH_REQUIRED`, `USER_REQUIRED` (legacy alias), `TARGET_INVALID`, `TARGET_NOT_FOUND`, `SETTINGS_PATCH_REQUIRED`, `UNKNOWN_ERROR`, `PROFILE_MISSING`, `INVALID_ROLE`, `INVALID_CREDENTIALS`, `EMAIL_NOT_CONFIRMED`, `EMAIL_EXISTS`, `SESSION_EXPIRED`, `PASSWORD_LENGTH`, `PASSWORD_MISMATCH`, `USER_CREATE_FAILED`, `PROFILE_UPDATE_FAILED`, `SETTINGS_UPDATE_FAILED`, `PASSWORD_RESET_FAILED`, `ADMIN_REQUIRED`, `COACH_EXISTS`, `COACH_REQUIRED`, `COACH_NOT_FOUND`, `PASSWORD_WEAK`, `NAMES_REQUIRED`, `EMAIL_INVALID`, `MISSING_FIELDS`, `TARGET_LOOKUP_FAILED`, `SESSION_INVALID`, `SERVER_NOT_CONFIGURED`, `NOT_CONFIGURED`, `BODY_TOO_LARGE`, `INVALID_JSON`, `UNKNOWN_ACTION`, `EXERCISE_PRESET_INVALID`, `EXERCISE_MEDIA_PATH_INVALID`, `EXERCISE_MEDIA_TYPE_INVALID`, `EXERCISE_MEDIA_TOO_LARGE`, `EXERCISE_NAMES_REQUIRED`, `MISSING_TRAINEE` (legacy alias), `MISSING_WORKOUT`, `NO_LIVE_WEEK`, `WORKOUT_COMPLETED_LOCKED`, `DAY_HAS_COMPLETED_WORKOUTS`, `BRAND_NAMES_REQUIRED`, `LINK_URL_INVALID`, `RECURRENCE_DAYS_REQUIRED`, `AVATAR_FILE_TYPE`, `AVATAR_FILE_TOO_LARGE`, `CERTIFICATE_FILE_TYPE`, `CERTIFICATE_FILE_TOO_LARGE`, `CERTIFICATE_FILE_REQUIRED`, `CERTIFICATE_TITLE_REQUIRED`, `CERTIFICATE_NOT_FOUND`, `PROOF_FILE_REQUIRED`, `PROOF_FILE_INVALID`, `PROOF_FILE_TYPE_INVALID`, `PROOF_FILE_UNSUPPORTED`, `PROOF_COMPRESSING`, `PROOF_FILE_TOO_LARGE`, `PROOF_NOT_FOUND`, `INVALID_PROOF_DECISION`, `INVALID_LEADERBOARD_STAGE`, `METHOD_NOT_ALLOWED`, `UNAUTHORIZED`, `CLEANUP_FAILED`

## 3. Defaults and enums

### `DEFAULT_PLATFORM_SETTINGS`

- `websiteNameEn`: `R&R Fit`
- `websiteNameAr`: `رنا رويال فتنيس`
- `coachNameEn`: `Coach`
- `coachNameAr`: `المدربة`
- `coachEmail`, `coachPhone`, `whatsappPhone`, `coachBioEn`, `coachBioAr`: `""`
- `coachAvatarPath`: `null`
- `coachLinks`: `[]`
- `leaderboardEnabled`, `leaderboardPublished`, `strictVerification`: `true`
- `leaderboardStage`: `published`
- **Canonical `rewardTitleEn`: `One Extra Free Fitness Class`**
- `rewardTitleAr`: `حصة تدريبية مجانية إضافية واحدة`

The English reward title is title-case in `schema.sql`, `seed.sql`, and the original schema migration. Do not change it to sentence case without a data migration.

### `leaderboard_stage`

Allowed: `calculating`, `published`, `closed`.

`draft` is not valid and must not be sent by the UI. `INVALID_LEADERBOARD_STAGE` stays enforced by `api/leaderboard.api.js`.

### Exercise `preset_key`

Allowed: `squat`, `hipthrust`, `plank`, `latpulldown`, `shoulderpress`, `cardio`.

Missing/empty values default to `squat`. The preset is an internal animation fallback; uploaded exercise media is the user-selected presentation. No frontend selector is part of this contract.

### Archive row fields

`get_leaderboard_archive()` and `mapArchive()` expose:

`weekEn`, `weekAr`, `traineeId`, `nameEn`, `nameAr`, `avatarStyle`, `avatarUrl`, `completed`, `verified`, `total`, `percent`, `score`, `rewardEn`, `rewardAr`.

`verified` is stored in `leaderboard_previous_winners` and populated from `get_weekly_leaderboard().verified_count` during rollover. Legacy archive rows were backfilled with `completed`.

### Certificates

Certificates are platform-wide content. `api/trainee.api.js` must not filter them by `platform_settings.main_coach_id`; authenticated RLS is the access boundary. `admin-users create_coach` sets `main_coach_id` for new single-coach setups.

## 4. Sync decisions applied

See `sync.md` §7 for B2–B8 decisions. In particular:

- B2: keep stage validation; frontend must stop sending `"draft"`.
- B3: reward title stays `One Extra Free Fitness Class`.
- B4: `api/errors.js` is the catalog; no new i18n keys.
- B5: backend added archive `verified`; frontend may keep reading `winner.verified`.
- B6: `APP_ORIGIN` and `CLEANUP_SECRET` are Edge secrets, not `VITE_*` values.
- B7: `preset_key` is fixed by design; uploaded media replaces the animation choice.
- B8: certificate filter removed; `main_coach_id` set on coach creation.
