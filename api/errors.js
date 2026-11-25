// Shared error-code catalog for api/** and the frontend.
//
// This is the single source of truth for mapping a stable API/Edge error code
// to an existing i18n key. Do not add a new UI-facing error code without
// adding an entry here first. All keys below already exist in EN and AR, so
// adding a code here does not require new translation keys.

export const ERROR_TO_I18N_KEY = Object.freeze({
  // client.js / shared api
  SUPABASE_NOT_CONFIGURED: "errSupabase",
  PLATFORM_SETTINGS_MISSING: "errPlatformMissing",
  AUTH_REQUIRED: "errSessionExpired",
  USER_REQUIRED: "errTargetNotFound", // legacy alias
  TARGET_INVALID: "errTargetNotFound",
  TARGET_NOT_FOUND: "errTargetNotFound",
  SETTINGS_PATCH_REQUIRED: "errGeneric",
  UNKNOWN_ERROR: "errGeneric",

  // auth.api.js
  PROFILE_MISSING: "errProfileMissing",
  INVALID_ROLE: "errInvalidRole",
  INVALID_CREDENTIALS: "errInvalidCredentials",
  EMAIL_NOT_CONFIRMED: "errEmailNotConfirmed",
  EMAIL_EXISTS: "errEmailExists",
  SESSION_EXPIRED: "errSessionExpired",
  PASSWORD_LENGTH: "errPasswordLength",
  PASSWORD_MISMATCH: "errPasswordMismatch",

  // admin.api.js / admin-users Edge Function
  USER_CREATE_FAILED: "errCreateAccount",
  PROFILE_UPDATE_FAILED: "errCreateAccount",
  SETTINGS_UPDATE_FAILED: "errCreateAccount",
  PASSWORD_RESET_FAILED: "errResetPasswordFailed",
  ADMIN_REQUIRED: "errAdminRequired",
  COACH_EXISTS: "errCoachExists",
  COACH_REQUIRED: "errCoachRequired",
  COACH_NOT_FOUND: "errCoachNotFound",
  PASSWORD_WEAK: "errPasswordWeak",
  NAMES_REQUIRED: "errNamesRequired",
  EMAIL_INVALID: "errEmailInvalid",
  MISSING_FIELDS: "errNamesRequired",
  TARGET_LOOKUP_FAILED: "errResetPasswordFailed",
  SESSION_INVALID: "errSessionExpired",
  SERVER_NOT_CONFIGURED: "errEdgeConfig",
  NOT_CONFIGURED: "errEdgeConfig",
  BODY_TOO_LARGE: "errBodyTooLarge",
  INVALID_JSON: "errGeneric",
  UNKNOWN_ACTION: "errGeneric",

  // coach.api.js
  EXERCISE_PRESET_INVALID: "errGeneric",
  EXERCISE_MEDIA_PATH_INVALID: "errExerciseMediaType",
  EXERCISE_MEDIA_TYPE_INVALID: "errExerciseMediaType",
  EXERCISE_MEDIA_TOO_LARGE: "errExerciseMediaSize",
  EXERCISE_NAMES_REQUIRED: "errExerciseNames",
  MISSING_TRAINEE: "errTargetNotFound", // legacy alias
  MISSING_WORKOUT: "errProofNotFound",
  NO_LIVE_WEEK: "errNoLiveWeek",
  WORKOUT_COMPLETED_LOCKED: "errWorkoutLocked",
  DAY_HAS_COMPLETED_WORKOUTS: "errDayCompleted",
  BRAND_NAMES_REQUIRED: "errNamesRequired",
  LINK_URL_INVALID: "errLinkUrl",
  RECURRENCE_DAYS_REQUIRED: "errRecurrenceDays",
  AVATAR_FILE_TYPE: "errAvatarFileType",
  AVATAR_FILE_TOO_LARGE: "errAvatarFileSize",
  CERTIFICATE_FILE_TYPE: "errCertificateFileType",
  CERTIFICATE_FILE_TOO_LARGE: "errCertificateFileSize",
  CERTIFICATE_FILE_REQUIRED: "errCertificateFileRequired",
  CERTIFICATE_TITLE_REQUIRED: "errCertificateTitle",
  CERTIFICATE_NOT_FOUND: "errCertificateNotFound",

  // trainee.api.js / leaderboard.api.js
  PROOF_FILE_REQUIRED: "errProofFileRequired",
  PROOF_FILE_INVALID: "errProofFileType",
  PROOF_FILE_TYPE_INVALID: "errProofFileType",
  PROOF_FILE_UNSUPPORTED: "errProofUnsupported",
  PROOF_COMPRESSING: "errProofCompressing",
  PROOF_FILE_TOO_LARGE: "errProofFileSize",
  PROOF_NOT_FOUND: "errProofNotFound",
  INVALID_PROOF_DECISION: "errGeneric",
  INVALID_LEADERBOARD_STAGE: "errGeneric",

  // cleanup-proofs Edge Function
  METHOD_NOT_ALLOWED: "errGeneric",
  UNAUTHORIZED: "errGeneric",
  CLEANUP_FAILED: "errGeneric"
});

// Mirrors the legacy string fallbacks in frontend/js/app.js so callers that
// still receive raw database/Auth messages get the same translated result.
export function errorI18nKey(errorOrCode) {
  const code = String(errorOrCode?.code || errorOrCode?.message || errorOrCode || "").trim();
  if (!code) return "errGeneric";
  if (ERROR_TO_I18N_KEY[code]) return ERROR_TO_I18N_KEY[code];
  if (/Invalid login credentials/i.test(code)) return "errInvalidCredentials";
  if (/Email not confirmed/i.test(code)) return "errEmailNotConfirmed";
  if (/User already registered|duplicate key|already exists/i.test(code)) return "errEmailExists";
  if (/JWT expired|session.*expired/i.test(code)) return "errSessionExpired";
  if (/SUPABASE_NOT_CONFIGURED/i.test(code)) return "errSupabase";
  if (/Finalized workout results|Completed workouts cannot be deleted|Completed or skipped workouts/i.test(code)) {
    return "errWorkoutLocked";
  }
  if (/Proof weights, summary, effort, and screenshot are required|Proof screenshot is required/i.test(code)) {
    return "errProofFileRequired";
  }
  if (/Failed to send a request|FunctionsFetchError|Failed to fetch|NetworkError/i.test(code)) return "errNetwork";
  if (/admin-users|Edge Function/i.test(code)) return "errEdge";
  return "errGeneric";
}
