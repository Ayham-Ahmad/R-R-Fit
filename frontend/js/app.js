import { I18N } from "./i18n.js";
import "./extra-i18n.js";
import logoUrl from "../assets/logo.png";
import { createDrawingAvatar, createStickmanGif } from "./graphics.js";
import {
  DAY_KEYS,
  SUPABASE_CONFIGURED,
  onAuthStateChange
} from "../../api/client.js";
import {
  getCurrentAuth,
  login,
  logout,
  refreshProfile,
  sendPasswordReset,
  updatePassword
} from "../../api/auth.api.js";
import {
  createCoachAccount,
  createTraineeAccount,
  loadAdminWorkspace,
  resetUserPassword,
  saveAdminBrandSettings,
  setUserSubscription,
  updateAdminProfile
} from "../../api/admin.api.js";
import {
  addWorkoutToDay,
  createExercise,
  deleteExercise,
  loadCoachWorkspace,
  removeWorkout,
  savePlatformSettings,
  setRestDay,
  toggleTraineeAccess,
  updateTraineeRecurrence,
  updateWorkout
} from "../../api/coach.api.js";
import {
  loadTraineeWorkspace,
  markWorkoutSkipped,
  saveTraineeProfile,
  submitWorkoutProof
} from "../../api/trainee.api.js";
import {
  getProofLogs,
  getProofScreenshotUrl,
  loadLeaderboard,
  reviewWorkoutProof,
  saveLeaderboardSettings,
  startNewLeaderboardWeek
} from "../../api/leaderboard.api.js";
import { compressProofImage } from "./compression.js";

const env = import.meta.env || {};
const LANG_KEY = "rr_fit_language";
const THEME_KEY = "rr_fit_theme";
const DEFAULT_LANG = (env.VITE_DEFAULT_LANG || env.VITE_DEFAULT_LANGUAGE) === "en" ? "en" : "ar";
const DEFAULT_THEME = ["v1", "v2", "v3"].includes(env.VITE_DEFAULT_THEME) ? env.VITE_DEFAULT_THEME : "v1";
const THEME_KEYS = ["v1", "v2", "v3"];
const PRESET_KEYS = ["squat", "hipthrust", "plank", "latpulldown", "shoulderpress", "cardio"];
const DEFAULT_SETTINGS = {
  websiteNameEn: "R&R Fit",
  websiteNameAr: "رنا رويال فتنيس",
  coachNameEn: "Coach",
  coachNameAr: "المدربة",
  coachEmail: "",
  coachPhone: "",
  whatsappPhone: "",
  leaderboardEnabled: true,
  leaderboardPublished: true,
  strictVerification: true,
  leaderboardStage: "published",
  rewardTitleEn: "One extra free fitness class",
  rewardTitleAr: "حصة تدريبية مجانية إضافية واحدة"
};

function readPreference(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return false;
  }
  return true;
}

function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) || "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function writeCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=Lax${secure}`;
}

function deleteCookie(name) {
  document.cookie = `${encodeURIComponent(name)}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
}

const REMEMBER_EMAIL_COOKIE = "rr_remember_email";

const state = {
  lang: readPreference(LANG_KEY, DEFAULT_LANG),
  theme: readPreference(THEME_KEY, DEFAULT_THEME),
  authMode: "landing",
  authError: "",
  authNotice: "",
  authEmail: "",
  session: null,
  profile: null,
  view: "",
  admin: null,
  coach: null,
  trainee: null,
  leaderboard: null,
  selectedTraineeId: null,
  selectedWeekId: null,
  filters: {
    traineeSearch: "",
    traineeStatus: "all",
    exerciseSearch: "",
    exerciseCategory: "all",
    userSearch: "",
    userRole: "all",
    builderSearch: "",
    builderCategory: "all"
  },
  proofFile: null,
  proofWorkoutId: null,
  modalFile: null,
  confirmAction: null,
  reviewProof: null,
  loading: true,
  error: "",
  lastCreated: null
};

function t(key) {
  return I18N[state.lang]?.[key] ?? I18N.en[key] ?? key;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bi(object, field) {
  if (!object) return "";
  const suffix = state.lang === "ar" ? "Ar" : "En";
  const fallback = state.lang === "ar" ? "En" : "Ar";
  return esc(object[`${field}${suffix}`] || object[`${field}${fallback}`] || "");
}

function locale() {
  return state.lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US";
}

function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function percent(value, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(value) / Number(total)) * 100)));
}

function formatDate(value) {
  if (!value) return t("notAvailable");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("notAvailable");
  return new Intl.DateTimeFormat(locale(), { dateStyle: "medium" }).format(date);
}

function formatDateTime(value) {
  if (!value) return t("notAvailable");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("notAvailable");
  return new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat(locale()).format(Number(value) || 0);
}

function getSettings() {
  return state.admin?.settings || state.coach?.settings || state.trainee?.settings || DEFAULT_SETTINGS;
}

function brandName() {
  return state.lang === "ar"
    ? getSettings().websiteNameAr || DEFAULT_SETTINGS.websiteNameAr
    : getSettings().websiteNameEn || DEFAULT_SETTINGS.websiteNameEn;
}

function coachName() {
  return state.lang === "ar"
    ? getSettings().coachNameAr || DEFAULT_SETTINGS.coachNameAr
    : getSettings().coachNameEn || DEFAULT_SETTINGS.coachNameEn;
}

function rewardTitle() {
  const settings = state.leaderboard?.settings || getSettings();
  return state.lang === "ar" ? settings.rewardTitleAr : settings.rewardTitleEn;
}

function roleLabel(role) {
  if (role === "admin") return t("roleAdmin");
  if (role === "coach") return t("roleCoach");
  return t("roleTrainee");
}

function userName() {
  if (!state.profile) return "";
  return state.lang === "ar"
    ? state.profile.nameAr || state.profile.name_en || ""
    : state.profile.nameEn || state.profile.name_en || "";
}

function userEmail() {
  return state.profile?.email || state.session?.user?.email || "";
}

function userAvatar() {
  const style = state.profile?.avatarStyle || (state.profile?.role === "coach" ? "coach" : "maha");
  return createDrawingAvatar(style);
}

function navItems() {
  if (state.profile?.role === "admin") {
    return [
      { view: "dashboard", label: "navDashboard", icon: "dashboard" },
      { view: "users", label: "navUsers", icon: "users" },
      { view: "settings", label: "navSettings", icon: "settings" }
    ];
  }
  if (state.profile?.role === "coach") {
    return [
      { view: "dashboard", label: "navDashboard", icon: "dashboard" },
      { view: "trainees", label: "navTrainees", icon: "users" },
      { view: "exercises", label: "navExercises", icon: "dumbbell" },
      { view: "leaderboard", label: "navLeaderboardMgmt", icon: "trophy" },
      { view: "settings", label: "navSettings", icon: "settings" }
    ];
  }
  return [
    { view: "schedule", label: "navMySchedule", icon: "calendar" },
    { view: "progress", label: "navMyProgress", icon: "chart" },
    { view: "leaderboard", label: "navLeaderboard", icon: "trophy" },
    { view: "settings", label: "navSettings", icon: "settings" }
  ];
}

function defaultView(role) {
  if (role === "admin") return "dashboard";
  if (role === "coach") return "dashboard";
  return "schedule";
}

function viewMeta() {
  const role = state.profile?.role;
  if (role === "admin") {
    if (state.view === "users") return { title: t("navUsers"), subtitle: t("adminUsersSub") };
    if (state.view === "settings") return { title: t("navSettings"), subtitle: t("adminSettingsSub") };
    return { title: t("navDashboard"), subtitle: t("adminWelcomeSub") };
  }
  if (role === "coach") {
    if (state.view === "trainees") return { title: t("navTrainees"), subtitle: t("coachTraineesSub") };
    if (state.view === "exercises") return { title: t("navExercises"), subtitle: t("coachExercisesSub") };
    if (state.view === "leaderboard") return { title: t("navLeaderboardMgmt"), subtitle: t("lbMgmtSubtitle") };
    if (state.view === "settings") return { title: t("navSettings"), subtitle: t("coachSettingsSub") };
    return { title: t("navDashboard"), subtitle: t("coachWelcomeSub") };
  }
  if (state.view === "progress") return { title: t("navMyProgress"), subtitle: t("myProgressTitle") };
  if (state.view === "leaderboard") return { title: t("navLeaderboard"), subtitle: t("lbPageSubtitle") };
  if (state.view === "settings") return { title: t("navSettings"), subtitle: t("traineeSettingsSub") };
  return { title: t("navMySchedule"), subtitle: `${t("traineeScheduleSubPrefix")} ${esc(coachName())}.` };
}

function icon(name) {
  const paths = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    dumbbell: '<path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.95 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.08A1.7 1.7 0 0 0 4.6 8.95a1.7 1.7 0 0 0-.34-1.88L4.2 7.01 7.03 4.18l.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
    shield: '<path d="M12 3 4 6v5c0 5 3.4 8.2 8 10 4.6-1.8 8-5 8-10V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
    key: '<circle cx="7.5" cy="15.5" r="3.5"/><path d="m10.5 12.5 8-8M16 7l2 2M18 5l2 2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.dashboard}</svg>`;
}

function dayName(dayKey) {
  return t(`day${dayKey.charAt(0).toUpperCase()}${dayKey.slice(1)}`);
}

function dayShort(dayKey) {
  return t(`dayShort${dayKey.charAt(0).toUpperCase()}${dayKey.slice(1)}`);
}

function categoryName(categoryId) {
  const categories = state.coach?.categories || state.trainee?.categories || [];
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return categoryId || "";
  return state.lang === "ar" ? category.ar : category.en;
}

function getExercise(exerciseId) {
  const exercises = state.coach?.exercises || state.trainee?.exercises || [];
  return exercises.find((exercise) => exercise.id === exerciseId) || null;
}

function getExerciseName(exerciseId) {
  const exercise = getExercise(exerciseId);
  return exercise ? bi(exercise, "name") : t("archivedExercise");
}

function getCoachTrainee(traineeId = state.selectedTraineeId) {
  return state.coach?.trainees?.find((trainee) => trainee.id === traineeId) || null;
}

function getTraineeStats(trainee) {
  const stats = { total: 0, completed: 0, verified: 0, pending: 0, rejected: 0, skipped: 0, activeDays: 0, plannedDays: 0 };
  DAY_KEYS.forEach((dayKey) => {
    const day = trainee?.schedule?.[dayKey];
    if (!day) return;
    if (!day.isRestDay && day.items.length) stats.plannedDays += 1;
    let active = false;
    day.items.forEach((item) => {
      stats.total += 1;
      if (item.status === "completed") {
        stats.completed += 1;
        active = true;
        if (item.verificationStatus === "verified") stats.verified += 1;
        if (item.verificationStatus === "pending_review") stats.pending += 1;
        if (item.verificationStatus === "rejected") stats.rejected += 1;
      }
      if (item.status === "skipped") stats.skipped += 1;
    });
    if (active) stats.activeDays += 1;
  });
  stats.percent = percent(stats.completed, stats.total);
  return stats;
}

function currentWeek() {
  return state.coach?.currentWeek || state.trainee?.currentWeek || state.admin?.currentWeek || null;
}

function weekLabel(week) {
  return week ? bi(week, "label") : t("notAvailable");
}

function getTraineeLeaderboardEntry(traineeId) {
  return state.leaderboard?.entries?.find((entry) => entry.trainee.id === traineeId) || null;
}

function recurrenceLabel(trainee) {
  if (trainee.recurrence === "daily") return t("recDaily");
  if (trainee.recurrence === "selected_days") {
    const days = (trainee.recurrenceDays || []).map(dayShort).join(state.lang === "ar" ? "، " : ", ");
    return days ? `${t("recSelectedDays")} — ${days}` : t("recSelectedDays");
  }
  return t("recWeekly");
}

function errorMessage(error) {
  const code = String(error?.message || error || "").trim();
  const key = {
    INVALID_CREDENTIALS: "errInvalidCredentials",
    EMAIL_NOT_CONFIRMED: "errEmailNotConfirmed",
    PROFILE_MISSING: "errProfileMissing",
    INVALID_ROLE: "errInvalidRole",
    SUPABASE_NOT_CONFIGURED: "errSupabase",
    SESSION_EXPIRED: "errSessionExpired",
    AUTH_REQUIRED: "errSessionExpired",
    SESSION_INVALID: "errSessionExpired",
    PLATFORM_SETTINGS_MISSING: "errPlatformMissing",
    COACH_EXISTS: "errCoachExists",
    EMAIL_EXISTS: "errEmailExists",
    PASSWORD_WEAK: "errPasswordWeak",
    NAMES_REQUIRED: "errNamesRequired",
    EMAIL_INVALID: "errEmailInvalid",
    COACH_REQUIRED: "errCoachRequired",
    COACH_NOT_FOUND: "errCoachNotFound",
    SERVER_NOT_CONFIGURED: "errEdgeConfig",
    USER_CREATE_FAILED: "errCreateAccount",
    PROFILE_UPDATE_FAILED: "errCreateAccount",
    SETTINGS_UPDATE_FAILED: "errCreateAccount",
    NO_LIVE_WEEK: "errNoLiveWeek",
    WORKOUT_COMPLETED_LOCKED: "errWorkoutLocked",
    DAY_HAS_COMPLETED_WORKOUTS: "errDayCompleted",
    PROOF_WEIGHTS_REQUIRED: "errProofWeights",
    PROOF_SUMMARY_REQUIRED: "errProofSummary",
    PROOF_RPE_INVALID: "errProofRpe",
    PROOF_FILE_INVALID: "errProofFileType",
    PROOF_FILE_TYPE_INVALID: "errProofFileType",
    MISSING_WORKOUT: "errProofNotFound",
    PROOF_FILE_TOO_LARGE: "errProofFileSize",
    EXERCISE_MEDIA_TYPE_INVALID: "errExerciseMediaType",
    EXERCISE_MEDIA_TOO_LARGE: "errExerciseMediaSize",
    EXERCISE_NAMES_REQUIRED: "errExerciseNames",
    WEAK_PASSWORD: "errPasswordLength",
    PASSWORD_LENGTH: "errPasswordLength",
    PASSWORD_MISMATCH: "errPasswordMismatch",
    PROOF_FILE_REQUIRED: "errProofFileRequired",
    RECURRENCE_DAYS_REQUIRED: "errRecurrenceDays",
    PROOF_NOT_FOUND: "errProofNotFound",
    BRAND_NAMES_REQUIRED: "errNamesRequired",
    INVALID_PROOF_DECISION: "errGeneric",
    INVALID_ACTION: "errGeneric",
    ADMIN_REQUIRED: "errAdminRequired",
    BODY_TOO_LARGE: "errBodyTooLarge",
    TARGET_INVALID: "errTargetNotFound",
    TARGET_NOT_FOUND: "errTargetNotFound",
    TARGET_LOOKUP_FAILED: "errResetPasswordFailed",
    PASSWORD_RESET_FAILED: "errResetPasswordFailed"
  }[code];
  if (key) return t(key);
  if (/Invalid login credentials/i.test(code)) return t("errInvalidCredentials");
  if (/JWT expired|session.*expired/i.test(code)) return t("errSessionExpired");
  if (/Finalized workout results|Completed workouts cannot be deleted|Completed or skipped workouts/i.test(code)) return t("errWorkoutLocked");
  if (/Proof weights, summary, effort, and screenshot are required/i.test(code)) return t("errProofFileRequired");
  if (/Failed to send a request|FunctionsFetchError|Failed to fetch|NetworkError/i.test(code)) return t("errNetwork");
  if (/admin-users|Edge Function/i.test(code)) return t("errEdge");
  if (/duplicate key|already exists/i.test(code)) return t("errEmailExists");
  return t("errGeneric");
}

function applyDocumentPreferences() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
  document.documentElement.dataset.theme = state.theme;
  if (state.profile?.role) {
    document.documentElement.dataset.role = state.profile.role;
  } else {
    delete document.documentElement.dataset.role;
  }
}

function setLanguage(lang) {
  state.lang = lang === "en" ? "en" : "ar";
  savePreference(LANG_KEY, state.lang);
  applyDocumentPreferences();
}

function setTheme(theme) {
  state.theme = THEME_KEYS.includes(theme) ? theme : "v1";
  savePreference(THEME_KEY, state.theme);
  applyDocumentPreferences();
}

function captureFocus() {
  const active = document.activeElement;
  if (!active || !active.id) return null;
  const focus = { id: active.id };
  if (typeof active.selectionStart === "number") {
    focus.start = active.selectionStart;
    focus.end = active.selectionEnd;
  }
  return focus;
}

function restoreFocus(focus) {
  if (!focus?.id) return;
  const element = document.getElementById(focus.id);
  if (!element) return;
  element.focus();
  if (typeof focus.start === "number" && typeof element.setSelectionRange === "function") {
    element.setSelectionRange(focus.start, focus.end);
  }
}

