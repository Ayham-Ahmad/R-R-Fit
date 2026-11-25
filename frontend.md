# Frontend fix & cleanup — full implementation report

> **Scope:** this report documents **frontend-only** work. No backend file was opened for editing, and no backend command was run. `backend/**`, `sql/**`, Supabase migrations/functions/RLS, `.venv/**`, and every `npm run backend:*` script were left untouched.

---

## 1. Scope and source of truth

### What was in scope
| Area | Files |
| --- | --- |
| App shell / views / handlers | `frontend/js/app.js` |
| Translations | `frontend/js/i18n.js`, `frontend/js/extra-i18n.js`, `frontend/js/extra-i18n-2.js` |
| Markup | `frontend/index.html` |
| Styles | `frontend/styles/main.css`, `frontend/styles/app.css`, `frontend/styles/redesign.css` |
| Browser service layer | `api/client.js`, `api/coach.api.js`, `api/trainee.api.js` (and the other `api/*.js` files were inspected but not changed) |
| Asset | `assets/brand/logo-original.png` (deleted) |

`api/*.js` was treated as **frontend code** because those modules are imported directly by `frontend/js/app.js`, use `import.meta.env.VITE_*`, and are bundled by Vite. The README label "Serverless API handlers" is inaccurate; the real serverless code lives in `backend/supabase/functions/`.

### What was explicitly out of scope
- `backend/**` (Python tooling, Supabase config, migrations, functions, RLS policies, seed data)
- `sql/**`
- `data/**`, `.venv/**`
- `docs/tofix.md` — used **only** as the issue list, never edited
- `README.md`, `SECURITY.md`, `.env.example`, `.gitignore`, `package.json`, `scripts/**` — not edited by me
- No new features, no rewrite of the vanilla-JS/Vite architecture

### Issue source
`docs/tofix.md` was the authoritative checklist. Lines 1–10 describe known UX defects; line 11 was the only active TODO (animation dropdown removal in coach Add Exercise, which was already absent in the current code).

---

## 2. Changes made, file by file

### 2.1 `frontend/js/app.js` — main application (largest set of changes)

#### a) Broken `mailto:` links replaced with clipboard actions
`docs/tofix.md:1` reported `Failed to launch 'mailto:' because the scheme does not have a registered handler.` Five anchors were converted to buttons that call the existing `copyText()` helper:

| Location (original) | Context | New markup |
| --- | --- | --- |
| `:1185` | Landing footer contact email | `<button class="link-btn" data-action="copy-text" data-copy-value="ayhamshahada03@gmail.com">` |
| `:2246` | Coach profile modal — contact coach | `<button class="btn btn-secondary btn-sm" data-action="copy-text" data-copy-value="${esc(coach.email)}">` |
| `:2392` | Trainee schedule — contact coach | `<button class="btn btn-secondary" data-action="copy-text" data-copy-value="${esc(coachEmail)}">` |
| `:2463` | Locked-plan status card — contact coach | `<button class="btn btn-secondary" data-action="copy-text" data-copy-value="${esc(coachEmail)}">` |
| `:2732` | Trainee settings — email coach | `<button class="btn btn-secondary btn-sm" data-action="copy-text" data-copy-value="${esc(coach.email)}">` |

All buttons use `type="button"`, so they cannot accidentally submit a surrounding form. WhatsApp (`wa.me`) and `tel:` links were left unchanged.

A new delegated handler was added to `bindEvents()`:

```js
if (action === "copy-text") {
  const value = actionButton.dataset.copyValue;
  if (value) copyText(value);
}
```

The existing `copy-email` / `copy-password` branch now `return`s to avoid falling through.

#### b) `copyText()` fallback corrected
The legacy `document.execCommand("copy")` fallback unconditionally showed a success toast even if the browser refused the copy. It now captures the boolean result and reports failure:

```js
let copied = false;
try { copied = document.execCommand("copy"); } catch { copied = false; }
area.remove();
if (copied) showToast(t("copiedToast"));
else showToast(t("errGeneric"), "error");
```

