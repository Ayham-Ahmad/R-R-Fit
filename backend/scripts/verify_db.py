#!/usr/bin/env python3
"""Validate, apply, or bootstrap the R&R Fit Supabase backend.

Supported Python: 3.11 - 3.14. Install dependencies with `npm run backend:setup`.

Examples (npm scripts use the portable .venv wrapper in scripts/run_backend_py.mjs):
  npm run backend:validate
  npm run backend:validate:strict
  npm run backend:apply             # migrations, in strict filename order
  npm run backend:seed              # seed.sql only
  npm run backend:bootstrap-admin -- --email admin@example.com

--apply reads backend/supabase/migrations/*.sql in strict filename order. It
never applies the superseded top-level schema.sql, rls_policies.sql or
rpc_functions.sql, and it never applies seed.sql (use --seed for that).
Add --dry-run to any write action for a no-write preflight.

--validate uses the Supabase REST/Storage/Auth APIs. Structural checks (columns,
RPCs, buckets, auth settings) require SUPABASE_SERVICE_ROLE_KEY; with only an
anon key a reduced read-only check runs. --strict turns warnings into failures.

--bootstrap-admin is a local server-side command and must never move into
frontend code. It requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
SUPABASE_DIR = ROOT / "backend" / "supabase"
MIGRATIONS_DIR = SUPABASE_DIR / "migrations"
SEED_FILE = SUPABASE_DIR / "seed.sql"

REQUIRED_TABLES = (
    "profiles",
    "platform_settings",
    "leaderboard_weeks",
    "categories",
    "exercises",
    "trainee_day_settings",
    "scheduled_workouts",
    "activity_events",
    "leaderboard_previous_winners",
    "coach_certificates",
)
REQUIRED_COLUMNS = {
    "scheduled_workouts": ("proof_channel", "proof_purged_at"),
    "platform_settings": ("coach_bio_en", "coach_bio_ar", "coach_links", "coach_avatar_path"),
}
REQUIRED_BUCKETS = ("workout-proofs", "exercise-media", "coach-media")
REQUIRED_RPCS = (
    "get_weekly_leaderboard",
    "get_leaderboard_archive",
    "start_new_leaderboard_week",
)
# These two are read-only, so a live probe cannot mutate data. The rollover RPC
# is verified from the PostgREST schema list instead, and is never executed.
READ_ONLY_RPCS = frozenset({"get_weekly_leaderboard", "get_leaderboard_archive"})

_BEGIN_RE = re.compile(r"^\s*begin\s*;\s*(?:--.*)?$", re.IGNORECASE)
_COMMIT_RE = re.compile(r"^\s*commit\s*;\s*(?:--.*)?$", re.IGNORECASE)


def load_environment() -> None:
    load_dotenv(ROOT / ".env", override=False)


def env_lookup(*names: str) -> tuple[str | None, str | None]:
    """Return (variable name, stripped value) for the first non-empty alias.

    Values are deliberately never included in messages or preflight output.
    """
    for name in names:
        value = os.getenv(name)
        if value and value.strip():
            return name, value.strip()
    return None, None


def require_env(*names: str) -> tuple[str, str]:
    name, value = env_lookup(*names)
    if not value:
        joined = " or ".join(names)
        raise SystemExit(f"Missing {joined}. Add it to {ROOT / '.env'}.")
    return name or names[0], value


def env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def api_request(
    base_url: str,
    key: str,
    path: str,
    *,
    method: str = "GET",
    body: object | None = None,
    prefer: str = "return=representation",
) -> object:
    return _request(base_url, key, path, method=method, body=body, prefer=prefer)[0]


def _request(
    base_url: str,
    key: str,
    path: str,
    *,
    method: str = "GET",
    body: object | None = None,
    prefer: str = "return=representation",
    headers: dict[str, str] | None = None,
) -> tuple[object, dict[str, str]]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request_headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=data,
        method=method,
        headers=request_headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            parsed = json.loads(raw) if raw else None
            return parsed, {name.lower(): value for name, value in response.headers.items()}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Supabase API {method} {path} failed ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Could not reach Supabase: {exc.reason}") from exc


def parse_exact_count(content_range: str | None) -> int | None:
    """Read the total from a PostgREST Content-Range header, if it is exact."""
    if not content_range or "/" not in content_range:
        return None
    total = content_range.rsplit("/", 1)[-1].strip()
    if not total.isdigit():
        return None
    return int(total)


def api_count(base_url: str, key: str, path: str) -> int | None:
    """Ask PostgREST for an exact count; None means it was unavailable/truncated."""
    _, headers = _request(
        base_url,
        key,
        path,
        prefer="count=exact",
        headers={"Range": "0-0"},
    )
    return parse_exact_count(headers.get("content-range"))


def columns_exist(base_url: str, key: str, table: str, columns: tuple[str, ...]) -> tuple[bool, str]:
    select = ",".join(columns)
    try:
        _request(base_url, key, f"/rest/v1/{table}?select={select}&limit=1")
        return True, ""
    except SystemExit as exc:
        return False, str(exc)


def rpc_names_from_openapi(base_url: str, key: str) -> set[str] | None:
    """List exposed RPCs without executing any of them (including rollover)."""
    try:
        spec, _ = _request(
            base_url,
            key,
            "/rest/v1/",
            headers={"Accept": "application/openapi+json"},
        )
    except SystemExit:
        return None
    if not isinstance(spec, dict):
        return None
    names: set[str] = set()
    for path in spec.get("paths", {}):
        if "/rpc/" in path:
            names.add(path.split("/rpc/", 1)[1].split("/", 1)[0])
    return names


def rpc_reachable(base_url: str, key: str, name: str, body: dict) -> tuple[bool, str]:
    """Return False only when PostgREST says the function does not exist.

    Auth/RLS or business-rule errors still prove the function is present.
    """
    try:
        _request(base_url, key, f"/rest/v1/rpc/{name}", method="POST", body=body)
        return True, ""
    except SystemExit as exc:
        message = str(exc).lower()
        missing = ("pgrst202", "could not find the function", "does not exist")
        if any(marker in message for marker in missing):
            return False, str(exc)
        return True, str(exc)


class ValidationReport:
    def __init__(self, strict: bool):
        self.strict = strict
        self.failures: list[str] = []
        self.warnings: list[str] = []

    def ok(self, message: str) -> None:
        print(f"  OK  {message}")

    def warn(self, message: str) -> None:
        print(f"  WARN {message}")
        self.warnings.append(message)

    def fail(self, message: str) -> None:
        print(f"  FAIL {message}")
        self.failures.append(message)

    def finish(self) -> None:
        if not self.failures and not (self.strict and self.warnings):
            return
        details = []
        if self.failures:
            details.append(f"{len(self.failures)} error(s)")
        if self.strict and self.warnings:
            details.append(f"{len(self.warnings)} warning(s) in --strict mode")
        raise SystemExit("Validation failed: " + ", ".join(details) + ".")


def validate_rest(strict: bool = False) -> None:
    _, base_url = require_env("SUPABASE_URL", "VITE_SUPABASE_URL")
    service_source, service_key = env_lookup("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY")
    anon_source, anon_key = env_lookup("SUPABASE_ANON_KEY", "ANON_KEY", "VITE_SUPABASE_ANON_KEY")
    if not service_key and not anon_key:
        raise SystemExit(
            "Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY for read-only checks). "
            f"Add it to {ROOT / '.env'}."
        )
    if service_key:
        key_name, key = service_source or "SUPABASE_SERVICE_ROLE_KEY", service_key
        structural = True
    else:
        key_name, key = anon_source or "SUPABASE_ANON_KEY", anon_key or ""
        structural = False

    report = ValidationReport(strict)
    print(f"Supabase project: {base_url}")
    print(f"Credential: {key_name} (value hidden)")

    print("\nChecking required tables ...")
    for table in REQUIRED_TABLES:
        try:
            _request(base_url, key, f"/rest/v1/{table}?select=*&limit=1")
            report.ok(table)
        except SystemExit as exc:
            report.fail(f"table {table}: {exc}")

    print("\nChecking reference rows and exact counts ...")
    settings = api_request(
        base_url,
        key,
        "/rest/v1/platform_settings?select=website_name_en,website_name_ar&id=eq.1&limit=1",
    )
    if not settings:
        if structural:
            report.fail("platform_settings row 1 is missing. Run npm run backend:seed.")
        else:
            report.warn("platform_settings row 1 is not visible to the anon key; use the service role to verify it")
    else:
        row = settings[0] if isinstance(settings, list) else settings
        report.ok(f"platform settings: {row.get('website_name_en')} / {row.get('website_name_ar')}")

    counts: dict[str, int | None] = {}
    for label, path in (
        ("categories", "/rest/v1/categories?select=id"),
        ("exercises", "/rest/v1/exercises?select=id"),
        ("profiles", "/rest/v1/profiles?select=id"),
    ):
        counts[label] = api_count(base_url, key, path)
        count = counts[label]
        if count is None:
            report.warn(f"exact {label} count unavailable (Prefer: count=exact not honoured); value may be truncated")
        else:
            report.ok(f"{count} {label} (exact count)")

    exercise_sample = api_request(base_url, key, "/rest/v1/exercises?select=id&limit=1")
    if counts["exercises"] == 0 or (counts["exercises"] is None and not exercise_sample):
        empty_message = (
            "exercises table is empty. Run npm run backend:apply, which includes "
            "backend/supabase/migrations/20261125000200_seed_exercises.sql."
        )
        if structural:
            report.fail(empty_message)
        else:
            report.warn(f"{empty_message} (not visible to the anon key; confirm with the service role)")
    elif counts["exercises"] is None:
        report.warn("exercises exist, but the exact count could not be confirmed (at least one row)")

    admin_count = api_count(base_url, key, "/rest/v1/profiles?select=id&role=eq.admin")
    if admin_count == 0:
        report.warn("no admin exists yet. Run npm run backend:bootstrap-admin once.")
    elif admin_count is None:
        admin_sample = api_request(
            base_url, key, "/rest/v1/profiles?select=id&role=eq.admin&limit=1"
        )
        if admin_sample:
            report.warn("at least one admin exists, but the exact count could not be confirmed")
        else:
            report.warn("admin count unavailable and no admin row was returned")
    else:
        report.ok(f"{admin_count} admin account(s) (exact count)")

    weeks = api_request(
        base_url,
        key,
        "/rest/v1/leaderboard_weeks?select=id,label_en&is_live=eq.true&limit=1",
    )
    week_label = weeks[0]["label_en"] if isinstance(weeks, list) and weeks else "none (coach starts one in the app)"
    report.ok(f"live week: {week_label}")

    if not structural:
        report.warn(
            "SUPABASE_SERVICE_ROLE_KEY not set; column, RPC, bucket and auth-setting checks skipped."
        )
    else:
        print("\nChecking required columns ...")
        for table, columns in REQUIRED_COLUMNS.items():
            present, detail = columns_exist(base_url, key, table, columns)
            if present:
                report.ok(f"{table}: {', '.join(columns)}")
            else:
                report.fail(f"{table} missing required column(s) {', '.join(columns)}: {detail}")

        print("\nChecking RPCs ...")
        exposed = rpc_names_from_openapi(base_url, key)
        for name in REQUIRED_RPCS:
            if exposed is not None and name in exposed:
                report.ok(f"RPC {name} (schema list)")
            elif name in READ_ONLY_RPCS:
                body = {"p_limit": 1} if name == "get_weekly_leaderboard" else {}
                reachable, detail = rpc_reachable(base_url, key, name, body)
                if reachable:
                    report.ok(f"RPC {name} (reachable)")
                else:
                    report.fail(f"RPC {name} is missing: {detail}")
            elif exposed is None:
                report.warn(
                    f"could not confirm RPC {name} without executing it "
                    "(PostgREST schema list unavailable)"
                )
            else:
                report.fail(f"RPC {name} is not exposed")

        print("\nChecking storage buckets ...")
        for bucket_name in REQUIRED_BUCKETS:
            try:
                bucket = api_request(base_url, key, f"/storage/v1/bucket/{bucket_name}")
                if isinstance(bucket, dict) and bucket.get("name"):
                    report.ok(
                        f"bucket {bucket_name}: public={bucket.get('public')} "
                        f"limit={bucket.get('file_size_limit')}"
                    )
                else:
                    report.fail(f"bucket {bucket_name} returned an unexpected response")
            except SystemExit as exc:
                report.fail(f"bucket {bucket_name}: {exc}")

        print("\nChecking auth settings ...")
        try:
            auth_settings = api_request(base_url, key, "/auth/v1/settings")
            if isinstance(auth_settings, dict):
                if auth_settings.get("disable_signup") is True:
                    report.ok("public signup is disabled")
                else:
                    report.warn(
                        "public signup is enabled. Disable it in Supabase Auth settings; "
                        "only admins/coaches should create accounts."
                    )
            else:
                report.warn("auth settings returned an unexpected response")
        except SystemExit as exc:
            report.warn(f"auth settings check skipped: {exc}")

    report.finish()
    print("\nDatabase validation completed" + (" (strict)." if strict else "."))


def resolve_admin_password(args: argparse.Namespace) -> str:
    if args.password_stdin:
        password = sys.stdin.readline().rstrip("\r\n")
    elif os.getenv("ADMIN_PASSWORD"):
        password = os.environ["ADMIN_PASSWORD"]
    elif args.password:
        print(
            "WARNING: --password is deprecated; use ADMIN_PASSWORD or --password-stdin.",
            file=sys.stderr,
        )
        password = args.password
    else:
        password = getpass.getpass("Admin password (hidden): ")
    if len(password) < 10:
        raise SystemExit("The admin password must be at least 10 characters.")
    return password


def bootstrap_admin(args: argparse.Namespace) -> None:
    _, base_url = require_env("SUPABASE_URL", "VITE_SUPABASE_URL")
    _, service_key = require_env("SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY")
    email = args.email.strip().lower()
    if not email or "@" not in email:
        raise SystemExit("A valid admin email is required.")
    if not args.name_en.strip() or not args.name_ar.strip():
        raise SystemExit("Both English and Arabic admin names are required.")

    print("Checking existing accounts ...")
    auth_users_payload = api_request(
        base_url,
        service_key,
        "/auth/v1/admin/users?page=1&per_page=1000",
    )
    auth_users = auth_users_payload.get("users", []) if isinstance(auth_users_payload, dict) else []
    existing_user = next(
        (user for user in auth_users if str(user.get("email", "")).lower() == email),
        None,
    )

    admins = api_request(
        base_url,
        service_key,
        "/rest/v1/profiles?select=id,email&role=eq.admin&limit=100",
    ) or []
    if admins and not any(str(admin.get("email", "")).lower() == email for admin in admins):
        raise SystemExit(
            "An admin account already exists. Refusing to create a second admin. "
            "Use the existing admin account or remove it deliberately first."
        )

    existing_profile = None
    if existing_user:
        rows = api_request(
            base_url,
            service_key,
            f"/rest/v1/profiles?select=id,role,email&id=eq.{existing_user['id']}&limit=1",
        )
        existing_profile = rows[0] if isinstance(rows, list) and rows else None
    if existing_profile and existing_profile.get("role") != "admin" and not args.force:
        raise SystemExit(
            f"{email} already has a non-admin profile (role={existing_profile.get('role')}). "
            "Re-run with --force only if you intend to promote it."
        )

    # A password supplied on stdin this run is an explicit rotation request;
    # ADMIN_PASSWORD alone is only a source, not a request to overwrite.
    reset_requested = args.reset_password or args.password_stdin or env_flag("ADMIN_RESET_PASSWORD")
    metadata = {
        "name_en": args.name_en.strip(),
        "name_ar": args.name_ar.strip(),
    }
    # Never prompt for a password that will not be used.
    password = resolve_admin_password(args) if (existing_user is None or reset_requested) else ""

    if existing_user:
        user_id = existing_user["id"]
        if reset_requested:
            print("Updating auth user password and metadata ...")
            auth_body = {"password": password, "email_confirm": True, "user_metadata": metadata}
        else:
            print("Updating auth user metadata (password left unchanged) ...")
            auth_body = {"email_confirm": True, "user_metadata": metadata}
        api_request(
            base_url,
            service_key,
            f"/auth/v1/admin/users/{user_id}",
            method="PUT",
            body=auth_body,
        )
    else:
        print(f"Creating auth user {email} ...")
        created = api_request(
            base_url,
            service_key,
            "/auth/v1/admin/users",
            method="POST",
            body={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": metadata,
            },
        )
        if not isinstance(created, dict) or not created.get("id"):
            raise SystemExit("Supabase did not return the created admin user id.")
        user_id = created["id"]

    print("Promoting the account to admin ...")
    api_request(
        base_url,
        service_key,
        f"/rest/v1/profiles?id=eq.{user_id}",
        method="PATCH",
        body={
            "role": "admin",
            "name_en": args.name_en.strip(),
            "name_ar": args.name_ar.strip(),
            "email": email,
            "subscription_active": True,
            "plan_unlocked": True,
            "coach_id": None,
        },
    )

    final = api_request(
        base_url,
        service_key,
        "/rest/v1/profiles?select=id,role,email,name_en,name_ar,subscription_active,plan_unlocked"
        f"&id=eq.{user_id}&limit=1",
    )
    final_row = final[0] if isinstance(final, list) and final else None
    if not final_row or final_row.get("role") != "admin":
        raise SystemExit("The auth user was updated but the admin profile could not be confirmed.")
    if str(final_row.get("email", "")).lower() != email:
        raise SystemExit("The admin profile email does not match the requested account.")

    print("\nAdmin account is ready.")
    print(f"  Email: {email}")
    print("  Password: the one supplied to this command (never printed)")
    print("Sign in at the web app, then create the coach account from the Users screen.")


def strip_outer_transaction(sql_text: str) -> str:
    """Remove one true top-level BEGIN/COMMIT pair so psycopg owns the transaction.

    The wrapper is only removed when it is the first and last meaningful line
    of the file. Older migrations start a PL/pgSQL block with a standalone
    ``begin;`` inside a function body; that must never be stripped.
    """
    lines = sql_text.splitlines()

    def meaningful(line: str) -> bool:
        stripped = line.strip()
        return bool(stripped) and not stripped.startswith("--")

    first = next((i for i, line in enumerate(lines) if meaningful(line)), None)
    last = next((i for i in range(len(lines) - 1, -1, -1) if meaningful(lines[i])), None)
    if first is None or last is None or first == last:
        return sql_text
    if not _BEGIN_RE.match(lines[first]) or not _COMMIT_RE.match(lines[last]):
        return sql_text

    kept = [line for index, line in enumerate(lines) if index not in (first, last)]
    return "\n".join(kept).strip() + "\n"


def record_migration_version(cursor: object, filename: str) -> bool:
    """Record a numeric migration version in the same transaction, if supported."""
    version = filename.split("_", 1)[0]
    if not version.isdigit():
        return False
    cursor.execute("select to_regclass('supabase_migrations.schema_migrations')")  # type: ignore[attr-defined]
    if cursor.fetchone()[0] is None:  # type: ignore[attr-defined]
        return False
    cursor.execute(  # type: ignore[attr-defined]
        "insert into supabase_migrations.schema_migrations (version) values (%s) "
        "on conflict (version) do nothing",
        (version,),
    )
    return True


def apply_sql(*, seed_only: bool, dry_run: bool) -> None:
    db_source, database_url = env_lookup("SUPABASE_DB_URL", "DATABASE_URL")
    if seed_only:
        files = [SEED_FILE]
        print("Mode: seed.sql only")
    else:
        files = sorted(path for path in MIGRATIONS_DIR.glob("*.sql") if path.is_file())
        print("Mode: migrations in strict filename order")
    if not files:
        raise SystemExit(f"No SQL files found for the requested mode in {SUPABASE_DIR}.")

    prefix = "(dry-run) " if dry_run else ""
    for path in files:
        if not path.is_file():
            raise SystemExit(f"Missing SQL file: {path}")
        print(f"  {prefix}{path.relative_to(ROOT)}")

    if dry_run:
        print("\nDry run complete - no database connection or write was made.")
        print("  - each file would run inside its own explicit psycopg transaction")
        print("  - outer BEGIN/COMMIT statements would be stripped from the SQL")
        print("  - numeric migration versions would be recorded in supabase_migrations.schema_migrations when available")
        if db_source:
            print(f"  - database credentials would come from {db_source} (value hidden)")
        else:
            print("  - database credentials would come from SUPABASE_DB_URL or DATABASE_URL (value hidden)")
        return

    if not database_url:
        raise SystemExit(
            f"Missing SUPABASE_DB_URL (or DATABASE_URL). Add it to {ROOT / '.env'}."
        )

    try:
        import psycopg
    except ImportError as exc:
        raise SystemExit(
            "psycopg is not installed. Run: npm run backend:setup"
        ) from exc

    print()
    with psycopg.connect(database_url, connect_timeout=20, autocommit=True) as connection:
        for path in files:
            sql_text = strip_outer_transaction(path.read_text(encoding="utf-8"))
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(sql_text)
                    recorded = record_migration_version(cursor, path.name)
            suffix = " (version recorded)" if recorded else ""
            print(f"  Applied {path.name}{suffix}")

    print("\nSQL applied successfully.")


def main() -> None:
    load_environment()
    parser = argparse.ArgumentParser(description="Validate, apply, or bootstrap R&R Fit's Supabase backend.")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--validate", action="store_true", help="Validate tables, RPCs, columns, buckets and auth settings.")
    action.add_argument("--apply", action="store_true", help="Apply migrations in filename order (never seed.sql).")
    action.add_argument("--seed", action="store_true", help="Apply only seed.sql via Postgres.")
    action.add_argument(
        "--bootstrap-admin",
        action="store_true",
        help="Create or promote one admin account via the Supabase Admin API.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Preflight a write action without database writes.")
    parser.add_argument("--strict", action="store_true", help="With --validate, treat warnings as failures.")
    parser.add_argument("--email", help="Admin email for --bootstrap-admin.")
    parser.add_argument("--password", help="Deprecated: use ADMIN_PASSWORD or --password-stdin.")
    parser.add_argument("--password-stdin", action="store_true", help="Read the admin password from one stdin line.")
    parser.add_argument("--reset-password", action="store_true", help="Allow overwriting an existing user's password.")
    parser.add_argument("--force", action="store_true", help="Allow promoting an existing non-admin profile.")
    parser.add_argument("--name-en", default="Studio Admin", help="English admin name.")
    parser.add_argument("--name-ar", default="مديرة الاستوديو", help="Arabic admin name.")
    args = parser.parse_args()

    if args.strict and not args.validate:
        parser.error("--strict only applies to --validate")

    try:
        if args.validate:
            if args.dry_run:
                print("Dry run: would check tables, counts, columns, RPCs, buckets and auth settings (read-only).")
            else:
                validate_rest(strict=args.strict)
        elif args.apply or args.seed:
            apply_sql(seed_only=args.seed, dry_run=args.dry_run)
        else:
            if not args.email:
                parser.error("--bootstrap-admin requires --email")
            if args.dry_run:
                print("Dry run: would inspect existing accounts, create or update the auth user, promote the profile and re-read it.")
                source = (
                    "--password-stdin" if args.password_stdin
                    else "ADMIN_PASSWORD" if os.getenv("ADMIN_PASSWORD")
                    else "--password (deprecated)" if args.password
                    else "interactive prompt"
                )
                print(f"  password source: {source} (value hidden)")
                reset_requested = args.reset_password or args.password_stdin or env_flag("ADMIN_RESET_PASSWORD")
                print(f"  --force: {args.force}; password reset requested: {reset_requested}")
            else:
                bootstrap_admin(args)
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