function renderApp(focus = null) {
  if (!SUPABASE_CONFIGURED) {
    renderSetup();
    return;
  }
  if (state.loading) {
    renderLoading();
    return;
  }
  if (state.error) {
    renderWorkspaceError();
    return;
  }
  if (!state.profile) {
    renderAuth();
    return;
  }
  applyDocumentPreferences();
  const nav = navItems();
  if (!nav.some((item) => item.view === state.view)) state.view = defaultView(state.profile.role);
  const meta = viewMeta();
  const activeWeek = currentWeek();
  const todayLabel = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const scrollY = window.scrollY;
  document.title = `${brandName()} — ${meta.title}`;
  document.getElementById("app").innerHTML = `
    <div class="app-shell" data-role="${esc(state.profile.role)}">
      <header class="app-topbar">
        <div class="topbar-inner">
          <div class="brand-box app-brand">
            <div class="brand-logo brand-logo-image"><img src="${logoUrl}" alt="" /></div>
            <div class="brand-copy">
              <div class="brand-line">
                <span class="brand-title">${esc(brandName())}</span>
                <span class="role-badge">${roleLabel(state.profile.role)}</span>
                <span class="version-badge">BETA</span>
              </div>
              <span class="brand-subtitle">${t("brandTagline")}</span>
            </div>
          </div>
          <div class="topbar-actions">
            <button class="topbar-action" type="button" data-action="toggle-language" aria-label="${state.lang === "ar" ? "English" : "العربية"}">
              ${icon("globe")}<span>${state.lang === "ar" ? "English" : "العربية"}</span>
            </button>
            <div class="user-chip">
              <span class="avatar"><img src="${userAvatar()}" alt="" /></span>
              <span class="user-meta">
                <span class="user-name">${esc(userName())}</span>
                <span class="user-email">${esc(userEmail())}</span>
              </span>
            </div>
            <button class="icon-btn topbar-logout" type="button" data-action="logout" title="${t("logoutBtn")}" aria-label="${t("logoutBtn")}">${icon("logout")}</button>
          </div>
        </div>
      </header>
      <div class="app-navbar">
        <div class="navbar-inner">
          <nav class="app-nav" aria-label="${roleLabel(state.profile.role)}">
            ${nav.map((item) => `
              <button class="nav-btn ${state.view === item.view ? "active" : ""}" type="button" data-action="navigate" data-view="${item.view}">
                <span class="nav-icon">${icon(item.icon)}</span>
                <span>${t(item.label)}</span>
              </button>
            `).join("")}
          </nav>
          ${activeWeek ? `<span class="nav-context">${weekLabel(activeWeek)}</span>` : ""}
        </div>
      </div>
      <main class="workspace" id="workspace">
        <div class="page-heading">
          <div>
            <span class="eyebrow">${roleLabel(state.profile.role)}</span>
            <h1>${meta.title}</h1>
            <p>${meta.subtitle}</p>
          </div>
          <span class="page-date">${todayLabel}</span>
        </div>
        ${renderPage()}
      </main>
    </div>
  `;
  if (focus) restoreFocus(focus);
  else window.scrollTo(0, scrollY);
}

function renderLoading() {
  applyDocumentPreferences();
  document.title = brandName();
  document.getElementById("app").innerHTML = `
    <div class="app-loading" role="status" aria-live="polite">
      <div class="loading-mark loading-mark-image"><img src="${logoUrl}" alt="" /></div>
      <span class="spinner" aria-hidden="true"></span>
      <p>${t("loadingApp")}</p>
    </div>
  `;
}

function renderWorkspaceError() {
  applyDocumentPreferences();
  document.getElementById("app").innerHTML = `
    <div class="fatal-shell">
      <div class="card fatal-card">
        <div class="brand-box fatal-brand">
          <div class="brand-logo brand-logo-image"><img src="${logoUrl}" alt="" /></div>
          <div>
            <div class="brand-title">${esc(brandName())}</div>
            <div class="brand-subtitle">${t("brandTagline")}</div>
          </div>
        </div>
        <h1>${t("workspaceErrorTitle")}</h1>
        <p class="text-secondary">${esc(state.error)}</p>
        <div class="modal-actions">
          <button class="btn btn-primary" type="button" data-action="retry-workspace">${t("retryBtn")}</button>
          <button class="btn btn-secondary" type="button" data-action="logout">${t("logoutBtn")}</button>
        </div>
      </div>
    </div>
  `;
}

function renderSetup() {
  applyDocumentPreferences();
  document.getElementById("app").innerHTML = `
    <div class="setup-shell">
      <div class="card setup-card">
        <div class="brand-box">
          <div class="brand-logo brand-logo-image"><img src="${logoUrl}" alt="" /></div>
          <div>
            <div class="brand-title">R&amp;R Fit</div>
            <div class="brand-subtitle">${t("brandTagline")}</div>
          </div>
        </div>
        <h1>${t("configTitle")}</h1>
        <p class="text-secondary">${t("configBody")}</p>
        <div class="setup-steps">
          <p>${t("configStep1")}</p>
          <pre><code>VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key</code></pre>
          <p>${t("configStep2")}</p>
          <p>${t("configStep3")}</p>
        </div>
        <div class="alert alert-warning">${t("configSecretWarning")}</div>
        <button class="btn btn-primary" type="button" data-action="reload-page">${t("reloadBtn")}</button>
      </div>
    </div>
  `;
}

function renderPage() {
  if (state.profile.role === "admin") {
    if (state.view === "users") return renderAdminUsers();
    if (state.view === "settings") return renderAdminSettings();
    return renderAdminDashboard();
  }
  if (state.profile.role === "coach") {
    if (state.view === "trainees") return renderCoachTrainees();
    if (state.view === "exercises") return renderCoachExercises();
    if (state.view === "leaderboard") return renderLeaderboardManagement();
    if (state.view === "settings") return renderCoachSettings();
    return renderCoachDashboard();
  }
  if (state.view === "progress") return renderTraineeProgress();
  if (state.view === "leaderboard") return renderTraineeLeaderboard();
  if (state.view === "settings") return renderTraineeSettings();
  return renderTraineeSchedule();
}

function kpiCard(label, value, iconName, sub = "") {
  return `
    <div class="kpi-card">
      <div class="kpi-top"><span>${label}</span><span class="kpi-icon">${icon(iconName)}</span></div>
      <div class="kpi-value">${value}</div>
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ""}
    </div>
  `;
}

function emptyState(title, body, action = "") {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon("check")}</div>
      <h3>${title}</h3>
      <p>${body}</p>
      ${action}
    </div>
  `;
}

function progressBar(value) {
  return `<div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, value))}%"></div></div>`;
}

function statusBadge(active) {
  return `<span class="badge ${active ? "badge-success" : "badge-danger"}">${active ? t("statusActive") : t("statusExpired")}</span>`;
}

function verificationBadge(status) {
  if (status === "verified") return `<span class="badge badge-success">${t("proofVerifiedBadge")}</span>`;
  if (status === "pending_review") return `<span class="badge badge-warning">${t("proofPendingBadge")}</span>`;
  if (status === "rejected") return `<span class="badge badge-danger">${t("proofRejectedBadge")}</span>`;
  return `<span class="badge badge-neutral">${t("notReviewed")}</span>`;
}

function entityCell(avatarUrl, name, meta, sub = "") {
  return `
    <div class="entity-cell">
      <span class="avatar avatar-lg"><img src="${avatarUrl}" alt="" /></span>
      <span class="entity-copy">
        <strong>${name}</strong>
        <span>${meta}</span>
        ${sub ? `<small>${sub}</small>` : ""}
      </span>
    </div>
  `;
}

function inputField(name, label, value, options = {}) {
  const type = options.type || "text";
  const required = options.required ? "required" : "";
  return `
    <div class="form-group">
      <label class="form-label" for="${name}">${label}</label>
      <input class="form-control ${type === "email" || type === "tel" ? "ltr-field" : ""}" id="${name}" name="${name}" type="${type}" value="${esc(value || "")}" ${required} />
    </div>
  `;
}

function boot() {
  applyDocumentPreferences();
  if (!SUPABASE_CONFIGURED) {
    state.loading = false;
    renderSetup();
    return;
  }
  const recovery = new URLSearchParams(window.location.search).get("mode") === "reset-password"
    || window.location.hash.includes("type=recovery")
    || window.location.hash.includes("type=invite");
  if (recovery) state.authMode = "reset-password";
  bootSession();
  onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      state.session = session || state.session;
      state.authMode = "reset-password";
      state.authError = "";
      renderAuth();
    }
    if (event === "SIGNED_OUT" && !state.loading && state.profile) {
      state.profile = null;
      state.session = null;
      state.authMode = "landing";
      renderAuth();
    }
  });
}

async function bootSession() {
  try {
    const auth = await getCurrentAuth();
    state.session = auth.session;
    state.profile = auth.profile;
    if (state.authMode === "reset-password") {
      state.loading = false;
      if (!auth.session) state.authError = t("authResetExpired");
      renderAuth();
      return;
    }
    if (auth.session && !auth.profile) {
      await logout();
      state.loading = false;
      state.authMode = "login";
      state.authError = t("errProfileMissing");
      renderAuth();
      return;
    }
    if (auth.profile) {
      await enterWorkspace(auth.profile);
      return;
    }
    state.loading = false;
    renderAuth();
  } catch (error) {
    state.loading = false;
    state.authMode = "login";
    state.authError = errorMessage(error);
    renderAuth();
  }
}

async function enterWorkspace(profile) {
  state.profile = profile;
  state.view = defaultView(profile.role);
  state.selectedTraineeId = null;
  state.selectedWeekId = null;
  state.authError = "";
  state.authNotice = "";
  closeModal();
  await loadRoleWorkspace();
}

async function loadRoleWorkspace() {
  state.loading = true;
  state.error = "";
  renderLoading();
  try {
    if (state.profile.role === "admin") {
      state.admin = await loadAdminWorkspace();
      state.coach = null;
      state.trainee = null;
      state.leaderboard = null;
    } else if (state.profile.role === "coach") {
      const [coach, leaderboard] = await Promise.all([
        loadCoachWorkspace(),
        loadLeaderboard({ weekId: state.selectedWeekId })
      ]);
      state.coach = coach;
      state.leaderboard = leaderboard;
      state.admin = null;
      state.trainee = null;
    } else {
      const [trainee, leaderboard] = await Promise.all([
        loadTraineeWorkspace(),
        loadLeaderboard({ weekId: state.selectedWeekId })
      ]);
      state.trainee = trainee;
      state.leaderboard = leaderboard;
      state.admin = null;
      state.coach = null;
    }
    state.loading = false;
    renderApp();
  } catch (error) {
    state.loading = false;
    state.error = errorMessage(error);
    renderWorkspaceError();
  }
}

async function refreshWorkspaceData() {
  if (state.profile.role === "admin") {
    state.admin = await loadAdminWorkspace();
  } else if (state.profile.role === "coach") {
    const [coach, leaderboard] = await Promise.all([
      loadCoachWorkspace(),
      loadLeaderboard({ weekId: state.selectedWeekId })
    ]);
    state.coach = coach;
    state.leaderboard = leaderboard;
  } else {
    const [trainee, leaderboard] = await Promise.all([
      loadTraineeWorkspace(),
      loadLeaderboard({ weekId: state.selectedWeekId })
    ]);
    state.trainee = trainee;
    state.leaderboard = leaderboard;
  }
  renderApp();
}

async function refreshLeaderboardData() {
  state.leaderboard = await loadLeaderboard({ weekId: state.selectedWeekId });
  renderApp();
}

async function refreshProfileState() {
  const profile = await refreshProfile();
  if (profile) state.profile = profile;
}

function renderLanding() {
  const brand = brandName();
  const languageLabel = state.lang === "ar" ? "English" : "العربية";
  const year = new Date().getFullYear();
  const weekDays = [
    ["Mon", "done"],
    ["Tue", "done"],
    ["Wed", "today"],
    ["Thu", "done"],
    ["Fri", "done"],
    ["Sat", "rest"],
    ["Sun", "pending"]
  ];
  document.title = `${brand} — ${t("landingMetaTitle")}`;
  document.getElementById("app").innerHTML = `
    <div class="landing-shell" id="top">
      <header class="landing-header">
        <div class="landing-header-inner">
          <a class="landing-brand" href="#top" aria-label="${esc(brand)}">
            <span class="landing-logo"><img src="${logoUrl}" alt="" /></span>
            <span class="landing-brand-copy">
              <strong>${esc(brand)}</strong>
              <span>${t("landingFooterTagline")}</span>
            </span>
          </a>
          <nav class="landing-nav" aria-label="${t("landingEyebrow")}">
            <a href="#method">${t("landingNavMethod")}</a>
            <a href="#how-it-works">${t("landingNavHow")}</a>
            <a href="#experience">${t("landingNavExperience")}</a>
          </nav>
          <div class="landing-header-actions">
            <button class="landing-lang" type="button" data-action="toggle-language" aria-label="${languageLabel}">
              ${icon("globe")}<span>${languageLabel}</span>
            </button>
            <button class="btn btn-secondary landing-signin" type="button" data-auth-mode="login">${t("landingSignIn")}</button>
          </div>
        </div>
      </header>

      <main>
        <section class="landing-hero">
          <div class="landing-hero-inner">
            <div class="landing-hero-copy">
              <span class="landing-kicker"><i></i>${t("landingEyebrow")}</span>
              <h1>${t("landingHeroTitle")}</h1>
              <p>${t("landingHeroBody")}</p>
              <div class="landing-hero-actions">
                <button class="btn btn-primary landing-primary" type="button" data-auth-mode="login">
                  <span>${t("landingStartBtn")}</span>${icon("arrow")}
                </button>
                <a class="btn btn-secondary landing-secondary" href="#how-it-works">${t("landingLearnMore")}</a>
              </div>
              <p class="landing-hero-note">${icon("lock")}<span>${t("landingHeroNote")}</span></p>
              <ul class="landing-trust">
                <li>${icon("check")}<span>${t("landingTrust1")}</span></li>
                <li>${icon("check")}<span>${t("landingTrust2")}</span></li>
                <li>${icon("check")}<span>${t("landingTrust3")}</span></li>
              </ul>
            </div>

            <div class="landing-hero-visual" aria-hidden="true">
              <span class="landing-visual-orbit orbit-one"></span>
              <span class="landing-visual-orbit orbit-two"></span>
              <div class="landing-visual-main">
                <div class="landing-visual-top">
                  <div class="landing-visual-title">
                    <span class="landing-visual-icon">${icon("calendar")}</span>
                    <div><span>${t("landingVisualWeek")}</span><strong>${t("landingVisualScore")}</strong></div>
                  </div>
                  <span class="landing-week-badge">${t("landingVisualWeekBadge")}</span>
                </div>
                <div class="landing-score-row">
                  <strong>78%</strong>
                  <span>${t("landingVisualPace")}</span>
                </div>
                <div class="landing-score-bar"><span></span></div>
                <div class="landing-visual-stats">
                  <div><strong>${t("landingVisualSessions")}</strong><span>${t("landingVisualSessionsLabel")}</span></div>
                  <div><strong>${t("landingVisualStreak")}</strong><span>${t("landingVisualStreakLabel")}</span></div>
                </div>
                <div class="landing-next-session">
                  <span class="landing-next-icon">${icon("dumbbell")}</span>
                  <div>
                    <span>${t("landingVisualNext")}</span>
                    <strong>${t("landingVisualWorkout")}</strong>
                    <small>${t("landingVisualWorkoutMeta")}</small>
                  </div>
                  <span class="landing-status">${t("landingVisualUpNext")}</span>
                </div>
              </div>
              <div class="landing-proof-card">
                <span class="landing-proof-icon">${icon("check")}</span>
                <div><strong>${t("landingVisualReviewed")}</strong><span>${t("landingVisualReviewedBody")}</span></div>
              </div>
            </div>
          </div>
        </section>

        <section class="landing-section landing-method" id="method">
          <div class="landing-section-inner">
            <div class="landing-section-head">
              <span class="landing-label">${t("landingMethodLabel")}</span>
              <h2>${t("landingMethodTitle")}</h2>
              <p>${t("landingMethodBody")}</p>
            </div>
            <div class="landing-feature-grid">
              <article class="landing-feature">
                <span class="landing-feature-icon">${icon("calendar")}</span>
                <span class="landing-feature-index">01</span>
                <h3>${t("landingFeature1Title")}</h3>
                <p>${t("landingFeature1Body")}</p>
              </article>
              <article class="landing-feature">
                <span class="landing-feature-icon">${icon("shield")}</span>
                <span class="landing-feature-index">02</span>
                <h3>${t("landingFeature2Title")}</h3>
                <p>${t("landingFeature2Body")}</p>
              </article>
              <article class="landing-feature">
                <span class="landing-feature-icon">${icon("trophy")}</span>
                <span class="landing-feature-index">03</span>
                <h3>${t("landingFeature3Title")}</h3>
                <p>${t("landingFeature3Body")}</p>
              </article>
            </div>
          </div>
        </section>

        <section class="landing-section landing-how" id="how-it-works">
          <div class="landing-section-inner">
            <div class="landing-how-head">
              <div>
                <span class="landing-label">${t("landingHowLabel")}</span>
                <h2>${t("landingHowTitle")}</h2>
              </div>
              <p>${t("landingHowBody")}</p>
            </div>
            <div class="landing-steps">
              <article class="landing-step">
                <span class="landing-step-number">01</span>
                <h3>${t("landingStep1Title")}</h3>
                <p>${t("landingStep1Body")}</p>
              </article>
              <article class="landing-step">
                <span class="landing-step-number">02</span>
                <h3>${t("landingStep2Title")}</h3>
                <p>${t("landingStep2Body")}</p>
              </article>
              <article class="landing-step">
                <span class="landing-step-number">03</span>
                <h3>${t("landingStep3Title")}</h3>
                <p>${t("landingStep3Body")}</p>
              </article>
            </div>
            <button class="btn landing-how-cta" type="button" data-auth-mode="login">${t("landingHowCta")}${icon("arrow")}</button>
          </div>
        </section>

        <section class="landing-section landing-experience" id="experience">
          <div class="landing-experience-inner">
            <div class="landing-plan-visual" aria-hidden="true">
              <div class="landing-plan-card">
                <div class="landing-plan-head">
                  <div><span>${t("landingVisualPlanTitle")}</span><strong>${t("landingVisualPlanScore")}</strong></div>
                  <span class="landing-week-badge">${t("landingVisualWeekBadge")}</span>
                </div>
                <div class="landing-week-row">
                  ${weekDays.map(([day, status]) => `<div class="landing-day ${status}"><span>${t(`dayShort${day}`)}</span><i></i></div>`).join("")}
                </div>
                <div class="landing-session-list">
                  <div class="landing-session done">
                    <span class="landing-session-icon">${icon("check")}</span>
                    <div><strong>${t("landingVisualSession1")}</strong><span>${t("landingVisualDone")}</span></div>
                    <span class="landing-session-state">${t("landingVisualDone")}</span>
                  </div>
                  <div class="landing-session active">
                    <span class="landing-session-icon">${icon("dumbbell")}</span>
                    <div><strong>${t("landingVisualSession2")}</strong><span>${t("landingVisualWorkoutMeta")}</span></div>
                    <span class="landing-session-state">${t("landingVisualUpNext")}</span>
                  </div>
                  <div class="landing-session rest">
                    <span class="landing-session-icon">${icon("check")}</span>
                    <div><strong>${t("landingVisualRest")}</strong><span>${t("landingVisualDone")}</span></div>
                    <span class="landing-session-state">${t("landingVisualDone")}</span>
                  </div>
                </div>
                <p class="landing-plan-note">${t("landingVisualNote")}</p>
              </div>
            </div>

            <div class="landing-experience-copy">
              <span class="landing-label">${t("landingExperienceLabel")}</span>
              <h2>${t("landingExperienceTitle")}</h2>
              <p>${t("landingExperienceBody")}</p>
              <ul class="landing-experience-points">
                <li><span>01</span><div><strong>${t("landingExperiencePoint1")}</strong><p>${t("landingExperiencePoint1Body")}</p></div></li>
                <li><span>02</span><div><strong>${t("landingExperiencePoint2")}</strong><p>${t("landingExperiencePoint2Body")}</p></div></li>
                <li><span>03</span><div><strong>${t("landingExperiencePoint3")}</strong><p>${t("landingExperiencePoint3Body")}</p></div></li>
              </ul>
            </div>
          </div>
        </section>

        <section class="landing-final">
          <div class="landing-final-card">
            <div>
              <span class="landing-label">${t("landingFinalEyebrow")}</span>
              <h2>${t("landingFinalTitle")}</h2>
              <p>${t("landingFinalBody")}</p>
            </div>
            <div class="landing-final-actions">
              <button class="btn btn-secondary" type="button" data-auth-mode="login">${t("landingFinalBtn")}</button>
              <a class="landing-text-link" href="#method">${t("landingFinalSecondary")} ${icon("arrow")}</a>
            </div>
          </div>
        </section>
      </main>

      <footer class="landing-footer">
        <div class="landing-footer-inner">
          <div class="landing-footer-brand">
            <span class="landing-logo"><img src="${logoUrl}" alt="" /></span>
            <div><strong>${esc(brand)}</strong><span>${t("landingFooterTagline")}</span></div>
          </div>
          <p class="landing-footer-note">${t("landingFooterNote")}</p>
          <div class="landing-footer-actions">
            <button class="landing-lang" type="button" data-action="toggle-language" aria-label="${languageLabel}">
              ${icon("globe")}<span>${languageLabel}</span>
            </button>
            <button class="btn btn-secondary landing-signin" type="button" data-auth-mode="login">${t("landingSignIn")}</button>
          </div>
        </div>
        <div class="landing-footer-bottom">
          <span>© ${year} ${esc(brand)}. ${t("landingCopyright")}</span>
          <span>${t("landingMetaTitle")}</span>
        </div>
      </footer>
    </div>
  `;
}