#### c) Dynamic branding
- Imported `DEFAULT_PLATFORM_SETTINGS` from `api/client.js` and replaced the duplicated local `DEFAULT_SETTINGS` object literal with `const DEFAULT_SETTINGS = { ...DEFAULT_PLATFORM_SETTINGS };` — one shared source of truth, no DB behavior change.
- `renderSetup()`: hardcoded `R&amp;R Fit` → `${esc(brandName())}`, and `document.title = brandName();`.
- `renderLanding()`: added `brandCopy(key)` which replaces `{brand}` in the translation with `brandName()` and HTML-escapes the result. Applied to `landingHeroBody`, `landingMethodBody`, and `landingFinalBody`.
- `applyDocumentPreferences()`: the `<meta name="description">` is now updated on every render to `${brandName()} - ${t("landingMetaTitle")}`, so renaming the studio in Admin Settings updates the browser tab and meta description too.

#### d) Unsaved-form guard centralized
Previously the "discard changes?" prompt existed only for `Esc` and backdrop clicks, with two copy-pasted blocks, and was bypassed by the modal X button and every Cancel button (`data-action="close-modal"`).

Added four helpers:

| Helper | Purpose |
| --- | --- |
| `formFieldValue(element)` | Handles checkbox (boolean), radio (checked value or `""`), file (`"__selected__"` when a file is chosen), and normal fields. |
| `readFormSnapshot(form)` | Builds a keyed snapshot of all meaningful fields. Skips buttons, hidden inputs, and `data-no-snapshot="true"`. Uses `#index` suffix for checkboxes/radios so same-name groups are tracked individually (fixes the case where selecting a non-last radio would otherwise go undetected). |
| `formHasUnsavedChanges(form)` | Compares the current snapshot against `form.initialSnapshot`; always returns `false` for `data-form="confirm"` to prevent nested prompts. |
| `requestCloseModal()` | Either opens the existing discard-confirm dialog or closes immediately. |

`openModal()` now stores `form.initialSnapshot = readFormSnapshot(form)` when the modal contains a form.

Wired to **all four close paths**:
- delegated `data-action="close-modal"` (X and Cancel buttons)
- `keydown` Escape
- backdrop click

The two old duplicated FormData-based guard blocks were deleted. Confirm-dialog submission still calls `closeModal()` directly before running its action, so no recursion occurs.

#### e) View persistence gaps closed
Added `setView(view)` which sets `state.view` and calls `saveView(view)`. Replaced the three assignments that bypassed persistence:
- `navigate` action (was `state.view = ...; saveView(...)`)
- `select-trainee` action (was `state.view = "trainees";` with no save)
- after admin creates a coach account (was `state.view = "users";` with no save)

No URL router or new state feature was introduced.

#### f) Dead code removed from this file
| Symbol | Reason |
| --- | --- |
| `PRESET_KEYS` | zero references |
| `rewardTitle()` | zero references |
| `refreshLeaderboardData()` | zero references |
| `PROOF_WEIGHTS_REQUIRED`, `PROOF_SUMMARY_REQUIRED`, `PROOF_RPE_INVALID` entries in `errorMessage()` | obsolete proof codes; the generic legacy-string fallback still maps the same error text |
| `typeof restoreExercise === "function"` fallback in `restore-exercise` | `restoreExercise` is always imported; the `updateExercise(..., { isActive: true })` branch was unreachable |
| `presetKey: null` in create-exercise submit | API default already produces the same result |
| duplicate `<span class="page-date">` in trainee profile card header | the global page heading already renders the date (`docs/tofix.md:3`) |

#### g) Empty wrapper classes removed
Removed `landing-method` from the method section, `coach-welcome` from the coach dashboard welcome card, and the `<div class="review-modal">` wrapper in `openReviewProofModal()`. These had zero CSS rules and no behavior.

---

### 2.2 `api/client.js` — shared browser settings constant

- Added a new exported constant `DEFAULT_PLATFORM_SETTINGS` immediately after `DAY_KEYS`, containing 18 fields: `websiteNameEn`, `websiteNameAr`, `coachNameEn`, `coachNameAr`, `coachEmail`, `coachPhone`, `whatsappPhone`, `coachBioEn`, `coachBioAr`, `coachAvatarPath`, `coachLinks`, `leaderboardEnabled`, `leaderboardPublished`, `strictVerification`, `leaderboardStage`, `rewardTitleEn`, `rewardTitleAr`.
- Rewrote `mapSettings()` so every fallback reads from that constant instead of repeating the same string literals. Example: `websiteNameEn: settings.website_name_en || DEFAULT_PLATFORM_SETTINGS.websiteNameEn`.
- Note: the reward default was normalized from `"One Extra Free Fitness Class"` to `"One extra free fitness class"` in the shared constant (sentence case), matching the value already used by `frontend/js/app.js`.

