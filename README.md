# R&R Fit

Private, coach-led fitness coaching for women — weekly programming, proof-reviewed workouts, progress tracking, and animated exercise demos right in the weekly schedule.

Live: **https://r-r-fit.pages.dev/**

English and Arabic out of the box, with full RTL support and per-user language/theme preferences.

---

## Features

### Trainee
- Weekly schedule with sets, reps, rest, and coach notes
- Static exercise previews on each scheduled workout; tap one to open the animated demo with full details
- Workout check-in with proof screenshots (compressed in the browser) or a WhatsApp share
- Progress, streaks, and weekly scoring
- Leaderboard built on verified sessions
- Profile, appearance, and password settings

### Coach
- Dashboard with trainee activity and proof review queue
- Trainee management: access, schedule builder, rest days, recurrence
- Exercise library management: create, edit, archive, restore, upload media
- Leaderboard management and weekly rollover
- Studio and profile settings

### Admin
- User management: create coach and trainee accounts, reset passwords, lock/unlock access
- Subscription/access control
- Platform branding and settings

Accounts are created by a coach or admin; there is no public sign-up.
**Keep email signup disabled in the live Supabase project** (Auth → Providers →
Email → *Allow new users to sign up* off). The RLS policies are written `to
authenticated`, so if signup is left on, any visitor can register and read
coach contact details, certificates, and leaderboard data. Provision accounts
through the `admin-users` Edge Function instead.

### Proof lifecycle

Trainees can send proof two ways: upload a screenshot in the app, or share the
photo with the coach on WhatsApp (the workout then appears in the coach queue
as "Via WhatsApp"). Photos up to 10 MB are accepted and compressed in the
browser before upload. The coach can approve a workout either way, with or
without an in-app screenshot.

Proof images are removed automatically to keep storage small:

| Proof state | Image deleted after |
| --- | --- |
| Verified or rejected | 3 days |
| Unreviewed (pending review) | 14 days |

The workout record, status, comment, and coach note stay. Cleanup runs from the
`cleanup-proofs` Edge Function on a daily schedule (see `sql/schedule_cleanup.sql`).

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Vanilla JS (ES modules) + Vite |
| Auth / data | Supabase (Postgres, RLS, Storage, Auth) |
| API | Browser-side data-access modules in `api/` using the Supabase anon client; Edge Functions are the server-side API |
| Backend tooling | Python >=3.11,<3.15 (`backend/scripts/verify_db.py`) |
| Hosting | Cloudflare Pages |
| Styling | Hand-written CSS with light/dark themes |

---

## Quick start

```powershell
npm install
Copy-Item .env.example .env
# fill in the Supabase values in .env
npm run dev
```

Dev server: `http://localhost:5173`

### Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | browser | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | Public anon key (safe to ship) |
| `VITE_DEFAULT_LANG` | browser | `en` or `ar` |
| `VITE_DEFAULT_THEME` | browser | Default theme id |
| `SUPABASE_URL` | scripts / edge | Supabase project URL (legacy browser alias: `VITE_SUPABASE_URL`) |
| `SUPABASE_ANON_KEY` | scripts | Read-only validation fallback (aliases: `ANON_KEY`, `VITE_SUPABASE_ANON_KEY`) |
| `SUPABASE_SERVICE_ROLE_KEY` | scripts / edge | Required for structural validation and admin bootstrap (legacy edge alias: `SERVICE_ROLE_KEY`) — never ship this |
| `SUPABASE_DB_URL` | scripts | Direct Postgres URL, required **only** for `backend:apply` / `backend:seed` (alias: `DATABASE_URL`) |
| `ADMIN_PASSWORD` | scripts | Optional bootstrap input; prefer this or `--password-stdin` over the deprecated `--password` flag |
| `CLEANUP_SECRET` | edge function | **Required** shared secret for scheduled cleanup; also store the same value in Vault |
| `SUPABASE_SECRET_KEYS` | edge function | Optional/new-format JSON key map; legacy fallbacks are the service-role variables |
| `APP_ORIGIN` | edge function | Comma-separated allowed origins |