function renderAuth() {
  applyDocumentPreferences();
  if (state.authMode === "landing") {
    renderLanding();
    return;
  }
  const mode = state.authMode;
  const brand = state.lang === "ar" ? DEFAULT_SETTINGS.websiteNameAr : DEFAULT_SETTINGS.websiteNameEn;
  const tagline = t("authTagline");
  const rememberedEmail = readCookie(REMEMBER_EMAIL_COOKIE);
  const recoveryWithoutSession = mode === "reset-password" && !state.session;
  const forms = {
    login: `
      <form data-form="login" class="auth-form">
        <div class="auth-heading">
          <h1>${t("authLoginTitle")}</h1>
          <p>${t("authLoginSub")}</p>
        </div>
        <div class="auth-message ${state.authNotice ? "visible success" : ""}" data-auth-notice role="status">${esc(state.authNotice)}</div>
        <div class="auth-message ${state.authError ? "visible" : ""}" data-auth-error role="alert">${esc(state.authError)}</div>
        <div class="form-group">
          <label class="form-label" for="loginEmail">${t("emailLabel")}</label>
          <input class="form-control ltr-field" id="loginEmail" name="email" type="email" autocomplete="email" value="${esc(state.authEmail || rememberedEmail)}" required autofocus />
        </div>
        <div class="form-group">
          <label class="form-label" for="loginPassword">${t("passwordLabel")}</label>
          <div class="password-field">
            <input class="form-control" id="loginPassword" name="password" type="password" autocomplete="current-password" required />
            <button class="password-toggle" type="button" data-action="toggle-password" aria-label="${t("showPassword")}">${t("showShort")}</button>
          </div>
        </div>
        <div class="remember-row">
          <label class="switch"><input type="checkbox" name="remember" value="1" ${rememberedEmail ? "checked" : ""} /><span></span></label>
          <span>${t("rememberMe")}</span>
        </div>
        <button class="btn btn-primary auth-submit" type="submit">${t("authSignInBtn")}</button>
        <p class="auth-note">${t("authNoSignup")}</p>
      </form>
    `,
    "reset-password": recoveryWithoutSession ? `
      <div class="auth-form">
        <div class="auth-heading">
          <h1>${t("authResetExpiredTitle")}</h1>
          <p>${t("authResetExpired")}</p>
        </div>
        <div class="auth-message visible" role="alert">${esc(state.authError)}</div>
        <button class="btn btn-primary auth-submit" type="button" data-auth-mode="login">${t("authBackToLogin")}</button>
      </div>
    ` : `
      <form data-form="reset-password" class="auth-form">
        <div class="auth-heading">
          <h1>${t("authResetTitle")}</h1>
          <p>${t("authResetSub")}</p>
        </div>
        <div class="auth-message ${state.authError ? "visible" : ""}" data-auth-error role="alert">${esc(state.authError)}</div>
        <div class="form-group">
          <label class="form-label" for="resetPassword">${t("authNewPasswordLabel")}</label>
          <div class="password-field">
            <input class="form-control" id="resetPassword" name="password" type="password" minlength="10" autocomplete="new-password" required autofocus />
            <button class="password-toggle" type="button" data-action="toggle-password" aria-label="${t("showPassword")}">${t("showShort")}</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="resetConfirm">${t("confirmPasswordLabel")}</label>
          <input class="form-control" id="resetConfirm" name="confirmPassword" type="password" minlength="10" autocomplete="new-password" required />
        </div>
        <button class="btn btn-primary auth-submit" type="submit">${t("authUpdatePasswordBtn")}</button>
      </form>
    `
  };
  document.title = brand;
  document.getElementById("app").innerHTML = `
    <div class="auth-shell">
      <aside class="auth-brand-panel">
        <div class="auth-brand-top">
          <div class="brand-logo brand-logo-image auth-logo"><img src="${logoUrl}" alt="" /></div>
          <div>
            <div class="brand-title auth-brand-title">${esc(brand)}</div>
            <div class="brand-subtitle">${t("brandTagline")}</div>
          </div>
        </div>
        <div class="auth-visual">
          <div class="auth-orbit orbit-one"></div>
          <div class="auth-orbit orbit-two"></div>
          <div class="auth-avatar-stack">
            <img class="auth-avatar main" src="${createDrawingAvatar("coach")}" alt="" />
            <img class="auth-avatar small one" src="${createDrawingAvatar("sara")}" alt="" />
            <img class="auth-avatar small two" src="${createDrawingAvatar("reem")}" alt="" />
          </div>
          <img class="auth-stickman" src="${createStickmanGif("plank")}" alt="" />
        </div>
        <div class="auth-brand-copy">
          <span class="eyebrow">${t("authEyebrow")}</span>
          <h2>${esc(tagline)}</h2>
          <ul class="auth-features">
            <li>${icon("check")}<span>${t("authFeature1")}</span></li>
            <li>${icon("check")}<span>${t("authFeature2")}</span></li>
            <li>${icon("check")}<span>${t("authFeature3")}</span></li>
          </ul>
        </div>
      </aside>
      <main class="auth-panel">
        <div class="auth-topbar">
          <div class="auth-mobile-top-brand">
            <div class="brand-logo brand-logo-image auth-logo"><img src="${logoUrl}" alt="" /></div>
            <div class="brand-title">${esc(brand)}</div>
          </div>
          <div class="auth-topbar-actions">
            <button class="auth-home-btn" type="button" data-auth-mode="landing">${icon("arrow")}<span>${t("landingBackHome")}</span></button>
            <button class="btn btn-secondary btn-sm auth-lang-btn" type="button" data-action="toggle-language">${icon("globe")}<span>${state.lang === "ar" ? "English" : "العربية"}</span></button>
          </div>
        </div>
        <div class="auth-card">
          ${forms[mode] || forms.login}
        </div>
        <p class="auth-footer">${esc(brand)}</p>
      </main>
    </div>
  `;
}

function renderAdminDashboard() {
  const workspace = state.admin;
  if (!workspace) return "";
  const coach = workspace.coach;
  const week = workspace.currentWeek;
  return `
    <div class="view-stack">
      <section class="welcome-card">
        <div>
          <span class="eyebrow">${t("adminOverview")}</span>
          <h2>${t("adminWelcomeTitle")}</h2>
          <p>${t("adminWelcomeBody")}</p>
        </div>
        <div class="welcome-actions">
          <button class="btn btn-secondary" type="button" data-action="navigate" data-view="users">${icon("users")}${t("manageUsersBtn")}</button>
          ${coach
            ? `<button class="btn btn-primary" type="button" data-action="navigate" data-view="settings">${icon("settings")}${t("brandSettingsBtn")}</button>`
            : `<button class="btn btn-primary" type="button" data-action="open-create-coach">${icon("plus")}${t("createCoachBtn")}</button>`}
        </div>
      </section>

      <section class="kpi-grid">
        ${kpiCard(t("kpiTrainees"), formatNumber(workspace.stats.totalTrainees), "users", weekLabel(week))}
        ${kpiCard(t("kpiActivePlans"), formatNumber(workspace.stats.activeSubscriptions), "check", t("kpiActivePlansSub"))}
        ${kpiCard(t("kpiPendingProofs"), formatNumber(workspace.stats.pendingProofs), "shield", t("kpiPendingProofsSub"))}
        ${kpiCard(t("kpiCoaches"), formatNumber(workspace.stats.totalCoaches), "shield", coach ? (state.lang === "ar" ? coach.nameAr : coach.nameEn) : t("noCoachYet"))}
      </section>

      <div class="dashboard-grid">
        <section class="card">
          <div class="card-header">
            <div><h2>${t("coachAccountTitle")}</h2><p>${t("coachAccountSub")}</p></div>
            ${coach ? `<span class="badge badge-success">${t("statusActive")}</span>` : `<span class="badge badge-warning">${t("setupNeeded")}</span>`}
          </div>
          ${coach ? `
            <div class="coach-profile-row">
              ${entityCell(createDrawingAvatar("coach"), esc(state.lang === "ar" ? coach.nameAr : coach.nameEn), esc(coach.email), roleLabel("coach"))}
            </div>
            <div class="detail-grid">
              <div class="detail-item"><span>${t("joinedLabel")}</span><strong>${formatDate(coach.createdAt)}</strong></div>
              <div class="detail-item"><span>${t("traineesLabel")}</span><strong>${formatNumber(workspace.stats.totalTrainees)}</strong></div>
              <div class="detail-item"><span>${t("subscriptionLabel")}</span><strong>${coach.subscriptionActive ? t("statusActive") : t("statusExpired")}</strong></div>
            </div>
          ` : `
            ${emptyState(t("noCoachTitle"), t("noCoachBody"), `<button class="btn btn-primary" type="button" data-action="open-create-coach">${t("createCoachBtn")}</button>`)}
          `}
        </section>

        <section class="card">
          <div class="card-header">
            <div><h2>${t("recentUsersTitle")}</h2><p>${t("recentUsersSub")}</p></div>
            <button class="link-btn" type="button" data-action="navigate" data-view="users">${t("viewAllBtn")}</button>
          </div>
          <div class="activity-list">
            ${workspace.recentUsers.length ? workspace.recentUsers.map((user) => `
              <div class="activity-row">
                <span class="avatar"><img src="${createDrawingAvatar(user.avatarStyle)}" alt="" /></span>
                <div class="activity-copy">
                  <strong>${esc(state.lang === "ar" ? user.nameAr : user.nameEn)}</strong>
                  <span>${esc(user.email)}</span>
                </div>
                <div class="activity-side">
                  <span class="badge badge-neutral">${roleLabel(user.role)}</span>
                  <small>${formatDate(user.createdAt)}</small>
                </div>
              </div>
            `).join("") : emptyState(t("noUsersTitle"), t("noUsersBody"))}
          </div>
        </section>
      </div>
    </div>
  `;
}

function filteredAdminUsers() {
  const users = state.admin?.users || [];
  const search = state.filters.userSearch.trim().toLowerCase();
  return users.filter((user) => {
    const matchesRole = state.filters.userRole === "all" || user.role === state.filters.userRole;
    const haystack = `${user.nameEn} ${user.nameAr} ${user.email} ${user.phone}`.toLowerCase();
    return matchesRole && (!search || haystack.includes(search));
  });
}