---

### 2.3 `api/coach.api.js` — dead export removed

- Deleted the unused `export async function getWorkoutProofDetails(traineeId)` (loaded profile + up to 100 completed/skipped workouts; no callers).
- Deleted the trailing `export { buildSchedule };` line. That binding did not exist in the module and caused a `SyntaxError: Export 'buildSchedule' is not defined in module` on `node --check` once the surrounding function was removed. It was a stale leftover, not a functional export.

---

### 2.4 `api/trainee.api.js` — duplicate removed

- Deleted the local `getProofScreenshotUrl(path)` (created a 300-second signed URL). An identical copy already exists in `api/leaderboard.api.js:110`, and that is the one imported by `frontend/js/app.js:59`.

---

### 2.5 `frontend/js/extra-i18n-2.js` — brand, punctuation, wording

English values changed:
| Key | Before | After |
| --- | --- | --- |
| `landingHeroBody` | hardcoded `R&R Fit ... see-week after week.` | `{brand} ... see week after week.` |
| `landingMethodBody` | `R&R Fit keeps the conversation-and the accountability-alive` | `{brand} keeps the conversation and the accountability alive` |
| `landingFinalBody` | hardcoded `R&R Fit?` | `{brand}?` |
| `landingExperiencePoint3Body` | `rewarded-not punished` | `rewarded, not punished` |
| `socialLinksSub` | `Add a name and a link — like ...` | `Add a name and a link, like ...` |

Arabic equivalents changed for the same five keys: the three brand strings became `{brand}`, and `socialLinksSub` had its em dash replaced with a comma. This satisfies `docs/tofix.md:6` (remove all `—`) and `:8` (apply each English update to Arabic).

---

### 2.6 `frontend/js/i18n.js`, `extra-i18n.js`, `extra-i18n-2.js` — translation pruning

- Generated the unused-key list with a conservative script: a key was only considered unused if its exact quoted literal did not appear in any consumer source file (`app.js`, `graphics.js`, `compression.js`, all six `api/*.js`, `index.html`, `vite.config.js`).
- Preserved the 14 runtime-composed keys `dayMon…daySun` and `dayShortMon…dayShortSun` (built via `` `day${...}` `` and `` `dayShort${day}` ``).
- Removed **218 unused keys in both languages** (436 lines total: 396 + 16 + 18, then 6 more after the error-mapping cleanup).
- Dead groups removed included: legacy demo toolbar/theme labels, old anti-cheat/smartwatch verification screens, stickman preset labels, old leaderboard table columns and KPI labels, old recurrence/filter labels, and stale toast strings.
- After pruning: **621 EN keys / 621 AR keys**, identical key sets, zero empty values.
- Verified all 568 static `t("...")` keys found in source resolve in both dictionaries.
- Later, the sync round added 6 new error keys in each language → **627 / 627** (see §7).

---

### 2.7 `frontend/index.html`

- Static `<meta name="description">` de-branded to generic text (JS now overrides it with the configured brand at runtime).
- Static `<title>` changed from `R&R Fit` to `Fitness Coaching Studio` (JS sets the real title on every render).
- CSS load order (`main.css` → `app.css` → `redesign.css`) was left unchanged.

---

### 2.8 `frontend/styles/redesign.css`

Added rules for `.landing-footer-contact`, which was the only user-facing class in `app.js` with zero CSS rules:

```css
.landing-footer-contact {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 18px;
}
.landing-footer-contact button {
  padding: 0;
  border: 0;
  background: none;
  color: rgba(246, 243, 238, 0.78);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}
.landing-footer-contact button:hover {
  color: #fff;
  text-decoration: underline;
}
```

The email is now a button (clipboard), and the existing phone `tel:` link is styled as a link. No other design changes; `redesign.css` remains the final override layer.

---

### 2.9 `frontend/styles/main.css` — legacy rule removal