Only `VITE_*` values are bundled into the frontend. A service-role key must never appear in frontend code or a `VITE_*` variable. The `/docs/` directory is git-ignored for local notes; `/data/` is ignored for local exercise data.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Regenerate exercise thumbnails, then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run thumbs` | Regenerate static exercise thumbnails only |
| `npm run backend:setup` | Install pinned Python dependencies into the virtualenv |
| `npm run backend:validate` | Validate the remote schema (reduced checks with only an anon key) |
| `npm run backend:validate:strict` | Validate and fail on security/config warnings |
| `npm run backend:apply` | Apply migrations in filename order (requires `SUPABASE_DB_URL`); never applies `seed.sql` |
| `npm run backend:seed` | Apply `seed.sql` only (requires `SUPABASE_DB_URL`) |
| `npm run backend:bootstrap-admin` | Create the first admin account |

All backend scripts call `scripts/run_backend_py.mjs`, a portable wrapper that
picks `.venv/Scripts/python.exe`, `.venv/bin/python`, or `python` from PATH.
Pass extra flags after `--`, for example
`npm run backend:apply -- --dry-run` for a no-write preflight or
`npm run backend:bootstrap-admin -- --email admin@example.com --reset-password`.
Dependencies are pinned in `backend/requirements.txt`; Python >=3.11,<3.15 is
supported (verified on 3.14).

---

## Project structure

```
api/                     Browser-side data-access modules (Supabase anon client)
  auth.api.js            Sign in, sign out, password reset
  coach.api.js           Coach workspace, schedules, exercises
  trainee.api.js         Trainee workspace, proof submission
  admin.api.js           User and brand management
  leaderboard.api.js     Leaderboard, proof review
  client.js              Supabase client, row mappers, shared helpers

backend/
  requirements.txt       Pinned Python dependencies
  scripts/verify_db.py   Validate / apply / seed / bootstrap
  supabase/
    migrations/          Ordered SQL migrations (the source of truth)
    functions/           Edge functions (server-side: admin-users, cleanup-proofs)
    schema.sql           Superseded reference copy - do not apply manually
    rls_policies.sql     Superseded reference copy - do not apply manually
    rpc_functions.sql    Superseded reference copy - do not apply manually
    seed.sql             Reference data (platform settings + categories)

frontend/
  index.html             App shell
  js/                    app.js, i18n modules, graphics, avatars
  styles/                main.css, app.css, redesign.css
  assets/                Bundled images (logo)
  public/exercises/      Animated exercise SVGs
    thumbs/              Static poster SVGs (generated)

scripts/
  make_thumbs.mjs        Build static thumbnails from animations
  run_backend_py.mjs     Portable Python wrapper for backend:* scripts

sql/                     Legacy/manual helpers only
  fix_exercises.sql      Legacy one-shot repair (media paths + descriptions)
  schedule_cleanup.sql   Daily proof-cleanup cron schedule (requires CLEANUP_SECRET)

data/                    Local-only exercise data (git-ignored)
docs/                    Local notes (git-ignored)
```

Other root `sql/` files have been superseded by migrations in
`backend/supabase/migrations/`; do not recreate or run them on a fresh project.

---

## Exercise media

Each exercise has one animated SVG in `frontend/public/exercises/ex_exN.svg` using inline SMIL (`<animate>`, `viewBox="0 0 240 145"`, `width="100%" height="100%"`).

- The trainee **My Schedule** view loads the static poster from `thumbs/ex_exN.svg` inside each workout card.
- Tapping a workout card opens the **detail modal** with the animated file and full exercise details.
- The full exercise library is a **coach-only** management view (create, edit, archive, restore, upload media).
- `scripts/make_thumbs.mjs` copies each animation with `<animate>`/`<set>` tags stripped.
- Thumbnails are generated automatically by `npm run build`; use `npm run thumbs` after editing an animation without a full build.
- Supabase `exercises.media_path` must point at `exercises/ex_exN.svg`. Paths such as `assets/...`, `data:...`, or Storage URLs bypass the bundled files.

### Legacy repair

`sql/fix_exercises.sql` is a legacy one-shot repair for older databases. It:

1. Removes leaked `[ANIMATION_CODE]` blocks from English and Arabic descriptions.
2. Points all 50 exercises at their bundled animation.

Fresh projects get exercises from `backend/supabase/migrations/20261125000200_seed_exercises.sql`,
so this file is not part of normal setup.

---

## Database setup

1. Create a Supabase project and copy `.env.example` to `.env`.
2. Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL`.
   The anon key is only a fallback for reduced read-only validation; the direct
   Postgres URL is required **only** for `backend:apply` and `backend:seed`.
   Keep every service credential out of `VITE_*` variables.
3. Install dependencies and apply migrations, then seed reference data:

   ```powershell
   npm install
   npm run backend:setup
   npm run backend:apply
   npm run backend:seed
   npm run backend:validate:strict
   ```

   `backend:apply` runs only `backend/supabase/migrations/*.sql` in strict
   filename order (including `20261125000200_seed_exercises.sql`, which populates
   the exercise library). It does **not** apply the superseded root copies
   `schema.sql`, `rls_policies.sql`, `rpc_functions.sql`, and it does **not** run
   `seed.sql` — that is the separate `backend:seed` step for platform settings and
   categories. Add `-- --dry-run` to either command for a no-write preflight.