function renderAdminUsers() {
  const users = filteredAdminUsers();
  const workspace = state.admin;
  if (!workspace) return "";
  const coach = workspace.coach;
  return `
    <div class="view-stack">
      <section class="toolbar-card">
        <div class="toolbar-main">
          <div class="search-box">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input class="form-control" id="adminUserSearch" data-filter="userSearch" value="${esc(state.filters.userSearch)}" placeholder="${t("searchUsersPlaceholder")}" aria-label="${t("searchUsersPlaceholder")}" />
          </div>
          <select class="form-control select-control" id="adminRoleFilter" data-filter="userRole" aria-label="${t("filterByRole")}">
            <option value="all" ${state.filters.userRole === "all" ? "selected" : ""}>${t("allRoles")}</option>
            <option value="admin" ${state.filters.userRole === "admin" ? "selected" : ""}>${t("roleAdmin")}</option>
            <option value="coach" ${state.filters.userRole === "coach" ? "selected" : ""}>${t("roleCoach")}</option>
            <option value="trainee" ${state.filters.userRole === "trainee" ? "selected" : ""}>${t("roleTrainee")}</option>
          </select>
          <button class="btn btn-primary" type="button" data-action="open-create-coach" ${coach ? "disabled" : ""}>${icon("plus")}${coach ? t("coachExists") : t("createCoachBtn")}</button>
        </div>
        <div class="toolbar-meta">${t("showingUsers")} <strong>${formatNumber(users.length)}</strong> ${t("ofUsers")} ${formatNumber(workspace.users.length)}</div>
      </section>

      <section class="card table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>${t("userColumn")}</th><th>${t("roleColumn")}</th><th>${t("accessColumn")}</th><th>${t("joinedColumn")}</th><th class="actions-column">${t("actionsColumn")}</th></tr></thead>
            <tbody>
              ${users.length ? users.map((user) => `
                <tr>
                  <td>${entityCell(createDrawingAvatar(user.avatarStyle), esc(state.lang === "ar" ? user.nameAr : user.nameEn), esc(user.email), user.phone ? esc(user.phone) : "")}</td>
                  <td><span class="badge ${user.role === "admin" ? "badge-dark" : user.role === "coach" ? "badge-info" : "badge-neutral"}">${roleLabel(user.role)}</span></td>
                  <td>${user.role === "trainee" ? statusBadge(user.subscriptionActive && user.planUnlocked) : `<span class="badge badge-success">${t("statusActive")}</span>`}</td>
                  <td class="nowrap">${formatDate(user.createdAt)}</td>
                  <td class="table-actions">
                    ${user.role === "trainee" ? `
                      <button class="btn btn-sm ${user.subscriptionActive ? "btn-danger-soft" : "btn-secondary"}" type="button" data-action="toggle-user-subscription" data-user-id="${user.id}" data-active="${user.subscriptionActive ? "true" : "false"}">
                        ${icon(user.subscriptionActive ? "lock" : "unlock")}${user.subscriptionActive ? t("lockAccessBtn") : t("unlockAccessBtn")}
                      </button>
                    ` : ""}
                    <button class="btn btn-sm btn-secondary" type="button" data-action="reset-user-password" data-user-id="${user.id}" data-email="${esc(user.email)}">
                      ${icon("key")}${t("resetPasswordBtn")}
                    </button>
                  </td>
                </tr>
              `).join("") : `<tr><td colspan="5">${emptyState(t("noUsersFoundTitle"), t("noUsersFoundBody"))}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function renderAdminSettings() {
  const admin = state.profile;
  const settings = state.admin?.settings || DEFAULT_SETTINGS;
  return `
    <div class="view-stack settings-stack">
      <section class="card">
        <div class="card-header"><div><h2>${t("brandIdentityTitle")}</h2><p>${t("brandIdentitySub")}</p></div><span class="badge badge-info">${t("adminOnly")}</span></div>
        <form data-form="admin-brand-settings" class="form-grid">
          <div class="form-group">
            <label class="form-label" for="brandNameEn">${t("websiteNameEnLabel")}</label>
            <input class="form-control ltr-field" id="brandNameEn" name="websiteNameEn" value="${esc(settings.websiteNameEn)}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="brandNameAr">${t("websiteNameArLabel")}</label>
            <input class="form-control" id="brandNameAr" name="websiteNameAr" value="${esc(settings.websiteNameAr)}" required />
          </div>
          <div class="form-actions span-full">
            <button class="btn btn-primary" type="submit">${t("saveBrandBtn")}</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-header"><div><h2>${t("adminProfileTitle")}</h2><p>${t("adminProfileSub")}</p></div></div>
        <form data-form="admin-profile" class="form-grid">
          <div class="form-group">
            <label class="form-label" for="adminNameEn">${t("nameEnLabel")}</label>
            <input class="form-control ltr-field" id="adminNameEn" name="nameEn" value="${esc(admin.nameEn)}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="adminNameAr">${t("nameArLabel")}</label>
            <input class="form-control" id="adminNameAr" name="nameAr" value="${esc(admin.nameAr)}" required />
          </div>
          <div class="form-group span-full">
            <label class="form-label" for="adminEmail">${t("emailLabel")}</label>
            <input class="form-control ltr-field" id="adminEmail" name="email" type="email" value="${esc(admin.email)}" required />
            <p class="form-hint">${t("emailChangeHint")}</p>
          </div>
          <div class="form-actions span-full">
            <button class="btn btn-primary" type="submit">${t("saveProfileBtn")}</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-header"><div><h2>${t("appearanceTitle")}</h2><p>${t("appearanceSub")}</p></div></div>
        ${renderThemePicker()}
        <div class="settings-divider"></div>
        <div class="setting-row">
          <div><strong>${t("languageTitle")}</strong><p>${t("languageSub")}</p></div>
          <div class="segmented">
            <button class="${state.lang === "ar" ? "active" : ""}" type="button" data-action="set-language" data-lang="ar">العربية</button>
            <button class="${state.lang === "en" ? "active" : ""}" type="button" data-action="set-language" data-lang="en">English</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><div><h2>${t("securityTitle")}</h2><p>${t("securitySub")}</p></div>${icon("shield")}</div>
        <div class="setting-row">
          <div><strong>${t("changePasswordTitle")}</strong><p>${t("changePasswordSub")}</p></div>
          <button class="btn btn-secondary" type="button" data-action="open-change-password">${t("changePasswordBtn")}</button>
        </div>
        <div class="setting-row">
          <div><strong>${t("resetEmailTitle")}</strong><p>${t("resetEmailSub")}</p></div>
          <button class="btn btn-secondary" type="button" data-action="send-reset-email" data-email="${esc(admin.email)}">${t("sendResetEmailBtn")}</button>
        </div>
      </section>
    </div>
  `;
}

function renderThemePicker() {
  const themes = [
    { id: "v1", name: t("themeBlush"), colors: ["#7A1C3E", "#C59B27", "#F8F7F4"] },
    { id: "v2", name: t("themeOlive"), colors: ["#1C1E24", "#C88A9E", "#F4F4F1"] },
    { id: "v3", name: t("themeMidnight"), colors: ["#A94B66", "#121316", "#FBF8F7"] }
  ];
  return `
    <div class="theme-picker">
      ${themes.map((theme) => `
        <button class="theme-option ${state.theme === theme.id ? "active" : ""}" type="button" data-action="set-theme" data-theme="${theme.id}">
          <span class="theme-swatches">${theme.colors.map((color) => `<i style="background:${color}"></i>`).join("")}</span>
          <span>${theme.name}</span>
          ${state.theme === theme.id ? icon("check") : ""}
        </button>
      `).join("")}
    </div>
  `;
}

function allPendingProofs() {
  const rows = [];
  (state.coach?.trainees || []).forEach((trainee) => {
    DAY_KEYS.forEach((dayKey) => {
      (trainee.schedule?.[dayKey]?.items || []).forEach((item) => {
        if (item.status === "completed" && item.verificationStatus === "pending_review") {
          rows.push({ trainee, item, dayKey });
        }
      });
    });
  });
  return rows.sort((a, b) => new Date(b.item.completedAt || 0) - new Date(a.item.completedAt || 0));
}

function renderCoachDashboard() {
  const workspace = state.coach;
  if (!workspace) return "";
  const trainees = workspace.trainees || [];
  const activeTrainees = trainees.filter((trainee) => trainee.subscriptionActive && trainee.planUnlocked);
  const stats = trainees.map(getTraineeStats);
  const totalWorkouts = stats.reduce((sum, item) => sum + item.total, 0);
  const completedWorkouts = stats.reduce((sum, item) => sum + item.completed, 0);
  const pending = allPendingProofs();
  const completion = percent(completedWorkouts, totalWorkouts);
  return `
    <div class="view-stack">
      <section class="welcome-card coach-welcome">
        <div>
          <span class="eyebrow">${weekLabel(workspace.currentWeek)}</span>
          <h2>${t("coachWelcomeTitle")}</h2>
          <p>${t("coachWelcomeBody")}</p>
        </div>
        <div class="welcome-actions">
          <button class="btn btn-secondary" type="button" data-action="open-create-trainee">${icon("plus")}${t("createTraineeBtn")}</button>
          <button class="btn btn-primary" type="button" data-action="navigate" data-view="trainees">${icon("calendar")}${t("editSchedulesBtn")}</button>
        </div>
      </section>

      ${!workspace.currentWeek ? `<div class="alert alert-warning">${t("noLiveWeekWarning")}</div>` : ""}

      <section class="kpi-grid">
        ${kpiCard(t("kpiMyTrainees"), formatNumber(trainees.length), "users", t("kpiMyTraineesSub"))}
        ${kpiCard(t("kpiActivePlans"), formatNumber(activeTrainees.length), "check", t("kpiActivePlansSub"))}
        ${kpiCard(t("kpiPendingProofs"), formatNumber(pending.length), "shield", t("kpiPendingProofsSub"))}
        ${kpiCard(t("kpiWeeklyCompletion"), `${completion}%`, "chart", `${formatNumber(completedWorkouts)} / ${formatNumber(totalWorkouts)}`)}
      </section>

      <div class="dashboard-grid">
        <section class="card">
          <div class="card-header">
            <div><h2>${t("pendingProofsTitle")}</h2><p>${t("pendingProofsSub")}</p></div>
            <span class="badge badge-warning">${formatNumber(pending.length)}</span>
          </div>
          <div class="proof-review-list">
            ${pending.length ? pending.slice(0, 5).map(({ trainee, item, dayKey }) => `
              <div class="proof-review-row">
                <span class="avatar"><img src="${trainee.avatarUrl}" alt="" /></span>
                <div class="activity-copy">
                  <strong>${esc(state.lang === "ar" ? trainee.nameAr : trainee.nameEn)}</strong>
                  <span>${getExerciseName(item.exerciseId)} · ${dayName(dayKey)}</span>
                </div>
                <button class="btn btn-sm btn-secondary" type="button" data-action="review-proof" data-trainee-id="${trainee.id}" data-workout-id="${item.uid}">${t("reviewBtn")}</button>
              </div>
            `).join("") : emptyState(t("allCaughtUpTitle"), t("allCaughtUpBody"))}
          </div>
        </section>

        <section class="card">
          <div class="card-header"><div><h2>${t("recentActivityTitle")}</h2><p>${t("recentActivitySub")}</p></div></div>
          <div class="activity-list">
            ${workspace.recentActivities.length ? workspace.recentActivities.slice(0, 6).map((activity) => `
              <div class="activity-row">
                <span class="activity-dot ${activity.badgeType === "success" ? "success" : activity.badgeType === "danger" ? "danger" : "warning"}"></span>
                <div class="activity-copy">
                  <strong>${esc(state.lang === "ar" ? activity.textAr : activity.textEn)}</strong>
                  <span>${esc(state.lang === "ar" ? activity.timeAr : activity.timeEn)}</span>
                </div>
              </div>
            `).join("") : emptyState(t("noActivityTitle"), t("noActivityBody"))}
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card-header">
          <div><h2>${t("traineeSnapshotTitle")}</h2><p>${t("traineeSnapshotSub")}</p></div>
          <button class="link-btn" type="button" data-action="navigate" data-view="trainees">${t("viewAllBtn")}</button>
        </div>
        ${trainees.length ? `
          <div class="snapshot-grid">
            ${trainees.slice(0, 6).map((trainee) => {
              const traineeStats = getTraineeStats(trainee);
              return `
                <button class="snapshot-card" type="button" data-action="select-trainee" data-trainee-id="${trainee.id}">
                  <span class="avatar avatar-lg"><img src="${trainee.avatarUrl}" alt="" /></span>
                  <span class="snapshot-name">${esc(state.lang === "ar" ? trainee.nameAr : trainee.nameEn)}</span>
                  <span class="snapshot-meta">${formatNumber(traineeStats.completed)} / ${formatNumber(traineeStats.total)} ${t("workoutsShort")}</span>
                  ${progressBar(traineeStats.percent)}
                  <span class="snapshot-percent">${traineeStats.percent}%</span>
                </button>
              `;
            }).join("")}
          </div>
        ` : emptyState(t("noTraineesTitle"), t("noTraineesBody"), `<button class="btn btn-primary" type="button" data-action="open-create-trainee">${t("createTraineeBtn")}</button>`)}
      </section>
    </div>
  `;
}

function filteredCoachTrainees() {
  const trainees = state.coach?.trainees || [];
  const search = state.filters.traineeSearch.trim().toLowerCase();
  return trainees.filter((trainee) => {
    const active = trainee.subscriptionActive && trainee.planUnlocked;
    const matchesStatus = state.filters.traineeStatus === "all"
      || (state.filters.traineeStatus === "active" && active)
      || (state.filters.traineeStatus === "expired" && !active);
    const haystack = `${trainee.nameEn} ${trainee.nameAr} ${trainee.email} ${trainee.whatsappPhone}`.toLowerCase();
    return matchesStatus && (!search || haystack.includes(search));
  });
}

function renderCoachTrainees() {
  const workspace = state.coach;
  if (!workspace) return "";
  const trainees = filteredCoachTrainees();
  if (!state.selectedTraineeId || !workspace.trainees.some((trainee) => trainee.id === state.selectedTraineeId)) {
    state.selectedTraineeId = trainees[0]?.id || workspace.trainees[0]?.id || null;
  }
  const selected = getCoachTrainee();
  return `
    <div class="view-stack">
      <section class="toolbar-card">
        <div class="toolbar-main">
          <div class="search-box">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input class="form-control" id="traineeSearch" data-filter="traineeSearch" value="${esc(state.filters.traineeSearch)}" placeholder="${t("searchTraineesPlaceholder")}" aria-label="${t("searchTraineesPlaceholder")}" />
          </div>
          <select class="form-control select-control" id="traineeStatusFilter" data-filter="traineeStatus" aria-label="${t("filterByStatus")}">
            <option value="all" ${state.filters.traineeStatus === "all" ? "selected" : ""}>${t("allStatuses")}</option>
            <option value="active" ${state.filters.traineeStatus === "active" ? "selected" : ""}>${t("statusActive")}</option>
            <option value="expired" ${state.filters.traineeStatus === "expired" ? "selected" : ""}>${t("statusExpired")}</option>
          </select>
          <button class="btn btn-primary" type="button" data-action="open-create-trainee">${icon("plus")}${t("createTraineeBtn")}</button>
        </div>
        <div class="toolbar-meta">${t("showingTrainees")} <strong>${formatNumber(trainees.length)}</strong> ${t("ofUsers")} ${formatNumber(workspace.trainees.length)}</div>
      </section>

      ${workspace.trainees.length ? `
        <div class="trainee-layout">
          <aside class="card trainee-list-card">
            <div class="card-header compact"><div><h2>${t("myTraineesTitle")}</h2><p>${t("selectTraineeHint")}</p></div></div>
            <div class="trainee-list">
              ${trainees.length ? trainees.map((trainee) => {
                const traineeStats = getTraineeStats(trainee);
                return `
                  <button class="trainee-list-item ${selected?.id === trainee.id ? "active" : ""}" type="button" data-action="select-trainee" data-trainee-id="${trainee.id}">
                    <span class="avatar"><img src="${trainee.avatarUrl}" alt="" /></span>
                    <span class="trainee-list-copy">
                      <strong>${esc(state.lang === "ar" ? trainee.nameAr : trainee.nameEn)}</strong>
                      <span>${traineeStats.percent}% · ${traineeStats.pending ? `${traineeStats.pending} ${t("pendingShort")}` : statusBadge(trainee.subscriptionActive && trainee.planUnlocked)}</span>
                    </span>
                    <span class="list-arrow">${icon("arrow")}</span>
                  </button>
                `;
              }).join("") : emptyState(t("noTraineesFoundTitle"), t("noTraineesFoundBody"))}
            </div>
          </aside>
          <section class="builder-panel">
            ${selected ? renderCoachBuilder(selected) : `<div class="card">${emptyState(t("selectTraineeTitle"), t("selectTraineeBody"))}</div>`}
          </section>
        </div>
      ` : `<section class="card">${emptyState(t("noTraineesTitle"), t("noTraineesBody"), `<button class="btn btn-primary" type="button" data-action="open-create-trainee">${t("createTraineeBtn")}</button>`)}</section>`}
    </div>
  `;
}

function renderCoachBuilder(trainee) {
  const stats = getTraineeStats(trainee);
  const active = trainee.subscriptionActive && trainee.planUnlocked;
  return `
    <div class="builder-stack">
      <div class="card builder-head">
        <div class="builder-identity">
          <span class="avatar avatar-xl"><img src="${trainee.avatarUrl}" alt="" /></span>
          <div>
            <div class="builder-title-row">
              <h2>${esc(state.lang === "ar" ? trainee.nameAr : trainee.nameEn)}</h2>
              ${statusBadge(active)}
            </div>
            <p>${esc(trainee.email)}</p>
            <div class="builder-tags">
              <span class="badge badge-neutral">${recurrenceLabel(trainee)}</span>
              ${trainee.goalEn || trainee.goalAr ? `<span class="badge badge-info">${state.lang === "ar" ? esc(trainee.goalAr) : esc(trainee.goalEn)}</span>` : ""}
            </div>
          </div>
        </div>
        <div class="builder-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-action="edit-recurrence" data-trainee-id="${trainee.id}">${t("recurrenceBtn")}</button>
          <button class="btn ${active ? "btn-danger-soft" : "btn-primary"} btn-sm" type="button" data-action="toggle-trainee-access" data-trainee-id="${trainee.id}" data-active="${active ? "true" : "false"}">${icon(active ? "lock" : "unlock")}${active ? t("lockAccessBtn") : t("unlockAccessBtn")}</button>
        </div>
        <div class="builder-stats">
          <div><span>${t("completedLabel")}</span><strong>${formatNumber(stats.completed)} / ${formatNumber(stats.total)}</strong></div>
          <div><span>${t("verifiedLabel")}</span><strong>${formatNumber(stats.verified)}</strong></div>
          <div><span>${t("pendingLabel")}</span><strong>${formatNumber(stats.pending)}</strong></div>
          <div><span>${t("completionLabel")}</span><strong>${stats.percent}%</strong></div>
        </div>
      </div>

      ${!active ? `<div class="alert alert-warning">${t("traineeLockedAlert")}</div>` : ""}
      ${!state.coach.currentWeek ? `<div class="alert alert-warning">${t("noLiveWeekWarning")}</div>` : ""}

      <div class="day-grid">
        ${DAY_KEYS.map((dayKey) => renderBuilderDay(trainee, dayKey)).join("")}
      </div>
    </div>
  `;
}

function renderBuilderDay(trainee, dayKey) {
  const day = trainee.schedule?.[dayKey] || { isRestDay: false, items: [], date: null };
  return `
    <div class="day-card ${day.isRestDay ? "rest-day" : ""}">
      <div class="day-head">
        <div>
          <h3>${dayName(dayKey)}</h3>
          <span>${day.date ? new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" }).format(new Date(`${day.date}T00:00:00`)) : t("notAvailable")}</span>
        </div>
        <button class="icon-btn ${day.isRestDay ? "active" : ""}" type="button" data-action="toggle-rest-day" data-trainee-id="${trainee.id}" data-day-key="${dayKey}" data-is-rest="${day.isRestDay ? "true" : "false"}" title="${t("restDayToggle")}" aria-label="${t("restDayToggle")}">${icon(day.isRestDay ? "unlock" : "lock")}</button>
      </div>
      ${day.isRestDay ? `
        <div class="rest-day-body">
          <span>${t("restDayLabel")}</span>
          <button class="link-btn" type="button" data-action="add-workout" data-trainee-id="${trainee.id}" data-day-key="${dayKey}">${t("addExerciseBtn")}</button>
        </div>
      ` : `
        <div class="day-items">
          ${day.items.length ? day.items.map((item) => renderBuilderWorkout(item, trainee)).join("") : `<p class="day-empty">${t("noExercisesDay")}</p>`}
        </div>
        <button class="add-exercise-btn" type="button" data-action="add-workout" data-trainee-id="${trainee.id}" data-day-key="${dayKey}">${icon("plus")}${t("addExerciseBtn")}</button>
      `}
    </div>
  `;
}

function renderBuilderWorkout(item, trainee) {
  const completed = item.status === "completed";
  const locked = item.status !== "pending";
  return `
    <div class="workout-chip ${completed ? "completed" : ""}">
      <div class="workout-chip-main">
        <span class="workout-mini-icon">${icon("dumbbell")}</span>
        <div>
          <strong>${getExerciseName(item.exerciseId)}</strong>
          <span>${formatNumber(item.sets)} × ${state.lang === "ar" ? esc(item.repsAr) : esc(item.repsEn)} · ${state.lang === "ar" ? esc(item.restAr) : esc(item.restEn)}</span>
        </div>
      </div>
      <div class="workout-chip-actions">
        ${completed ? verificationBadge(item.verificationStatus) : ""}
        <button class="icon-btn" type="button" data-action="edit-workout" data-workout-id="${item.uid}" ${locked ? "disabled" : ""} title="${locked ? t("completedLocked") : t("editBtn")}" aria-label="${locked ? t("completedLocked") : t("editBtn")}">${locked ? icon("lock") : icon("settings")}</button>
        <button class="icon-btn danger" type="button" data-action="remove-workout" data-workout-id="${item.uid}" data-trainee-id="${trainee.id}" ${completed ? "disabled" : ""} title="${completed ? t("completedLocked") : t("removeBtn")}" aria-label="${completed ? t("completedLocked") : t("removeBtn")}">${icon("lock")}</button>
      </div>
    </div>
  `;
}

function filteredExercises() {
  const exercises = state.coach?.exercises || [];
  const search = state.filters.exerciseSearch.trim().toLowerCase();
  return exercises.filter((exercise) => {
    if (!exercise.isActive) return false;
    const matchesCategory = state.filters.exerciseCategory === "all" || exercise.categoryId === state.filters.exerciseCategory;
    const haystack = `${exercise.nameEn} ${exercise.nameAr} ${exercise.descEn} ${exercise.descAr}`.toLowerCase();
    return matchesCategory && (!search || haystack.includes(search));
  });
}

function renderCoachExercises() {
  const workspace = state.coach;
  if (!workspace) return "";
  const exercises = filteredExercises();
  return `
    <div class="view-stack">
      <section class="toolbar-card">
        <div class="toolbar-main">
          <div class="search-box">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input class="form-control" id="exerciseSearch" data-filter="exerciseSearch" value="${esc(state.filters.exerciseSearch)}" placeholder="${t("searchExercisesPlaceholder")}" aria-label="${t("searchExercisesPlaceholder")}" />
          </div>
          <select class="form-control select-control" id="exerciseCategoryFilter" data-filter="exerciseCategory" aria-label="${t("filterByCategory")}">
            <option value="all" ${state.filters.exerciseCategory === "all" ? "selected" : ""}>${t("allCategories")}</option>
            ${workspace.categories.map((category) => `<option value="${category.id}" ${state.filters.exerciseCategory === category.id ? "selected" : ""}>${esc(state.lang === "ar" ? category.ar : category.en)}</option>`).join("")}
          </select>
          <button class="btn btn-primary" type="button" data-action="open-create-exercise">${icon("plus")}${t("createExerciseBtn")}</button>
        </div>
        <div class="toolbar-meta">${t("showingExercises")} <strong>${formatNumber(exercises.length)}</strong> ${t("ofExercises")} ${formatNumber(workspace.exercises.length)}</div>
      </section>

      ${exercises.length ? `
        <div class="exercise-grid">
          ${exercises.map((exercise) => `
            <article class="exercise-card">
              <div class="exercise-media">
                <img src="${esc(exercise.mediaUrl)}" alt="" loading="lazy" />
                <span class="badge badge-neutral exercise-category">${esc(categoryName(exercise.categoryId))}</span>
              </div>
              <div class="exercise-body">
                <div class="exercise-title-row">
                  <h3>${bi(exercise, "name")}</h3>
                  <button class="icon-btn danger" type="button" data-action="archive-exercise" data-exercise-id="${exercise.id}" title="${t("archiveBtn")}" aria-label="${t("archiveBtn")}">${icon("lock")}</button>
                </div>
                <p>${bi(exercise, "desc")}</p>
                <div class="exercise-meta">
                  <span>${formatNumber(exercise.defaultSets)} ${t("setsShort")}</span>
                  <span>${state.lang === "ar" ? esc(exercise.repsAr) : esc(exercise.repsEn)}</span>
                  <span>${state.lang === "ar" ? esc(exercise.restAr) : esc(exercise.restEn)}</span>
                </div>
              </div>
            </article>
          `).join("")}
        </div>
      ` : `<section class="card">${emptyState(t("noExercisesFoundTitle"), t("noExercisesFoundBody"), `<button class="btn btn-primary" type="button" data-action="open-create-exercise">${t("createExerciseBtn")}</button>`)}</section>`}
    </div>
  `;
}

function renderLeaderboardManagement() {
  const leaderboard = state.leaderboard;
  const workspace = state.coach;
  if (!leaderboard || !workspace) return "";
  const settings = leaderboard.settings || DEFAULT_SETTINGS;
  const pending = allPendingProofs();
  return `
    <div class="view-stack">
      <section class="toolbar-card">
        <div class="toolbar-main">
          <div class="week-selector">
            <label class="form-label" for="lbWeekSelect">${t("weekLabel")}</label>
            <select class="form-control select-control" id="lbWeekSelect" data-action="select-week">
              ${leaderboard.weeks.map((week) => `<option value="${week.id}" ${leaderboard.week?.id === week.id ? "selected" : ""}>${esc(state.lang === "ar" ? week.labelAr : week.labelEn)}${week.isLive ? ` — ${t("liveLabel")}` : ""}</option>`).join("")}
            </select>
          </div>
          <button class="btn btn-secondary" type="button" data-action="open-new-week">${icon("calendar")}${t("startNewWeekBtn")}</button>
          <button class="btn btn-primary" type="button" data-action="scroll-proof-queue" ${pending.length ? "" : "disabled"}>${icon("shield")}${t("reviewQueueBtn")} ${pending.length ? `(${pending.length})` : ""}</button>
        </div>
      </section>

      <div class="dashboard-grid">
        <section class="card">
          <div class="card-header"><div><h2>${t("leaderboardRulesTitle")}</h2><p>${t("leaderboardRulesSub")}</p></div>${settings.leaderboardPublished ? `<span class="badge badge-success">${t("publishedLabel")}</span>` : `<span class="badge badge-warning">${t("draftLabel")}</span>`}</div>
          <form data-form="leaderboard-settings" class="form-stack">
            <div class="setting-row">
              <div><strong>${t("enableLeaderboardTitle")}</strong><p>${t("enableLeaderboardSub")}</p></div>
              <label class="switch"><input type="checkbox" name="leaderboardEnabled" ${settings.leaderboardEnabled ? "checked" : ""} /><span></span></label>
            </div>
            <div class="setting-row">
              <div><strong>${t("publishLeaderboardTitle")}</strong><p>${t("publishLeaderboardSub")}</p></div>
              <label class="switch"><input type="checkbox" name="leaderboardPublished" ${settings.leaderboardPublished ? "checked" : ""} /><span></span></label>
            </div>
            <div class="setting-row locked-setting">
              <div><strong>${t("strictVerificationTitle")}</strong><p>${t("strictVerificationSub")}</p></div>
              <span class="badge badge-success">${icon("shield")}${t("alwaysOnLabel")}</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="rewardTitleEn">${t("rewardTitleEnLabel")}</label>
              <input class="form-control ltr-field" id="rewardTitleEn" name="rewardTitleEn" value="${esc(settings.rewardTitleEn)}" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="rewardTitleAr">${t("rewardTitleArLabel")}</label>
              <input class="form-control" id="rewardTitleAr" name="rewardTitleAr" value="${esc(settings.rewardTitleAr)}" required />
            </div>
            <button class="btn btn-primary" type="submit">${t("saveLeaderboardBtn")}</button>
          </form>
        </section>

        <section class="card">
          <div class="card-header"><div><h2>${t("currentStandingsTitle")}</h2><p>${weekLabel(leaderboard.week)}</p></div><span class="badge badge-neutral">${formatNumber(leaderboard.entries.length)}</span></div>
          <div class="mini-standings">
            ${leaderboard.entries.length ? leaderboard.entries.slice(0, 8).map((entry) => `
              <div class="mini-standing ${entry.rank === 1 ? "winner" : ""}">
                <span class="rank-pill">${formatNumber(entry.rank)}</span>
                <span class="avatar"><img src="${entry.trainee.avatarUrl}" alt="" /></span>
                <div class="activity-copy">
                  <strong>${esc(state.lang === "ar" ? entry.trainee.nameAr : entry.trainee.nameEn)}</strong>
                  <span>${formatNumber(entry.verified)} ${t("verifiedWorkoutsShort")}</span>
                </div>
                <strong class="points">${formatNumber(entry.score)}</strong>
              </div>
            `).join("") : emptyState(t("noStandingsTitle"), t("noStandingsBody"))}
          </div>
        </section>
      </div>

      <section class="card" id="proofReviewQueue">
        <div class="card-header"><div><h2>${t("proofReviewQueueTitle")}</h2><p>${t("proofReviewQueueSub")}</p></div><span class="badge badge-warning">${formatNumber(pending.length)}</span></div>
        <div class="proof-review-list">
          ${pending.length ? pending.map(({ trainee, item, dayKey }) => `
            <div class="proof-review-row">
              <span class="avatar"><img src="${trainee.avatarUrl}" alt="" /></span>
              <div class="activity-copy">
                <strong>${esc(state.lang === "ar" ? trainee.nameAr : trainee.nameEn)}</strong>
                <span>${getExerciseName(item.exerciseId)} · ${dayName(dayKey)} · ${formatDateTime(item.completedAt)}</span>
              </div>
              <button class="btn btn-sm btn-secondary" type="button" data-action="review-proof" data-trainee-id="${trainee.id}" data-workout-id="${item.uid}">${t("reviewBtn")}</button>
            </div>
          `).join("") : emptyState(t("allCaughtUpTitle"), t("allCaughtUpBody"))}
        </div>
      </section>

      <section class="card">
        <div class="card-header"><div><h2>${t("previousWinnersTitle")}</h2><p>${t("previousWinnersSub")}</p></div></div>
        <div class="archive-grid">
          ${leaderboard.previousWinners.length ? leaderboard.previousWinners.slice(0, 6).map((winner) => `
            <div class="archive-card">
              <div class="archive-top">
                <span class="avatar avatar-lg"><img src="${winner.avatarUrl}" alt="" /></span>
                <span class="archive-week">${contextBilingual(winner, "weekEn", "weekAr")}</span>
              </div>
              <strong>${contextBilingual(winner, "nameEn", "nameAr")}</strong>
              <span>${formatNumber(winner.verified)} ${t("verifiedWorkoutsShort")} · ${winner.percent}%</span>
              <small>${contextBilingual(winner, "rewardEn", "rewardAr")}</small>
            </div>
          `).join("") : emptyState(t("noWinnersTitle"), t("noWinnersBody"))}
        </div>
      </section>
    </div>
  `;
}

function contextBilingual(object, enKey, arKey) {
  return esc(state.lang === "ar" ? object[arKey] || object[enKey] : object[enKey] || object[arKey]);
}

function renderCoachSettings() {
  const settings = state.coach?.settings || DEFAULT_SETTINGS;
  return `
    <div class="view-stack settings-stack">
      <section class="card">
        <div class="card-header"><div><h2>${t("coachContactTitle")}</h2><p>${t("coachContactSub")}</p></div>${icon("users")}</div>
        <form data-form="coach-contact" class="form-grid">
          <div class="form-group">
            <label class="form-label" for="coachNameEn">${t("nameEnLabel")}</label>
            <input class="form-control ltr-field" id="coachNameEn" name="coachNameEn" value="${esc(settings.coachNameEn)}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="coachNameAr">${t("nameArLabel")}</label>
            <input class="form-control" id="coachNameAr" name="coachNameAr" value="${esc(settings.coachNameAr)}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="coachEmail">${t("emailLabel")}</label>
            <input class="form-control ltr-field" id="coachEmail" name="coachEmail" type="email" value="${esc(settings.coachEmail)}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="coachPhone">${t("phoneLabel")}</label>
            <input class="form-control ltr-field" id="coachPhone" name="coachPhone" type="tel" value="${esc(settings.coachPhone)}" placeholder="${t("phoneExample")}" />
          </div>
          <div class="form-actions span-full"><button class="btn btn-primary" type="submit">${t("saveContactBtn")}</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-header"><div><h2>${t("appearanceTitle")}</h2><p>${t("appearanceSub")}</p></div></div>
        ${renderThemePicker()}
        <div class="settings-divider"></div>
        <div class="setting-row">
          <div><strong>${t("languageTitle")}</strong><p>${t("languageSub")}</p></div>
          <div class="segmented">
            <button class="${state.lang === "ar" ? "active" : ""}" type="button" data-action="set-language" data-lang="ar">العربية</button>
            <button class="${state.lang === "en" ? "active" : ""}" type="button" data-action="set-language" data-lang="en">English</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><div><h2>${t("securityTitle")}</h2><p>${t("securitySub")}</p></div>${icon("shield")}</div>
        <div class="setting-row">
          <div><strong>${t("changePasswordTitle")}</strong><p>${t("changePasswordSub")}</p></div>
          <button class="btn btn-secondary" type="button" data-action="open-change-password">${t("changePasswordBtn")}</button>
        </div>
        <div class="setting-row">
          <div><strong>${t("resetEmailTitle")}</strong><p>${t("resetEmailSub")}</p></div>
          <button class="btn btn-secondary" type="button" data-action="send-reset-email" data-email="${esc(userEmail())}">${t("sendResetEmailBtn")}</button>
        </div>
      </section>
    </div>
  `;
}

function renderTraineeSchedule() {
  const workspace = state.trainee;
  if (!workspace) return "";
  const trainee = workspace.trainee;
  const stats = getTraineeStats(trainee);
  const active = trainee.subscriptionActive && trainee.planUnlocked;
  if (!active) {
    return `
      <div class="view-stack">
        ${renderTraineeStatusCard()}
      </div>
    `;
  }
  if (!workspace.currentWeek) {
    return `
      <div class="view-stack">
        <section class="card">${emptyState(t("noLiveWeekTitle"), t("noLiveWeekBody"), `<a class="btn btn-primary" href="mailto:${esc(workspace.coach.email || "")}">${t("contactCoachBtn")}</a>`)}</section>
      </div>
    `;
  }
  const today = localDateValue();
  return `
    <div class="view-stack">
      <section class="welcome-card trainee-welcome">
        <div>
          <span class="eyebrow">${weekLabel(workspace.currentWeek)}</span>
          <h2>${t("hiName")} ${esc(state.lang === "ar" ? trainee.nameAr : trainee.nameEn)}</h2>
          <p>${t("traineeWelcomeBody")}</p>
        </div>
        <div class="week-progress-card">
          <div class="week-progress-head"><span>${t("weekProgressLabel")}</span><strong>${stats.percent}%</strong></div>
          ${progressBar(stats.percent)}
          <div class="week-progress-meta"><span>${formatNumber(stats.completed)} / ${formatNumber(stats.total)} ${t("workoutsShort")}</span><span>${formatNumber(stats.verified)} ${t("verifiedShort")}</span></div>
        </div>
      </section>

      <div class="trainee-dashboard-grid">
        <div class="day-grid trainee-day-grid">
          ${DAY_KEYS.map((dayKey) => renderTraineeDay(trainee, dayKey, today)).join("")}
        </div>
        <aside class="trainee-side">
          <section class="card coach-mini-card">
            <span class="eyebrow">${t("yourCoachLabel")}</span>
            <img class="coach-portrait" src="${createDrawingAvatar("coach")}" alt="" />
            <h3>${esc(coachName())}</h3>
            <p>${t("coachMiniBody")}</p>
            ${workspace.coach.whatsappPhone ? `<a class="btn btn-primary btn-sm" href="https://wa.me/${esc(workspace.coach.whatsappPhone.replace(/[^\d]/g, ""))}" target="_blank" rel="noopener">${t("messageCoachBtn")}</a>` : ""}
          </section>
          <section class="card week-summary-card">
            <h3>${t("weekSummaryTitle")}</h3>
            <div class="summary-row"><span>${t("activeDaysLabel")}</span><strong>${formatNumber(stats.activeDays)} / ${formatNumber(stats.plannedDays)}</strong></div>
            <div class="summary-row"><span>${t("verifiedLabel")}</span><strong>${formatNumber(stats.verified)}</strong></div>
            <div class="summary-row"><span>${t("pendingLabel")}</span><strong>${formatNumber(stats.pending)}</strong></div>
            <button class="link-btn" type="button" data-action="navigate" data-view="progress">${t("viewProgressBtn")} ${icon("arrow")}</button>
          </section>
        </aside>
      </div>
    </div>
  `;
}

function renderTraineeStatusCard() {
  const workspace = state.trainee;
  const coach = workspace?.coach;
  return `
    <section class="lock-screen-card card">
      <div class="lock-illustration">${icon("lock")}</div>
      <span class="eyebrow">${t("planLockedEyebrow")}</span>
      <h2>${t("planLockedTitle")}</h2>
      <p>${t("planLockedBody")}</p>
      <div class="lock-contact">
        <span class="avatar avatar-lg"><img src="${createDrawingAvatar("coach")}" alt="" /></span>
        <div><strong>${esc(coachName())}</strong><span>${esc(coach?.email || "")}</span></div>
      </div>
      <div class="modal-actions">
        ${coach?.whatsappPhone ? `<a class="btn btn-primary" href="https://wa.me/${esc(coach.whatsappPhone.replace(/[^\d]/g, ""))}" target="_blank" rel="noopener">${t("messageCoachBtn")}</a>` : ""}
        <a class="btn btn-secondary" href="mailto:${esc(coach?.email || "")}">${t("contactCoachBtn")}</a>
      </div>
    </section>
  `;
}

function renderTraineeDay(trainee, dayKey, today) {
  const day = trainee.schedule?.[dayKey] || { isRestDay: false, items: [], date: null };
  const isToday = day.date === today;
  return `
    <section class="trainee-day-card ${day.isRestDay ? "rest" : ""} ${isToday ? "today" : ""}">
      <div class="trainee-day-head">
        <div class="day-date-block">
          <span>${dayShort(dayKey)}</span>
          <strong>${day.date ? new Date(`${day.date}T00:00:00`).getDate() : "•"}</strong>
        </div>
        <div class="day-title-block">
          <h3>${dayName(dayKey)}</h3>
          <span>${day.isRestDay ? t("restDayLabel") : `${formatNumber(day.items.length)} ${t("exercisesShort")}`}</span>
        </div>
        ${isToday ? `<span class="badge badge-info today-badge">${t("todayLabel")}</span>` : ""}
      </div>
      ${day.isRestDay ? `
        <div class="trainee-rest-body">
          <span class="rest-icon">${icon("check")}</span>
          <p>${t("restDayBody")}</p>
        </div>
      ` : day.items.length ? `
        <div class="trainee-workouts">
          ${day.items.map((item) => renderTraineeWorkout(item)).join("")}
        </div>
      ` : `<p class="day-empty">${t("noExercisesDay")}</p>`}
    </section>
  `;
}

function renderTraineeWorkout(item) {
  const completed = item.status === "completed";
  const skipped = item.status === "skipped";
  return `
    <article class="trainee-workout ${completed ? "completed" : ""} ${skipped ? "skipped" : ""}">
      <div class="trainee-workout-top">
        <div class="workout-mini-icon">${icon("dumbbell")}</div>
        <div class="trainee-workout-copy">
          <strong>${getExerciseName(item.exerciseId)}</strong>
          <span>${formatNumber(item.sets)} × ${state.lang === "ar" ? esc(item.repsAr) : esc(item.repsEn)} · ${state.lang === "ar" ? esc(item.restAr) : esc(item.restEn)}</span>
          ${item.notesEn || item.notesAr ? `<small>${bi(item, "notes")}</small>` : ""}
        </div>
        ${completed ? verificationBadge(item.verificationStatus) : skipped ? `<span class="badge badge-neutral">${t("skippedLabel")}</span>` : `<span class="badge badge-info">${t("pendingLabel")}</span>`}
      </div>
      ${completed && (item.proofWeights || item.proofSummaryEn) ? `
        <div class="proof-summary">
          <span>${t("loggedWeightLabel")}: <strong>${esc(item.proofWeights || "—")}</strong></span>
          <span>${t("rpeLabel")}: <strong>${item.proofRpe || "—"}</strong></span>
          ${item.verificationNote ? `<span class="proof-note">${t("coachNoteLabel")}: ${esc(item.verificationNote)}</span>` : ""}
        </div>
      ` : ""}
      ${!completed && !skipped ? `
        <div class="trainee-workout-actions">
          <button class="btn btn-primary btn-sm" type="button" data-action="complete-workout" data-workout-id="${item.uid}">${t("logWorkoutBtn")}</button>
          <button class="btn btn-secondary btn-sm" type="button" data-action="skip-workout" data-workout-id="${item.uid}">${t("skipBtn")}</button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderTraineeProgress() {
  const workspace = state.trainee;
  if (!workspace) return "";
  const trainee = workspace.trainee;
  const stats = getTraineeStats(trainee);
  const leaderboardEntry = getTraineeLeaderboardEntry(trainee.id);
  const proofs = trainee.proofHistory || [];
  return `
    <div class="view-stack">
      <section class="kpi-grid">
        ${kpiCard(t("kpiCompletion"), `${stats.percent}%`, "chart", weekLabel(workspace.currentWeek))}
        ${kpiCard(t("kpiCompleted"), formatNumber(stats.completed), "check", `${formatNumber(stats.total)} ${t("plannedShort")}`)}
        ${kpiCard(t("kpiVerified"), formatNumber(stats.verified), "shield", t("verifiedOnlyPoints"))}
        ${kpiCard(t("kpiLeaderboardPoints"), formatNumber(leaderboardEntry?.score || 0), "trophy", leaderboardEntry ? `${t("rankLabel")} ${formatNumber(leaderboardEntry.rank)}` : t("notRankedYet"))}
      </section>

      <div class="dashboard-grid">
        <section class="card">
          <div class="card-header"><div><h2>${t("weeklyConsistencyTitle")}</h2><p>${t("weeklyConsistencySub")}</p></div><span class="badge badge-info">${stats.percent}%</span></div>
          <div class="day-bars">
            ${DAY_KEYS.map((dayKey) => {
              const day = trainee.schedule?.[dayKey];
              const total = day?.items.filter((item) => item.status !== "skipped").length || 0;
              const completed = day?.items.filter((item) => item.status === "completed").length || 0;
              const value = day?.isRestDay ? 100 : percent(completed, total);
              return `
                <div class="day-bar-item">
                  <div class="day-bar-track"><div class="day-bar-fill ${day?.isRestDay ? "rest" : ""}" style="height:${Math.max(5, value)}%"></div></div>
                  <span>${dayShort(dayKey)}</span>
                  <strong>${day?.isRestDay ? "—" : `${completed}/${total}`}</strong>
                </div>
              `;
            }).join("")}
          </div>
        </section>

        <section class="card">
          <div class="card-header"><div><h2>${t("proofStatusTitle")}</h2><p>${t("proofStatusSub")}</p></div>${icon("shield")}</div>
          <div class="status-breakdown">
            <div><span class="status-dot success"></span><span>${t("proofVerifiedBadge")}</span><strong>${formatNumber(stats.verified)}</strong></div>
            <div><span class="status-dot warning"></span><span>${t("proofPendingBadge")}</span><strong>${formatNumber(stats.pending)}</strong></div>
            <div><span class="status-dot danger"></span><span>${t("proofRejectedBadge")}</span><strong>${formatNumber(stats.rejected)}</strong></div>
            <div><span class="status-dot neutral"></span><span>${t("skippedLabel")}</span><strong>${formatNumber(stats.skipped)}</strong></div>
          </div>
          <div class="info-panel">${icon("shield")}<p>${t("verifiedPointsInfo")}</p></div>
        </section>
      </div>

      <section class="card">
        <div class="card-header"><div><h2>${t("proofHistoryTitle")}</h2><p>${t("proofHistorySub")}</p></div></div>
        <div class="proof-history">
          ${proofs.length ? proofs.slice(0, 12).map((item) => `
            <div class="proof-history-row">
              <span class="proof-day">${dayShort(item.dayKey)}</span>
              <div class="activity-copy">
                <strong>${getExerciseName(item.exerciseId)}</strong>
                <span>${item.status === "skipped" ? t("skippedLabel") : `${esc(item.proofWeights || "—")} · ${t("rpeLabel")} ${item.proofRpe || "—"} · ${formatDateTime(item.completedAt)}`}</span>
              </div>
              ${item.status === "skipped" ? `<span class="badge badge-neutral">${t("skippedLabel")}</span>` : verificationBadge(item.verificationStatus)}
            </div>
          `).join("") : emptyState(t("noProofHistoryTitle"), t("noProofHistoryBody"))}
        </div>
      </section>
    </div>
  `;
}

function renderTraineeLeaderboard() {
  const leaderboard = state.leaderboard;
  if (!leaderboard) return "";
  const settings = leaderboard.settings || DEFAULT_SETTINGS;
  if (!settings.leaderboardEnabled || !settings.leaderboardPublished) {
    return `<section class="card">${emptyState(t("leaderboardUnavailableTitle"), t("leaderboardUnavailableBody"), `<button class="btn btn-secondary" type="button" data-action="navigate" data-view="schedule">${t("backToScheduleBtn")}</button>`)}</section>`;
  }
  const winner = leaderboard.winner;
  return `
    <div class="view-stack">
      <section class="leaderboard-hero">
        <div class="leaderboard-hero-copy">
          <span class="eyebrow">${weekLabel(leaderboard.week)}</span>
          <h2>${t("leaderboardHeroTitle")}</h2>
          <p>${t("leaderboardHeroBody")}</p>
          <div class="leaderboard-reward">${icon("trophy")}<span>${t("rewardLabel")}: <strong>${contextBilingual(settings, "rewardTitleEn", "rewardTitleAr")}</strong></span></div>
          <div class="leaderboard-trust">${icon("shield")}<span>${t("verifiedOnlyTrust")}</span></div>
        </div>
        <div class="winner-spotlight">
          ${winner ? `
            <div class="winner-crown">${icon("trophy")}</div>
            <span class="avatar avatar-xl"><img src="${winner.trainee.avatarUrl}" alt="" /></span>
            <span class="eyebrow">${t("firstPlaceLabel")}</span>
            <h3>${contextBilingual(winner.trainee, "nameEn", "nameAr")}</h3>
            <p>${formatNumber(winner.verified)} ${t("verifiedWorkoutsShort")} · ${formatNumber(winner.score)} ${t("pointsShort")}</p>
          ` : `<div class="winner-empty">${icon("trophy")}<p>${t("noWinnerYet")}</p></div>`}
        </div>
      </section>

      <section class="card">
        <div class="card-header"><div><h2>${t("standingsTitle")}</h2><p>${t("standingsSub")}</p></div><span class="badge badge-neutral">${formatNumber(leaderboard.entries.length)}</span></div>
        <div class="standings-list">
          ${leaderboard.entries.length ? leaderboard.entries.map((entry) => {
            const isMe = entry.trainee.id === state.profile.id;
            return `
              <div class="standing-row ${entry.rank <= 3 ? `top-${entry.rank}` : ""} ${isMe ? "me" : ""}">
                <span class="rank-pill">${formatNumber(entry.rank)}</span>
                <span class="avatar"><img src="${entry.trainee.avatarUrl}" alt="" /></span>
                <div class="activity-copy">
                  <strong>${contextBilingual(entry.trainee, "nameEn", "nameAr")} ${isMe ? `<span class="you-label">${t("youLabel")}</span>` : ""}</strong>
                  <span>${formatNumber(entry.completed)} ${t("completedShort")} · ${formatNumber(entry.verified)} ${t("verifiedShort")}</span>
                </div>
                <div class="standing-score"><strong>${formatNumber(entry.score)}</strong><span>${t("pointsShort")}</span></div>
              </div>
            `;
          }).join("") : emptyState(t("noStandingsTitle"), t("noStandingsBody"))}
        </div>
      </section>

      <section class="card">
        <div class="card-header"><div><h2>${t("previousWinnersTitle")}</h2><p>${t("previousWinnersSub")}</p></div></div>
        <div class="archive-grid">
          ${leaderboard.previousWinners.length ? leaderboard.previousWinners.slice(0, 6).map((winner) => `
            <div class="archive-card">
              <div class="archive-top"><span class="avatar"><img src="${winner.avatarUrl}" alt="" /></span><span class="archive-week">${contextBilingual(winner, "weekEn", "weekAr")}</span></div>
              <strong>${contextBilingual(winner, "nameEn", "nameAr")}</strong>
              <span>${formatNumber(winner.verified)} ${t("verifiedWorkoutsShort")} · ${winner.percent}%</span>
              <small>${contextBilingual(winner, "rewardEn", "rewardAr")}</small>
            </div>
          `).join("") : emptyState(t("noWinnersTitle"), t("noWinnersBody"))}
        </div>
      </section>
    </div>
  `;
}

function renderTraineeSettings() {
  const workspace = state.trainee;
  if (!workspace) return "";
  const trainee = workspace.trainee;
  const coach = workspace.coach;
  return `
    <div class="view-stack settings-stack">
      <section class="card">
        <div class="card-header"><div><h2>${t("traineeProfileTitle")}</h2><p>${t("traineeProfileSub")}</p></div></div>
        <form data-form="trainee-profile" class="form-grid">
          <div class="form-group">
            <label class="form-label" for="traineeNameEn">${t("nameEnLabel")}</label>
            <input class="form-control ltr-field" id="traineeNameEn" name="nameEn" value="${esc(trainee.nameEn)}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="traineeNameAr">${t("nameArLabel")}</label>
            <input class="form-control" id="traineeNameAr" name="nameAr" value="${esc(trainee.nameAr)}" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="traineeGoalEn">${t("goalEnLabel")}</label>
            <input class="form-control ltr-field" id="traineeGoalEn" name="goalEn" value="${esc(trainee.goalEn)}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="traineeGoalAr">${t("goalArLabel")}</label>
            <input class="form-control" id="traineeGoalAr" name="goalAr" value="${esc(trainee.goalAr)}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="traineePhone">${t("phoneLabel")}</label>
            <input class="form-control ltr-field" id="traineePhone" name="phone" type="tel" value="${esc(trainee.whatsappPhone)}" placeholder="${t("phoneExample")}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="traineeEmailReadonly">${t("emailLabel")}</label>
            <input class="form-control ltr-field" id="traineeEmailReadonly" value="${esc(trainee.email)}" disabled />
          </div>
          <div class="form-actions span-full"><button class="btn btn-primary" type="submit">${t("saveProfileBtn")}</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-header"><div><h2>${t("yourCoachLabel")}</h2><p>${t("coachContactTraineeSub")}</p></div></div>
        <div class="contact-row">
          <span class="avatar avatar-lg"><img src="${createDrawingAvatar("coach")}" alt="" /></span>
          <div class="activity-copy"><strong>${esc(coachName())}</strong><span>${esc(coach.email || "")}</span></div>
          <div class="contact-actions">
            ${coach.whatsappPhone ? `<a class="btn btn-secondary btn-sm" href="https://wa.me/${esc(coach.whatsappPhone.replace(/[^\d]/g, ""))}" target="_blank" rel="noopener">${t("whatsappBtn")}</a>` : ""}
            ${coach.email ? `<a class="btn btn-secondary btn-sm" href="mailto:${esc(coach.email)}">${t("emailBtn")}</a>` : ""}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><div><h2>${t("appearanceTitle")}</h2><p>${t("appearanceSub")}</p></div></div>
        ${renderThemePicker()}
        <div class="settings-divider"></div>
        <div class="setting-row">
          <div><strong>${t("languageTitle")}</strong><p>${t("languageSub")}</p></div>
          <div class="segmented">
            <button class="${state.lang === "ar" ? "active" : ""}" type="button" data-action="set-language" data-lang="ar">العربية</button>
            <button class="${state.lang === "en" ? "active" : ""}" type="button" data-action="set-language" data-lang="en">English</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><div><h2>${t("securityTitle")}</h2><p>${t("securitySub")}</p></div>${icon("shield")}</div>
        <div class="setting-row">
          <div><strong>${t("changePasswordTitle")}</strong><p>${t("changePasswordSub")}</p></div>
          <button class="btn btn-secondary" type="button" data-action="open-change-password">${t("changePasswordBtn")}</button>
        </div>
        <div class="setting-row">
          <div><strong>${t("resetEmailTitle")}</strong><p>${t("resetEmailSub")}</p></div>
          <button class="btn btn-secondary" type="button" data-action="send-reset-email" data-email="${esc(trainee.email)}">${t("sendResetEmailBtn")}</button>
        </div>
      </section>
    </div>
  `;
}

function modalHead(title, subtitle = "") {
  return `
    <div class="modal-head">
      <div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div>
      <button class="modal-close" type="button" data-action="close-modal" aria-label="${t("closeLabel")}">×</button>
    </div>
  `;
}

function openModal(content, wide = false) {
  const backdrop = document.getElementById("appModalBackdrop");
  const box = document.getElementById("appModalContent");
  if (!backdrop || !box) return;
  box.className = `modal-box${wide ? " modal-wide" : ""}`;
  box.setAttribute("aria-label", t("dialogLabel"));
  box.innerHTML = content;
  backdrop.classList.add("open");
  backdrop.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  window.setTimeout(() => {
    const focusable = box.querySelector("input:not([type=hidden]), select, textarea, button");
    if (focusable) focusable.focus();
  }, 50);
}

function closeModal() {
  const backdrop = document.getElementById("appModalBackdrop");
  const box = document.getElementById("appModalContent");
  if (!backdrop || !box) return;
  backdrop.classList.remove("open");
  backdrop.setAttribute("aria-hidden", "true");
  box.innerHTML = "";
  box.className = "modal-box";
  document.body.classList.remove("modal-open");
  state.confirmAction = null;
  state.reviewProof = null;
  state.proofFile = null;
  state.modalFile = null;
  state.proofWorkoutId = null;
  state.lastCreated = null;
}

function openConfirm({ title, body, label, tone = "primary", action }) {
  state.confirmAction = action;
  openModal(`
    <form data-form="confirm">
      ${modalHead(title)}
      <div class="modal-body"><p class="confirm-copy">${body}</p></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">${t("cancelBtn")}</button>
        <button class="btn btn-${tone}" type="submit">${label}</button>
      </div>
    </form>
  `);
}

function generateTemporaryPassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  let value = "Rr-";
  for (let index = 0; index < 10; index += 1) {
    const pool = index < 6 ? letters + digits : digits + symbols;
    value += pool[bytes[index] % pool.length];
  }
  return value;
}

function openCreateCoachModal() {
  if (state.admin?.coach) {
    showToast(t("coachExists"), "error");
    return;
  }
  const password = generateTemporaryPassword();
  openModal(`
    <form data-form="create-coach">
      ${modalHead(t("createCoachTitle"), t("createCoachSub"))}
      <div class="modal-body">
        <div class="form-grid">
          ${inputField("coachNameEn", t("nameEnLabel"), "", { required: true })}
          ${inputField("coachNameAr", t("nameArLabel"), "", { required: true })}
          ${inputField("coachEmail", t("emailLabel"), "", { type: "email", required: true })}
          ${inputField("coachPhone", t("phoneLabel"), "", { type: "tel" })}
          <div class="form-group span-full">
            <label class="form-label" for="coachPassword">${t("tempPasswordLabel")}</label>
            <div class="inline-field">
              <input class="form-control ltr-field" id="coachPassword" name="password" value="${esc(password)}" minlength="10" required />
              <button class="btn btn-secondary" type="button" data-action="generate-password">${t("generateBtn")}</button>
            </div>
            <p class="form-hint">${t("tempPasswordHint")}</p>
          </div>
        </div>
        <div class="alert alert-info">${t("singleCoachHint")}</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">${t("cancelBtn")}</button>
        <button class="btn btn-primary" type="submit">${t("createCoachBtn")}</button>
      </div>
    </form>
  `);
}

function openCreateTraineeModal() {
  const password = generateTemporaryPassword();
  openModal(`
    <form data-form="create-trainee">
      ${modalHead(t("createTraineeTitle"), t("createTraineeSub"))}
      <div class="modal-body">
        <div class="form-grid">
          ${inputField("traineeNewNameEn", t("nameEnLabel"), "", { required: true })}
          ${inputField("traineeNewNameAr", t("nameArLabel"), "", { required: true })}
          ${inputField("traineeNewEmail", t("emailLabel"), "", { type: "email", required: true })}
          ${inputField("traineeNewPhone", t("phoneLabel"), "", { type: "tel" })}
          ${inputField("traineeNewGoalEn", t("goalEnLabel"), "")}
          ${inputField("traineeNewGoalAr", t("goalArLabel"), "")}
          <div class="form-group span-full">
            <label class="form-label" for="traineePassword">${t("tempPasswordLabel")}</label>
            <div class="inline-field">
              <input class="form-control ltr-field" id="traineePassword" name="password" value="${esc(password)}" minlength="10" required />
              <button class="btn btn-secondary" type="button" data-action="generate-password">${t("generateBtn")}</button>
            </div>
            <p class="form-hint">${t("tempPasswordHint")}</p>
          </div>
        </div>
        <div class="alert alert-info">${t("traineeAccountHint")}</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">${t("cancelBtn")}</button>
        <button class="btn btn-primary" type="submit">${t("createTraineeBtn")}</button>
      </div>
    </form>
  `);
}

function openCredentialsModal({
  email,
  password,
  title = t("accountReadyTitle"),
  sub = t("accountReadySub")
}) {
  state.lastCreated = { email, password };
  openModal(`
    ${modalHead(title, sub)}
    <div class="modal-body">
      <div class="credentials-card">
        <div class="credential-row">
          <span>${t("emailLabel")}</span>
          <strong class="ltr-field">${esc(email)}</strong>
          <button class="icon-btn" type="button" data-action="copy-email" title="${t("copyBtn")}" aria-label="${t("copyBtn")}">${icon("check")}</button>
        </div>
        <div class="credential-row">
          <span>${t("tempPasswordLabel")}</span>
          <strong class="ltr-field password-text">${esc(password)}</strong>
          <button class="icon-btn" type="button" data-action="copy-password" title="${t("copyBtn")}" aria-label="${t("copyBtn")}">${icon("check")}</button>
        </div>
      </div>
      <div class="alert alert-warning">${t("credentialsOnceWarning")}</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" type="button" data-action="close-modal">${t("doneBtn")}</button>
    </div>
  `);
}

function findWorkoutContext(workoutId) {
  if (state.profile?.role === "coach") {
    for (const trainee of state.coach?.trainees || []) {
      for (const dayKey of DAY_KEYS) {
        const item = (trainee.schedule?.[dayKey]?.items || []).find((entry) => entry.uid === workoutId);
        if (item) return { trainee, item, dayKey };
      }
    }
  }
  if (state.profile?.role === "trainee") {
    const trainee = state.trainee?.trainee;
    for (const dayKey of DAY_KEYS) {
      const item = (trainee?.schedule?.[dayKey]?.items || []).find((entry) => entry.uid === workoutId);
      if (item) return { trainee, item, dayKey };
    }
  }
  return null;
}

function openAddWorkoutModal(traineeId, dayKey) {
  const trainee = getCoachTrainee(traineeId);
  const exercises = (state.coach?.exercises || []).filter((exercise) => exercise.isActive);
  if (!trainee) return;
  openModal(`
    <form data-form="add-workout">
      ${modalHead(t("addExerciseTitle"), `${state.lang === "ar" ? esc(trainee.nameAr) : esc(trainee.nameEn)} · ${dayName(dayKey)}`)}
      <div class="modal-body">
        <input type="hidden" name="traineeId" value="${trainee.id}" />
        <input type="hidden" name="dayKey" value="${dayKey}" />
        ${exercises.length ? `
          <div class="form-group">
            <label class="form-label" for="addExerciseSelect">${t("exerciseLabel")}</label>
            <select class="form-control" id="addExerciseSelect" name="exerciseId" required>
              <option value="">${t("chooseExercise")}</option>
              ${exercises.map((exercise) => `<option value="${exercise.id}">${esc(state.lang === "ar" ? exercise.nameAr : exercise.nameEn)} — ${esc(categoryName(exercise.categoryId))}</option>`).join("")}
            </select>
          </div>
          <div class="info-panel">${icon("dumbbell")}<p>${t("addWorkoutHint")}</p></div>
        ` : emptyState(t("noExercisesYetTitle"), t("noExercisesYetBody"), `<button class="btn btn-secondary" type="button" data-action="open-create-exercise">${t("createExerciseBtn")}</button>`)}
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">${t("cancelBtn")}</button>
        <button class="btn btn-primary" type="submit" ${exercises.length ? "" : "disabled"}>${t("addExerciseBtn")}</button>
      </div>
    </form>
  `);
}

function openEditWorkoutModal(workoutId) {
  const context = findWorkoutContext(workoutId);
  if (!context) return showToast(t("errGeneric"), "error");
  const { item, dayKey } = context;
  openModal(`
    <form data-form="edit-workout">
      ${modalHead(t("editWorkoutTitle"), `${getExerciseName(item.exerciseId)} · ${dayName(dayKey)}`)}
      <div class="modal-body">
        <input type="hidden" name="workoutId" value="${item.uid}" />
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label" for="workoutSets">${t("setsLabel")}</label>
            <input class="form-control" id="workoutSets" name="sets" type="number" min="1" max="20" value="${item.sets || 3}" required />
          </div>
          ${inputField("workoutRepsEn", t("repsEnLabel"), item.repsEn)}
          ${inputField("workoutRepsAr", t("repsArLabel"), item.repsAr)}
          ${inputField("workoutRestEn", t("restEnLabel"), item.restEn)}
          ${inputField("workoutRestAr", t("restArLabel"), item.restAr)}
          <div class="form-group span-full">
            <label class="form-label" for="workoutNotesEn">${t("notesEnLabel")}</label>
            <textarea class="form-control" id="workoutNotesEn" name="notesEn" rows="2">${esc(item.notesEn)}</textarea>
          </div>
          <div class="form-group span-full">
            <label class="form-label" for="workoutNotesAr">${t("notesArLabel")}</label>
            <textarea class="form-control" id="workoutNotesAr" name="notesAr" rows="2">${esc(item.notesAr)}</textarea>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">${t("cancelBtn")}</button>
        <button class="btn btn-primary" type="submit">${t("saveChangesBtn")}</button>
      </div>
    </form>
  `);
}

function openRecurrenceModal(traineeId) {
  const trainee = getCoachTrainee(traineeId);
  if (!trainee) return;
  openModal(`
    <form data-form="recurrence">
      ${modalHead(t("recurrenceTitle"), t("recurrenceSub"))}
      <div class="modal-body">
        <input type="hidden" name="traineeId" value="${trainee.id}" />
        <div class="radio-stack">
          ${["weekly", "selected_days", "daily"].map((value) => `
            <label class="radio-card">
              <input type="radio" name="recurrence" value="${value}" ${trainee.recurrence === value ? "checked" : ""} />
              <span><strong>${value === "weekly" ? t("recWeekly") : value === "daily" ? t("recDaily") : t("recSelectedDays")}</strong><small>${value === "weekly" ? t("recWeeklyHint") : value === "daily" ? t("recDailyHint") : t("recSelectedDaysHint")}</small></span>
            </label>
          `).join("")}
        </div>
        <div class="form-group">
          <label class="form-label">${t("chooseDaysLabel")}</label>
          <div class="day-check-grid">
            ${DAY_KEYS.map((dayKey) => `
              <label class="day-check">
                <input type="checkbox" name="recurrenceDays" value="${dayKey}" ${trainee.recurrenceDays.includes(dayKey) ? "checked" : ""} />
                <span>${dayShort(dayKey)}</span>
              </label>
            `).join("")}
          </div>
          <p class="form-hint">${t("chooseDaysHint")}</p>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">${t("cancelBtn")}</button>
        <button class="btn btn-primary" type="submit">${t("saveChangesBtn")}</button>
      </div>
    </form>
  `);
}

function openCreateExerciseModal() {
  state.modalFile = null;
  const categories = state.coach?.categories || [];
  openModal(`
    <form data-form="create-exercise">
      ${modalHead(t("createExerciseTitle"), t("createExerciseSub"))}
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label" for="newExerciseCategory">${t("categoryLabel")}</label>
            <select class="form-control" id="newExerciseCategory" name="categoryId" required>
              ${categories.map((category) => `<option value="${category.id}">${esc(state.lang === "ar" ? category.ar : category.en)}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="newExercisePreset">${t("animationLabel")}</label>
            <select class="form-control" id="newExercisePreset" name="presetKey">
              ${PRESET_KEYS.map((key) => `<option value="${key}">${t(`preset${key.charAt(0).toUpperCase()}${key.slice(1)}`)}</option>`).join("")}
            </select>
          </div>
          ${inputField("newExerciseNameEn", t("nameEnLabel"), "", { required: true })}
          ${inputField("newExerciseNameAr", t("nameArLabel"), "", { required: true })}
          <div class="form-group">
            <label class="form-label" for="newExerciseDescEn">${t("descEnLabel")}</label>
            <textarea class="form-control" id="newExerciseDescEn" name="descEn" rows="2"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="newExerciseDescAr">${t("descArLabel")}</label>
            <textarea class="form-control" id="newExerciseDescAr" name="descAr" rows="2"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="newExerciseSets">${t("setsLabel")}</label>
            <input class="form-control" id="newExerciseSets" name="defaultSets" type="number" min="1" max="20" value="3" required />
          </div>
          ${inputField("newExerciseRepsEn", t("repsEnLabel"), "12 reps")}
          ${inputField("newExerciseRepsAr", t("repsArLabel"), "١٢ تكرار")}
          ${inputField("newExerciseRestEn", t("restEnLabel"), "60 sec")}
          ${inputField("newExerciseRestAr", t("restArLabel"), "٦٠ ثانية")}
          <div class="form-group span-full">
            <label class="form-label" for="exerciseMediaFile">${t("mediaLabel")}</label>
            <input class="form-control file-input" id="exerciseMediaFile" type="file" accept="image/webp,image/gif,image/png,image/jpeg" />
            <p class="form-hint">${t("mediaHint")}</p>
          </div>
        </div>
        <div class="media-preview" id="exerciseMediaPreview"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">${t("cancelBtn")}</button>
        <button class="btn btn-primary" type="submit">${t("createExerciseBtn")}</button>
      </div>
    </form>
  `, true);
}

function openCompleteWorkoutModal(workoutId) {
  const context = findWorkoutContext(workoutId);
  if (!context) return showToast(t("errGeneric"), "error");
  state.proofWorkoutId = workoutId;
  state.proofFile = null;
  openModal(`
    <form data-form="submit-proof">
      ${modalHead(t("submitProofTitle"), `${getExerciseName(context.item.exerciseId)} · ${dayName(context.dayKey)}`)}
      <div class="modal-body">
        <input type="hidden" name="workoutId" value="${workoutId}" />
        <div class="proof-guide">
          ${icon("shield")}
          <p>${t("proofGuide")}</p>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label" for="proofWeights">${t("weightsLabel")}</label>
            <input class="form-control" id="proofWeights" name="weights" placeholder="${t("weightsPlaceholder")}" required minlength="2" />
          </div>
          <div class="form-group">
            <label class="form-label" for="proofRpe">${t("rpeLabel")}</label>
            <input class="form-control" id="proofRpe" name="rpe" type="number" min="1" max="10" value="7" required />
          </div>
          <div class="form-group span-full">
            <label class="form-label" for="proofSummaryEn">${t("summaryEnLabel")}</label>
            <textarea class="form-control ltr-field" id="proofSummaryEn" name="summaryEn" rows="3" placeholder="${t("summaryPlaceholder")}" required minlength="2"></textarea>
          </div>
          <div class="form-group span-full">
            <label class="form-label" for="proofSummaryAr">${t("summaryArLabel")}</label>
            <textarea class="form-control" id="proofSummaryAr" name="summaryAr" rows="3" placeholder="${t("summaryPlaceholder")}"></textarea>
          </div>
          <div class="form-group span-full">
            <label class="form-label" for="proofFile">${t("screenshotLabel")}</label>
            <input class="form-control file-input" id="proofFile" type="file" accept="image/*" required />
            <p class="form-hint" id="proofFileName">${t("screenshotHint")}</p>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">${t("cancelBtn")}</button>
        <button class="btn btn-primary" type="submit">${t("submitProofBtn")}</button>
      </div>
    </form>
  `);
}

function openChangePasswordModal() {
  openModal(`
    <form data-form="change-password">
      ${modalHead(t("changePasswordTitle"), t("changePasswordModalSub"))}
      <div class="modal-body">
        <div class="form-stack">
          <div class="form-group">
            <label class="form-label" for="newPassword">${t("authNewPasswordLabel")}</label>
            <div class="password-field">
              <input class="form-control" id="newPassword" name="password" type="password" minlength="10" autocomplete="new-password" required />
              <button class="password-toggle" type="button" data-action="toggle-password" aria-label="${t("showPassword")}">${t("showShort")}</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="confirmNewPassword">${t("confirmPasswordLabel")}</label>
            <input class="form-control" id="confirmNewPassword" name="confirmPassword" type="password" minlength="10" autocomplete="new-password" required />
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">${t("cancelBtn")}</button>
        <button class="btn btn-primary" type="submit">${t("updatePasswordBtn")}</button>
      </div>
    </form>
  `);
}

function openNewWeekModal() {
  openModal(`
    <form data-form="new-week">
      ${modalHead(t("newWeekTitle"), t("newWeekSub"))}
      <div class="modal-body">
        <div class="form-grid">
          ${inputField("newWeekLabelEn", t("weekLabelEnLabel"), "")}
          ${inputField("newWeekLabelAr", t("weekLabelArLabel"), "")}
          ${inputField("newWeekShortEn", t("weekShortEnLabel"), "")}
          ${inputField("newWeekShortAr", t("weekShortArLabel"), "")}
        </div>
        <div class="alert alert-info">${t("newWeekHint")}</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">${t("cancelBtn")}</button>
        <button class="btn btn-primary" type="submit">${t("startNewWeekBtn")}</button>
      </div>
    </form>
  `);
}

async function openReviewProofModal(traineeId, workoutId) {
  openModal(`<div class="modal-loading"><span class="spinner"></span><p>${t("loadingProof")}</p></div>`);
  try {
    const logs = await getProofLogs(traineeId);
    const log = logs.find((entry) => entry.workoutId === workoutId);
    if (!log) throw new Error("PROOF_NOT_FOUND");
    const screenshotUrl = log.screenshotPath ? await getProofScreenshotUrl(log.screenshotPath) : null;
    const trainee = getCoachTrainee(traineeId);
    state.reviewProof = { traineeId, workoutId, log };
    openModal(`
      <div class="review-modal">
        ${modalHead(t("reviewProofTitle"), `${trainee ? esc(state.lang === "ar" ? trainee.nameAr : trainee.nameEn) : ""} · ${dayName(log.dayKey)}`)}
        <div class="modal-body">
          <div class="review-grid">
            <div class="review-details">
              <div class="detail-grid">
                <div class="detail-item"><span>${t("exerciseLabel")}</span><strong>${getExerciseName(log.exerciseId)}</strong></div>
                <div class="detail-item"><span>${t("weightsLabel")}</span><strong>${esc(log.weights || "—")}</strong></div>
                <div class="detail-item"><span>${t("rpeLabel")}</span><strong>${log.rpe || "—"}</strong></div>
                <div class="detail-item"><span>${t("completedAtLabel")}</span><strong>${formatDateTime(log.completedAt)}</strong></div>
              </div>
              <div class="proof-copy-block">
                <span>${t("summaryEnLabel")}</span>
                <p class="ltr-field">${esc(log.summaryEn || "—")}</p>
              </div>
              <div class="proof-copy-block">
                <span>${t("summaryArLabel")}</span>
                <p>${esc(log.summaryAr || "—")}</p>
              </div>
              <div class="form-group">
                <label class="form-label" for="reviewNote">${t("reviewNoteLabel")}</label>
                <textarea class="form-control" id="reviewNote" rows="3" placeholder="${t("reviewNotePlaceholder")}">${esc(log.verificationNote || "")}</textarea>
                <p class="form-hint">${t("rejectNoteHint")}</p>
              </div>
            </div>
            <div class="proof-screenshot-panel">
              <span>${t("screenshotLabel")}</span>
              ${screenshotUrl
                ? `<a href="${esc(screenshotUrl)}" target="_blank" rel="noopener"><img src="${esc(screenshotUrl)}" alt="${t("screenshotLabel")}" /></a>`
                : `<div class="no-screenshot">${icon("shield")}<p>${t("noScreenshot")}</p></div>`}
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" type="button" data-action="close-modal">${t("cancelBtn")}</button>
          <button class="btn btn-danger-soft" type="button" data-action="proof-decision" data-decision="rejected">${t("rejectProofBtn")}</button>
          <button class="btn btn-primary" type="button" data-action="proof-decision" data-decision="verified">${t("approveProofBtn")}</button>
        </div>
      </div>
    `, true);
  } catch (error) {
    closeModal();
    showToast(errorMessage(error), "error");
  }
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container || !message) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${type === "error" ? "!" : type === "info" ? "i" : "✓"}</span><span>${esc(message)}</span>`;
  container.appendChild(toast);
  window.setTimeout(() => toast.classList.add("show"), 20);
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 250);
  }, 4200);
}