- Removed **40 provably unused rule blocks / 215 lines**, reducing the file from 571 to 356 lines.
- Removed selectors: `.demo-toolbar*`, `.demo-pill*`, `.demo-select*`, `.lang-toggle-btn`, `.section-header`, `.builder-layout`, `.draggable-exercise*`, `.week-grid`, `.day-column*`, `.scheduled-item`, `.exercise-thumb*`, `.hero-banner`, `.winner-spotlight*`, `.winner-avatar*`, `.winner-crown-badge`, `.winner-rank-pill`, `.winner-reward-banner`, `.winner-stats-box`, `.winner-stat-pill`, `.leaderboard-list`, `.you-badge`, `.motivation-strip`, `.fair-play-banner`, `.proof-chip*`.
- A rule was only removed when **every class in its selector** was absent from `app.js`, `index.html`, `app.css`, and `redesign.css`. Element/universal/attribute selectors and all `:root` token blocks were kept (this file owns 66 theme variables used by the other two stylesheets).
- Brace balance verified: 98 `{` / 98 `}` after removal.

---

### 2.10 `assets/brand/logo-original.png`

Deleted the tracked-but-unreferenced 464,239-byte original logo. `frontend/assets/logo.png` (used by both the app and the favicon) was kept. A repository-wide search for `logo-original` returned no references.

---

## 3. Items from `docs/tofix.md` verified as already fixed (not re-implemented)

| Issue | Status found |
| --- | --- |
| `:2` Trainee profile coach name missing | `mapCoachProfile()` already supplies `nameEn`/`nameAr` |
| `:4` Duplicate "Password reset link" button | only the Password button remains |
| `:9` Refresh keeps the same page | `localStorage["rr_fit_view"]` persistence already present; two bypasses were fixed in 2.1(e) |
| `:10` Unsaved-form discard confirmation | existed for Esc/backdrop; extended to all close paths in 2.1(d) |
| `:11` Animation dropdown in coach Add Exercise | the dropdown is absent, but the TODO is **not closed** — uploaded GIF replaces the animation and `preset_key` stays fixed at `"squat"`. A product decision is still needed (see `sync.md` B7). |
| `:7` Footer email/phone | markup already present; styling added in 2.8 |

---

## 4. Verification performed

All checks were run locally; no backend commands, no migrations, no SQL execution.

| Check | Result |
| --- | --- |
| `node --check` on 14 frontend/API JS files | **PASS** — no errors |
| i18n EN/AR key parity | **PASS** — 627 / 627 after the sync round (621 / 621 immediately after pruning), identical sets, no empty values |
| Static `t()` key resolution | **PASS** — 561 keys after the sync round (568 before), 0 missing in either language |
| `grep` for `mailto:`, `—`, `PRESET_KEYS`, `rewardTitle(`, `refreshLeaderboardData`, `getWorkoutProofDetails`, `review-modal`, `coach-welcome`, `landing-method` | **PASS** — no matches (only the legitimately used `EXERCISE_PRESET_KEYS` remains) |
| `getProofScreenshotUrl` | **PASS** — one definition (`leaderboard.api.js`) + one import + one call |
| CSS class coverage | **PASS** — 392 class tokens used in `app.js`, 0 without a matching rule (was 395 tokens / 4 missing) |
| CSS brace balance | **PASS** — all three stylesheets balanced |
| Vite production build | **PASS** — 62 modules transformed in 1.70 s |
| Build output | `index.html` 1.77 kB, logo 29.46 kB, CSS 128.45 kB, JS 510.31 kB |
| Build warning | Pre-existing "chunk larger than 500 kB" advisory; not introduced by this work |

Not performed: browser smoke tests (EN/AR + RTL, three themes, desktop/mobile, brand rename, dirty-form closes, email copy, proof submit/review). Those need a running dev server and a browser.

---

## 5. Change summary (numbers)

| Metric | Before | After |
| --- | --- | --- |
| i18n keys per language | 839 | 627 (621 after pruning, +6 from sync) |
| `main.css` lines | 571 | 356 |
| `main.css` rule blocks removed | — | 40 |
| Class tokens in `app.js` with no CSS rule | 4 | 0 |
| Broken `mailto:` anchors | 5 | 0 |
| Dead/duplicate symbols removed | — | 7 |
| Unreferenced assets | 1 | 0 |
| Files edited by me | — | 10 |
| Files deleted by me | — | 1 |

