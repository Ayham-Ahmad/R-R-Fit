# R&R Fit

Bilingual (English / Arabic) private fitness-coaching app: trainee workspace, coach dashboard, admin tools, weekly schedules, proof review, progress, and an exercise library with animated demos.

## Stack

- **Frontend:** vanilla JS + Vite, served as a static build from `frontend/`
- **API:** serverless handlers in `api/` (Supabase JS client)
- **Backend:** Supabase migrations and maintenance scripts in `backend/`

## Requirements

- Node.js 20+
- Python 3.11+ (only for `backend:*` scripts)

## Setup

```powershell
npm install
Copy-Item .env.example .env   # then fill in the Supabase values
```

`.env` keys:

| Key | Used by |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | browser bundle |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` | backend scripts only |
| `APP_ORIGIN` | admin edge function |

Never put a service-role key in a `VITE_*` variable.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on `http://localhost:5173` |
| `npm run build` | Regenerates exercise thumbnails, then builds to `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run thumbs` | Regenerates static thumbnails only |
| `npm run backend:validate` | Validates the remote schema |
| `npm run backend:apply` | Applies pending migrations |
| `npm run backend:seed` | Seeds reference data |
| `npm run backend:bootstrap-admin` | Creates the first admin account |

## Directory layout

```
api/                 Serverless API handlers (auth, coach, trainee, admin, leaderboard)
backend/             Supabase migrations + verify_db.py maintenance script
frontend/            Vite root
  index.html         App shell
  js/                Frontend modules (app, i18n, graphics, ...)
  styles/            CSS
  assets/            Bundled images (logo, ...)
  public/            Static files copied verbatim to dist/
    exercises/       Animated exercise SVGs (SMIL)
      thumbs/        Static poster SVGs generated at build time
scripts/             Repo maintenance scripts (make_thumbs.mjs, check_db_access.mjs)
sql/                 One-shot SQL fixes to run in the Supabase SQL Editor
data/                Local-only exercise data (git-ignored)
docs/                Local notes (git-ignored)
```

## Exercise media

Animated demos live in `frontend/public/exercises/ex_exN.svg` as inline SMIL animation (`viewBox="0 0 240 145"`). The trainee exercise library shows the static `thumbs/ex_exN.svg` in the grid and the animated file in the detail modal.

- `scripts/make_thumbs.mjs` strips `<animate>` tags from each animation to build `thumbs/`.
- Thumbnails are regenerated automatically by `npm run build`; run `npm run thumbs` after editing an animation if you only want to refresh posters.
- `media_path` rows in Supabase must point at `exercises/ex_exN.svg` (not `assets/...`, data URIs, or Storage URLs) for production to serve them.

### One-time database fix

Run `sql/fix_exercises.sql` once in the Supabase SQL Editor. It:

1. Strips leaked `[ANIMATION_CODE]` blocks from exercise descriptions.
2. Points all 50 exercises at their bundled animation.

`sql/update_media_paths.sql` and `sql/clean_animation_codes.sql` contain the same statements separately.

## Deployment

The site deploys from `master` to Cloudflare Pages. The build command is `npm run build` and the output directory is `dist`.