function setButtonBusy(button, busy) {
  if (!button) return;
  if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
  button.disabled = busy;
  button.innerHTML = busy ? `<span class="spinner spinner-sm"></span><span>${t("workingLabel")}</span>` : button.dataset.originalHtml;
}

function rerenderAfterPreference() {
  if (state.profile && !state.loading && !state.error) renderApp();
  else renderAuth();
}

async function handleAuthSubmit(form) {
  const type = form.dataset.form;
  const button = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const value = (name) => String(data.get(name) || "").trim();
  state.authError = "";
  state.authNotice = "";
  setButtonBusy(button, true);
  try {
    if (type === "login") {
      const email = value("email");
      state.authEmail = email;
      if (data.get("remember") === "1") writeCookie(REMEMBER_EMAIL_COOKIE, email, 180);
      else deleteCookie(REMEMBER_EMAIL_COOKIE);
      const auth = await login({ email, password: String(data.get("password") || "") });
      state.authEmail = "";
      state.session = auth.session;
      await enterWorkspace(auth.profile);
      return;
    }
    if (type === "reset-password") {
      const password = String(data.get("password") || "");
      const confirmPassword = String(data.get("confirmPassword") || "");
      if (password !== confirmPassword) throw new Error("PASSWORD_MISMATCH");
      if (password.length < 10) throw new Error("PASSWORD_LENGTH");
      await updatePassword(password);
      history.replaceState({}, "", window.location.pathname);
      if (state.profile) {
        showToast(t("passwordUpdatedToast"));
        await enterWorkspace(state.profile);
      } else {
        await logout();
        state.authMode = "login";
        state.authNotice = t("passwordUpdatedLogin");
        state.session = null;
        renderAuth();
      }
      return;
    }
  } catch (error) {
    state.authError = errorMessage(error);
    renderAuth();
  } finally {
    setButtonBusy(button, false);
  }
}