---

## 6. Important note about the working tree

`git status` shows modifications in many other files (`backend/**`, `sql/**`, `api/admin.api.js`, `api/auth.api.js`, `api/leaderboard.api.js`, `package.json`, `README.md`, etc.). **Those were already present / made by other work and were not touched by me.** My changes are limited to:

- `frontend/js/app.js`
- `frontend/js/i18n.js`
- `frontend/js/extra-i18n.js`
- `frontend/js/extra-i18n-2.js`
- `frontend/index.html`
- `frontend/styles/main.css`
- `frontend/styles/redesign.css`
- `api/client.js`
- `api/coach.api.js`
- `api/trainee.api.js`
- deleted `assets/brand/logo-original.png`

`frontend/styles/app.css` was inspected but not modified. `docs/tofix.md` was read only. In the sync round, `api/errors.js` (created by the backend agent) was imported and consumed but not edited; `sync.md` was updated with the frontend decisions/results.

---

## 7. Sync follow-up (from `sync.md`)

The project manager's `sync.md` identified cross-agent regressions. Frontend-side actions completed:

| Item | Action |
| --- | --- |
| **B2** | `frontend/js/app.js` — `leaderboard-settings` now sends `leaderboardStage: published` when checked and `settings.leaderboardStage || "closed"` when unchecked. The invalid `"draft"` fallback is gone, so saving with publish off no longer fails validation. |
| **B3** | No edit needed — `api/client.js` already had the DB-canonical `"One Extra Free Fitness Class"` by the time I checked (aligned by the backend agent). Arabic already matched. |
| **B4** | Added 7 mappings to `errorMessage()`: `EXERCISE_PRESET_INVALID`, `EXERCISE_MEDIA_PATH_INVALID`, `MISSING_TRAINEE`, `INVALID_LEADERBOARD_STAGE`, `SETTINGS_PATCH_REQUIRED`, `USER_REQUIRED` (six new EN+AR i18n keys) and `UNKNOWN_ACTION → errGeneric`. Replaced the duplicated raw-string regex fallbacks with a single call to `errorI18nKey()` from the backend's new shared catalog `api/errors.js`, keeping a small UI-specific override map for the six codes that need more precise messages than the catalog's generic ones. Edge-only codes intentionally keep the generic fallback. |
| **B5** | The three archive-card reads changed from `winner.verified` to `winner.completed` (lines ~1968, ~2623, ~2655), because `get_leaderboard_archive()` returns no `verified` column. The live-standings `entry.verified` read is a different object and was left alone. |
| **B6** | No smoke test of admin create/reset or proof cleanup until `APP_ORIGIN` and `CLEANUP_SECRET` are deployed — added to the handoff checklist below. |
| **B7** | No preset selector added; no backend payload field was assumed. TODO #11 remains **open**, not "done". §3 above now says so. |
| **B8** | No certificate write change — held pending the backend decision on whether the `main_coach_id` filter stays or is dropped. |
| **B1** | `api/**` is now treated as shared. The only `api/**` value involved this round was the already-aligned B3 default; no export, error code, or enum was changed by me. |

Verification for this round: `node --check` PASS on `app.js`, `extra-i18n.js`, `api/client.js`, `api/errors.js`; i18n 627/627 with 0 empties; all `api/errors.js` keys present in EN; 561 static `t()` keys resolve in both languages; grep confirms no `winner.verified` and no `"draft"` leaderboard stage; Vite build PASS (62 modules, JS 510.31 kB, pre-existing chunk advisory).

### Updated handoff checklist (frontend side)
- [x] `leaderboard-settings` save uses a schema-valid stage with publish on **and** off (static check; browser test still pending).
- [x] Every UI-facing error code has an i18n mapping; Edge-only codes intentionally use `errGeneric` via the shared catalog.
- [x] Previous-winners cards read a field the archive RPC actually returns (`completed`).
- [ ] Brand rename smoke test: tab title, meta description, landing copy, seeded reward label.
- [ ] Coach creates an exercise without a preset key; trainee sees sensible media (B7 decision pending).
- [ ] Certificate visibility with `main_coach_id` set (B8 decision pending).
- [ ] Admin create/reset and proof cleanup only after Edge secrets are deployed (B6).