4. Create the first admin account. The password can come from `ADMIN_PASSWORD`,
   `--password-stdin`, or an interactive hidden prompt; `--password` still works
   but is deprecated and never echoed:

   ```powershell
   $env:ADMIN_PASSWORD = "a-strong-password"
   npm run backend:bootstrap-admin -- --email admin@example.com `
     --name-en "Studio Admin" --name-ar "مديرة الاستوديو"
   # or: Get-Content admin-password.txt | npm run backend:bootstrap-admin -- --email admin@example.com --password-stdin
   ```

   To rotate the password of an existing admin, add `--reset-password` (or
   supply the new value via `--password-stdin`, or set `ADMIN_RESET_PASSWORD=1`).
   Promoting an existing non-admin profile requires `--force`.

No root `sql/` file is part of normal setup. `sql/fix_exercises.sql` is only a
legacy repair, and `sql/schedule_cleanup.sql` is the separate cron schedule
described under [Proof cleanup](#proof-cleanup). Local notes under `docs/` and
data under `data/` are git-ignored.

### Coach About page

The coach edits her public profile in the **About me** tab: photo, bio (English
and/or Arabic), reorderable links, and certificates (JPG, PNG, WebP or PDF up to
25 MB each). Bio, links, and the photo path live on the `platform_settings`
row, which every signed-in user can read; certificates live in
`coach_certificates`.

Files are stored in the private `coach-media` bucket and served to trainees
through one-hour signed URLs. Only the owning coach can write inside her
`<coach_id>/` folder. Trainees open the coach profile from the schedule card,
the locked-plan card, or trainee settings.

### Proof cleanup

The `cleanup-proofs` Edge Function deletes proof images after their retention
window (3 days after approval/rejection, 14 days after completion if
unreviewed). The workout record is kept.

```powershell
supabase functions deploy cleanup-proofs --no-verify-jwt
```

This job is called by `pg_cron`, not by a logged-in user, so JWT verification is
disabled deliberately. It is protected by a dedicated shared secret, which is
**required** for the scheduled job:

1. Generate a strong secret and store it as the Edge Function secret
   `CLEANUP_SECRET` (Supabase Dashboard → Edge Functions → Secrets).
2. Store the **same value** in Vault (see `sql/schedule_cleanup.sql` for the
   generation command):

```sql
select vault.create_secret('<CLEANUP_SECRET>', 'cleanup_secret', 'cleanup-proofs cron');
```

3. Run `sql/schedule_cleanup.sql` in the SQL editor and replace
   `<PROJECT_REF>` with your project reference.

Do **not** put the service-role key in Vault for this job — the cron call only
needs `CLEANUP_SECRET`, and the function reads the service key from its own
server-side environment. If `pg_cron` is unavailable on your plan, create the
same daily schedule in the Supabase Dashboard under **Integrations → Cron**.

---

## Deployment

The app deploys from the `master` branch on Cloudflare Pages:

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Root directory:** repository root

Push to `master` triggers a new deployment. The build regenerates thumbnails before Vite copies `frontend/public/` into `dist/`, so animations and posters are always in sync.

---

## Conventions

- **Language:** every user-facing string goes through `t()`. Add keys to both `I18N.en` and `I18N.ar`; missing keys render their literal name.
- **Direction:** Arabic switches the document to `dir="rtl"`; use logical CSS properties (`inset-inline`, `margin-inline`) and mirror directional icons.
- **State:** view and preferences persist in `localStorage`; workspace data comes from the API layer.
- **Media:** never embed data URIs in `exercises.media_path` — use bundled paths or Supabase Storage.

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Exercise images 404 in production but work locally | `media_path` still points at `assets/exercises/...`; run `sql/fix_exercises.sql` |
| Animations look outdated | Re-run `npm run build` (or `npm run thumbs`) and redeploy |
| `401 Invalid API key` from backend scripts | Rotate/copy a fresh `SUPABASE_SERVICE_ROLE_KEY` into `.env` |
| `permission denied for table ...` with the anon key | Expected under RLS; use the service-role key for scripts |
| Raw keys like `restoreBtn` appear in the UI | The key is missing from `frontend/js/extra-i18n*.js` in both languages |

---

## Security

This is a live application. Please report security issues privately instead of
opening a public issue — see [SECURITY.md](SECURITY.md) for the reporting
process, scope, and key rotation checklist. After rotating credentials, re-run
`npm run backend:validate:strict`.

## License

Released under the [MIT License](LICENSE).