async function handleFormSubmit(form) {
  if (form.dataset.form === "login" || form.dataset.form === "reset-password") {
    await handleAuthSubmit(form);
    return;
  }
  const type = form.dataset.form;
  const button = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const value = (name) => String(data.get(name) || "").trim();
  if (type === "confirm") {
    const action = state.confirmAction;
    closeModal();
    if (!action) return;
    try {
      await action();
    } catch (error) {
      showToast(errorMessage(error), "error");
    }
    return;
  }
  setButtonBusy(button, true);
  try {
    if (type === "create-coach") {
      if (value("password").length < 10) throw new Error("PASSWORD_LENGTH");
      await createCoachAccount({
        email: value("coachEmail"),
        password: String(data.get("password") || ""),
        nameEn: value("coachNameEn"),
        nameAr: value("coachNameAr"),
        phone: value("coachPhone")
      });
      closeModal();
      state.view = "users";
      await refreshWorkspaceData();
      showToast(t("coachCreatedToast"));
      openCredentialsModal({ email: value("coachEmail"), password: String(data.get("password") || "") });
      return;
    }
    if (type === "create-trainee") {
      if (value("password").length < 10) throw new Error("PASSWORD_LENGTH");
      const created = await createTraineeAccount({
        email: value("traineeNewEmail"),
        password: String(data.get("password") || ""),
        nameEn: value("traineeNewNameEn"),
        nameAr: value("traineeNewNameAr"),
        phone: value("traineeNewPhone"),
        goalEn: value("traineeNewGoalEn"),
        goalAr: value("traineeNewGoalAr")
      });
      closeModal();
      await refreshWorkspaceData();
      if (created?.id) state.selectedTraineeId = created.id;
      renderApp();
      showToast(t("traineeCreatedToast"));
      openCredentialsModal({ email: value("traineeNewEmail"), password: String(data.get("password") || "") });
      return;
    }
    if (type === "admin-brand-settings") {
      await saveAdminBrandSettings({
        websiteNameEn: value("websiteNameEn"),
        websiteNameAr: value("websiteNameAr")
      });
      await refreshWorkspaceData();
      showToast(t("brandSavedToast"));
      return;
    }
    if (type === "admin-profile") {
      const result = await updateAdminProfile({ nameEn: value("nameEn"), nameAr: value("nameAr"), email: value("email") });
      await refreshProfileState();
      await refreshWorkspaceData();
      showToast(result?.emailConfirmationRequired ? t("emailConfirmationSentToast") : t("profileSavedToast"));
      return;
    }
    if (type === "coach-contact") {
      const settings = state.coach?.settings || DEFAULT_SETTINGS;
      await savePlatformSettings({
        websiteNameEn: settings.websiteNameEn,
        websiteNameAr: settings.websiteNameAr,
        coachNameEn: value("coachNameEn"),
        coachNameAr: value("coachNameAr"),
        coachEmail: value("coachEmail"),
        coachPhone: value("coachPhone")
      });
      await refreshProfileState();
      await refreshWorkspaceData();
      showToast(t("contactSavedToast"));
      return;
    }
    if (type === "trainee-profile") {
      await saveTraineeProfile({
        nameEn: value("nameEn"),
        nameAr: value("nameAr"),
        goalEn: value("goalEn"),
        goalAr: value("goalAr"),
        phone: value("phone")
      });
      await refreshProfileState();
      await refreshWorkspaceData();
      showToast(t("profileSavedToast"));
      return;
    }
    if (type === "leaderboard-settings") {
      const settings = state.leaderboard?.settings || DEFAULT_SETTINGS;
      await saveLeaderboardSettings({
        leaderboardEnabled: data.has("leaderboardEnabled"),
        leaderboardPublished: data.has("leaderboardPublished"),
        strictVerification: true,
        leaderboardStage: data.has("leaderboardPublished") ? "published" : settings.leaderboardStage || "draft",
        rewardTitleEn: value("rewardTitleEn"),
        rewardTitleAr: value("rewardTitleAr")
      });
      await refreshWorkspaceData();
      showToast(t("leaderboardSavedToast"));
      return;
    }
    if (type === "add-workout") {
      await addWorkoutToDay({
        traineeId: value("traineeId"),
        dayKey: value("dayKey"),
        exerciseId: value("exerciseId"),
        weekId: state.coach?.currentWeek?.id
      });
      closeModal();
      state.selectedTraineeId = value("traineeId");
      await refreshWorkspaceData();
      showToast(t("exerciseAddedToast"));
      return;
    }
    if (type === "edit-workout") {
      await updateWorkout(value("workoutId"), {
        sets: Number(value("sets")) || 1,
        reps_en: value("workoutRepsEn"),
        reps_ar: value("workoutRepsAr"),
        rest_en: value("workoutRestEn"),
        rest_ar: value("workoutRestAr"),
        notes_en: value("workoutNotesEn"),
        notes_ar: value("workoutNotesAr")
      });
      closeModal();
      await refreshWorkspaceData();
      showToast(t("workoutUpdatedToast"));
      return;
    }
    if (type === "recurrence") {
      const recurrence = value("recurrence") || "weekly";
      const days = data.getAll("recurrenceDays").map(String);
      if (recurrence === "selected_days" && !days.length) throw new Error("RECURRENCE_DAYS_REQUIRED");
      await updateTraineeRecurrence(value("traineeId"), recurrence, days);
      closeModal();
      await refreshWorkspaceData();
      showToast(t("recurrenceSavedToast"));
      return;
    }
    if (type === "create-exercise") {
      await createExercise({
        categoryId: value("categoryId"),
        nameEn: value("newExerciseNameEn"),
        nameAr: value("newExerciseNameAr"),
        descEn: value("newExerciseDescEn"),
        descAr: value("newExerciseDescAr"),
        defaultSets: Number(value("defaultSets")) || 3,
        repsEn: value("newExerciseRepsEn"),
        repsAr: value("newExerciseRepsAr"),
        restEn: value("newExerciseRestEn"),
        restAr: value("newExerciseRestAr"),
        presetKey: value("presetKey") || "squat",
        mediaFile: state.modalFile
      });
      closeModal();
      await refreshWorkspaceData();
      showToast(t("exerciseCreatedToast"));
      return;
    }
    if (type === "submit-proof") {
      if (!state.proofFile) throw new Error("PROOF_FILE_REQUIRED");
      const screenshotBlob = await compressProofImage(state.proofFile);
      await submitWorkoutProof({
        workoutId: value("workoutId"),
        weights: value("weights"),
        rpe: Number(value("rpe")),
        summaryEn: value("summaryEn"),
        summaryAr: value("summaryAr"),
        screenshotBlob
      });
      closeModal();
      await refreshWorkspaceData();
      showToast(t("proofSubmittedToast"));
      return;
    }
    if (type === "change-password") {
      const password = String(data.get("password") || "");
      const confirmPassword = String(data.get("confirmPassword") || "");
      if (password !== confirmPassword) throw new Error("PASSWORD_MISMATCH");
      if (password.length < 10) throw new Error("PASSWORD_LENGTH");
      await updatePassword(password);
      closeModal();
      showToast(t("passwordUpdatedToast"));
      return;
    }
    if (type === "new-week") {
      await startNewLeaderboardWeek({
        labelEn: value("newWeekLabelEn"),
        labelAr: value("newWeekLabelAr"),
        shortEn: value("newWeekShortEn"),
        shortAr: value("newWeekShortAr")
      });
      state.selectedWeekId = null;
      closeModal();
      await refreshWorkspaceData();
      showToast(t("newWeekStartedToast"));
      return;
    }
  } catch (error) {
    showToast(errorMessage(error), "error");
  } finally {
    setButtonBusy(button, false);
  }
}

