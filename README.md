# R&R Fit

Private, coach-led fitness coaching for women — weekly programming, proof-reviewed workouts, progress tracking, and animated exercise demos right in the weekly schedule.

Live: **https://r-r-fit.pages.dev/**

English and Arabic out of the box, with full RTL support and per-user language/theme preferences.

---

## Features

### Trainee
- Weekly schedule with sets, reps, rest, and coach notes
- Static exercise previews on each scheduled workout; tap one to open the animated demo with full details
- Workout check-in with proof screenshots (compressed before upload)
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

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Vanilla JS (ES modules) + Vite |
| Auth / data | Supabase (Postgres, RLS, Storage, Auth) |
| API | Serverless handlers in `api/` |
| Backend tooling | Python 3.11+ (`backend/scripts/verify_db.py`) |
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
| `SUPABASE_URL` | scripts | Supabase project URL |
| `SUPABASE_ANON_KEY` | scripts | Read-only validation |
| `SUPABASE_SERVICE_ROLE_KEY` | scripts | Admin operations — never ship this |
| `SUPABASE_DB_URL` | scripts | Direct Postgres URL for migrations |
| `APP_ORIGIN` | edge function | Comma-separated allowed origins |

Only `VITE_*` values are bundled into the frontend. A service-role key must never appear in frontend code or a `VITE_*` variable.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Regenerate exercise thumbnails, then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run thumbs` | Regenerate static exercise thumbnails only |
| `npm run backend:validate` | Validate the remote schema |
| `npm run backend:apply` | Apply migrations (requires `SUPABASE_DB_URL`) |
| `npm run backend:seed` | Seed reference data |
| `npm run backend:bootstrap-admin` | Create the first admin account |

Backend scripts use the isolated interpreter at `.venv\Scripts\python.exe`.

---

## Project structure

```
api/                     Serverless API handlers
  auth.api.js            Sign in, sign out, password reset
  coach.api.js           Coach workspace, schedules, exercises
  trainee.api.js         Trainee workspace, proof submission
  admin.api.js           User and brand management
  leaderboard.api.js     Leaderboard, proof review
  client.js              Supabase client, row mappers, shared helpers

backend/
  scripts/verify_db.py   Validate / apply / seed / bootstrap
  supabase/
    migrations/          Ordered SQL migrations
    functions/           Edge functions (admin-users)
    schema.sql           Base schema
    rls_policies.sql     Row-level security
    rpc_functions.sql    Database functions
    seed.sql             Reference data

frontend/
  index.html             App shell
  js/                    app.js, i18n modules, graphics, avatars
  styles/                main.css, app.css, redesign.css
  assets/                Bundled images (logo)
  public/exercises/      Animated exercise SVGs
    thumbs/              Static poster SVGs (generated)

scripts/
  make_thumbs.mjs        Build static thumbnails from animations
  check_db_access.mjs    Quick Supabase REST diagnostics

sql/
  fix_exercises.sql      One-shot description + media fix (run manually)
  update_media_paths.sql Media-only statements
  clean_animation_codes.sql Description-only statements

data/                    Local-only exercise data (git-ignored)
docs/                    Local notes (git-ignored)
```

---

## Exercise media

Each exercise has one animated SVG in `frontend/public/exercises/ex_exN.svg` using inline SMIL (`<animate>`, `viewBox="0 0 240 145"`, `width="100%" height="100%"`).

- The trainee **My Schedule** view loads the static poster from `thumbs/ex_exN.svg` inside each workout card.
- Tapping a workout card opens the **detail modal** with the animated file and full exercise details.
- The full exercise library is a **coach-only** management view (create, edit, archive, restore, upload media).
- `scripts/make_thumbs.mjs` copies each animation with `<animate>`/`<set>` tags stripped.
- Thumbnails are generated automatically by `npm run build`; use `npm run thumbs` after editing an animation without a full build.
- Supabase `exercises.media_path` must point at `exercises/ex_exN.svg`. Paths such as `assets/...`, `data:...`, or Storage URLs bypass the bundled files.

### One-time database fix

Run **`sql/fix_exercises.sql`** once in the Supabase SQL Editor. It:

1. Removes leaked `[ANIMATION_CODE]` blocks from English and Arabic descriptions.
2. Points all 50 exercises at their bundled animation.

The same statements are available separately as `update_media_paths.sql` and `clean_animation_codes.sql`.

---

## Database setup

1. Create a Supabase project.
2. Put the project URL and keys in `.env`.
3. Apply the schema and migrations:

   ```powershell
   .venv\Scripts\python.exe -m pip install -r backend/requirements.txt
   npm run backend:validate
   npm run backend:apply
   npm run backend:seed
   .venv\Scripts\python.exe backend/scripts/verify_db.py --bootstrap-admin `
     --email admin@example.com --password "a-strong-password" `
     --name-en "Studio Admin" --name-ar "مديرة الاستوديو"
   ```

4. Run `sql/fix_exercises.sql` if the exercise media paths have not been set yet.

Migrations live in `backend/supabase/migrations/` and are applied in filename order. `verify_db.py --apply` requires `SUPABASE_DB_URL`.

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