async function handleProofDecision(button) {
  const decision = button.dataset.decision;
  const note = String(document.getElementById("reviewNote")?.value || "").trim();
  if (decision === "rejected" && note.length < 3) {
    showToast(t("rejectNoteRequired"), "error");
    return;
  }
  const current = state.reviewProof;
  if (!current) return;
  setButtonBusy(button, true);
  try {
    await reviewWorkoutProof({ workoutId: current.workoutId, decision, note });
    closeModal();
    state.selectedTraineeId = current.traineeId;
    await refreshWorkspaceData();
    showToast(decision === "verified" ? t("proofApprovedToast") : t("proofRejectedToast"), decision === "verified" ? "success" : "info");
  } catch (error) {
    showToast(errorMessage(error), "error");
    if (button.isConnected) setButtonBusy(button, false);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(t("copiedToast"));
    return;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    showToast(t("copiedToast"));
  }
}

async function performButtonAction(button, action) {
  setButtonBusy(button, true);
  try {
    await action();
  } catch (error) {
    showToast(errorMessage(error), "error");
  } finally {
    if (button.isConnected) setButtonBusy(button, false);
  }
}

function bindEvents() {
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
    event.preventDefault();
    handleFormSubmit(form);
  });

  document.addEventListener("click", async (event) => {
    const authModeButton = event.target.closest("[data-auth-mode]");
    if (authModeButton) {
      state.authMode = authModeButton.dataset.authMode || "login";
      state.authError = "";
      state.authNotice = "";
      renderAuth();
      window.scrollTo(0, 0);
      return;
    }
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton || actionButton.disabled) return;
    const action = actionButton.dataset.action;

    if (action === "navigate") {
      state.view = actionButton.dataset.view;
      renderApp();
      return;
    }
    if (action === "close-modal") {
      closeModal();
      return;
    }
    if (action === "reload-page") {
      window.location.reload();
      return;
    }
    if (action === "retry-workspace") {
      loadRoleWorkspace();
      return;
    }
    if (action === "toggle-language") {
      setLanguage(state.lang === "ar" ? "en" : "ar");
      rerenderAfterPreference();
      return;
    }
    if (action === "set-language") {
      setLanguage(actionButton.dataset.lang);
      rerenderAfterPreference();
      return;
    }
    if (action === "set-theme") {
      setTheme(actionButton.dataset.theme);
      renderApp();
      return;
    }
    if (action === "toggle-password") {
      const input = actionButton.parentElement.querySelector("input");
      if (input) {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        actionButton.textContent = show ? t("hideShort") : t("showShort");
      }
      return;
    }
    if (action === "logout") {
      try {
        await logout();
      } catch (error) {
        showToast(errorMessage(error), "error");
        return;
      }
      state.session = null;
      state.profile = null;
      state.admin = null;
      state.coach = null;
      state.trainee = null;
      state.leaderboard = null;
      state.authMode = "landing";
      state.authError = "";
      state.authNotice = "";
      renderAuth();
      return;
    }
    if (action === "open-create-coach") {
      openCreateCoachModal();
      return;
    }
    if (action === "open-create-trainee") {
      openCreateTraineeModal();
      return;
    }
    if (action === "open-create-exercise") {
      openCreateExerciseModal();
      return;
    }
    if (action === "open-change-password") {
      openChangePasswordModal();
      return;
    }
    if (action === "open-new-week") {
      openNewWeekModal();
      return;
    }
    if (action === "generate-password") {
      const input = actionButton.closest("form").querySelector('input[name="password"]');
      if (input) input.value = generateTemporaryPassword();
      return;
    }
    if (action === "select-trainee") {
      state.selectedTraineeId = actionButton.dataset.traineeId;
      state.view = "trainees";
      renderApp();
      return;
    }
    if (action === "add-workout") {
      openAddWorkoutModal(actionButton.dataset.traineeId, actionButton.dataset.dayKey);
      return;
    }
    if (action === "edit-workout") {
      openEditWorkoutModal(actionButton.dataset.workoutId);
      return;
    }
    if (action === "edit-recurrence") {
      openRecurrenceModal(actionButton.dataset.traineeId);
      return;
    }
    if (action === "remove-workout") {
      openConfirm({
        title: t("removeWorkoutTitle"),
        body: t("removeWorkoutBody"),
        label: t("removeBtn"),
        tone: "danger-soft",
        action: async () => {
          await removeWorkout(actionButton.dataset.workoutId);
          await refreshWorkspaceData();
          showToast(t("workoutRemovedToast"));
        }
      });
      return;
    }
    if (action === "toggle-rest-day") {
      const currentlyRest = actionButton.dataset.isRest === "true";
      const changeRest = async () => {
        await setRestDay({
          traineeId: actionButton.dataset.traineeId,
          weekId: state.coach?.currentWeek?.id,
          dayKey: actionButton.dataset.dayKey,
          isRestDay: !currentlyRest
        });
        await refreshWorkspaceData();
        showToast(currentlyRest ? t("restDayRemovedToast") : t("restDaySetToast"));
      };
      if (!currentlyRest) {
        openConfirm({
          title: t("setRestDayTitle"),
          body: t("setRestDayBody"),
          label: t("setRestDayBtn"),
          tone: "danger-soft",
          action: changeRest
        });
      } else {
        performButtonAction(actionButton, changeRest);
      }
      return;
    }
    if (action === "toggle-trainee-access") {
      const currentlyActive = actionButton.dataset.active === "true";
      openConfirm({
        title: currentlyActive ? t("lockAccessConfirmTitle") : t("unlockAccessConfirmTitle"),
        body: currentlyActive ? t("lockTraineeConfirmBody") : t("unlockTraineeConfirmBody"),
        label: currentlyActive ? t("lockAccessBtn") : t("unlockAccessBtn"),
        tone: currentlyActive ? "danger-soft" : "primary",
        action: async () => {
          await toggleTraineeAccess(actionButton.dataset.traineeId, !currentlyActive);
          await refreshWorkspaceData();
          showToast(currentlyActive ? t("accessLockedToast") : t("accessUnlockedToast"));
        }
      });
      return;
    }
    if (action === "reset-user-password") {
      const email = actionButton.dataset.email || "";
      openConfirm({
        title: t("resetPasswordConfirmTitle"),
        body: `${t("resetPasswordConfirmBody")}<br><strong class="ltr-field">${esc(email)}</strong>`,
        label: t("resetPasswordBtn"),
        tone: "danger-soft",
        action: async () => {
          const result = await resetUserPassword(actionButton.dataset.userId);
          openCredentialsModal({
            email: result.user?.email || email,
            password: result.password,
            title: t("resetPasswordTitle"),
            sub: t("resetPasswordReadySub")
          });
        }
      });
      return;
    }
    if (action === "toggle-user-subscription") {
      const currentlyActive = actionButton.dataset.active === "true";
      openConfirm({
        title: currentlyActive ? t("lockAccessConfirmTitle") : t("unlockAccessConfirmTitle"),
        body: currentlyActive ? t("lockUserConfirmBody") : t("unlockUserConfirmBody"),
        label: currentlyActive ? t("lockAccessBtn") : t("unlockAccessBtn"),
        tone: currentlyActive ? "danger-soft" : "primary",
        action: async () => {
          await setUserSubscription(actionButton.dataset.userId, !currentlyActive);
          await refreshWorkspaceData();
          showToast(currentlyActive ? t("accessLockedToast") : t("accessUnlockedToast"));
        }
      });
      return;
    }
    if (action === "archive-exercise") {
      openConfirm({
        title: t("archiveExerciseTitle"),
        body: t("archiveExerciseBody"),
        label: t("archiveBtn"),
        tone: "danger-soft",
        action: async () => {
          await deleteExercise(actionButton.dataset.exerciseId);
          await refreshWorkspaceData();
          showToast(t("exerciseArchivedToast"));
        }
      });
      return;
    }
    if (action === "scroll-proof-queue") {
      document.getElementById("proofReviewQueue")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "review-proof") {
      openReviewProofModal(actionButton.dataset.traineeId, actionButton.dataset.workoutId);
      return;
    }
    if (action === "proof-decision") {
      handleProofDecision(actionButton);
      return;
    }
    if (action === "complete-workout") {
      openCompleteWorkoutModal(actionButton.dataset.workoutId);
      return;
    }
    if (action === "skip-workout") {
      openConfirm({
        title: t("skipWorkoutTitle"),
        body: t("skipWorkoutBody"),
        label: t("skipBtn"),
        tone: "danger-soft",
        action: async () => {
          await markWorkoutSkipped(actionButton.dataset.workoutId);
          await refreshWorkspaceData();
          showToast(t("workoutSkippedToast"));
        }
      });
      return;
    }
    if (action === "send-reset-email") {
      performButtonAction(actionButton, async () => {
        await sendPasswordReset(actionButton.dataset.email);
        showToast(t("resetEmailSentToast"));
      });
      return;
    }
    if (action === "copy-email" || action === "copy-password") {
      const value = action === "copy-email" ? state.lastCreated?.email : state.lastCreated?.password;
      if (value) copyText(value);
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('input[data-filter], select[data-filter]')) {
      const key = target.dataset.filter;
      state.filters[key] = target.value;
      renderApp(captureFocus());
    }
  });

  document.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.matches('select[data-filter]')) {
      const key = target.dataset.filter;
      state.filters[key] = target.value;
      renderApp(captureFocus());
      return;
    }
    if (target.dataset.action === "select-week") {
      state.selectedWeekId = target.value;
      try {
        state.leaderboard = await loadLeaderboard({ weekId: state.selectedWeekId });
        renderApp();
      } catch (error) {
        showToast(errorMessage(error), "error");
      }
      return;
    }
    if (target.id === "proofFile") {
      const file = target.files?.[0] || null;
      state.proofFile = file;
      const label = document.getElementById("proofFileName");
      if (label) label.textContent = file ? `${file.name} · ${Math.round(file.size / 1024)} KB` : t("screenshotHint");
      return;
    }
    if (target.id === "exerciseMediaFile") {
      const file = target.files?.[0] || null;
      state.modalFile = file;
      const preview = document.getElementById("exerciseMediaPreview");
      if (!preview) return;
      if (file && file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        preview.innerHTML = `<img src="${url}" alt="" /><span>${esc(file.name)}</span>`;
      } else {
        preview.innerHTML = "";
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById("appModalBackdrop")?.classList.contains("open")) {
      closeModal();
    }
  });

  document.getElementById("appModalBackdrop")?.addEventListener("click", (event) => {
    if (event.target.id === "appModalBackdrop") closeModal();
  });
}

bindEvents();
boot();






