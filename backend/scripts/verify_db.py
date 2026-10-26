#!/usr/bin/env python3
"""Validate, apply, or bootstrap the R&R Fit Supabase backend.

Examples (always run with the isolated .venv interpreter):
  .venv\\Scripts\\python.exe backend/scripts/verify_db.py --validate
  .venv\\Scripts\\python.exe backend/scripts/verify_db.py --apply
  .venv\\Scripts\\python.exe backend/scripts/verify_db.py --seed
  .venv\\Scripts\\python.exe backend/scripts/verify_db.py --bootstrap-admin \
      --email admin@example.com --password "a-strong-password" \
      --name-en "Studio Admin" --name-ar "مديرة الاستوديو"

--apply requires SUPABASE_DB_URL (the direct Postgres connection string).
--validate uses the Supabase REST/Storage APIs and requires SUPABASE_URL plus
SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY for read-only table checks).
--bootstrap-admin requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. It is
intentionally a local server-side command and must never be moved into frontend
code. Run it once after applying the SQL to create the first admin account.
"""

from __future__ import annotations

import argparse
import json
import os
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
SQL_FILES = ("schema.sql", "rls_policies.sql", "rpc_functions.sql", "seed.sql")
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
)


def load_environment() -> None:
    load_dotenv(ROOT / ".env", override=False)


def require(value: str | None, name: str) -> str:
    if not value:
        raise SystemExit(f"Missing {name}. Add it to {ROOT / '.env'}.")
    return value


def api_request(
    base_url: str,
    key: str,
    path: str,
    *,
    method: str = "GET",
    body: dict | None = None,
    prefer: str = "return=representation",
) -> object:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=data,
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Supabase API {method} {path} failed ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Could not reach Supabase: {exc.reason}") from exc


def validate_rest() -> None:
    base_url = require(os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL"), "SUPABASE_URL")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("VITE_SUPABASE_ANON_KEY")
    )
    key = require(key, "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY")

    print("Checking required tables ...")
    for table in REQUIRED_TABLES:
        rows = api_request(base_url, key, f"/rest/v1/{table}?select=*&limit=0")
        if rows is not None:
            print(f"  OK  {table}")

    settings = api_request(
        base_url,
        key,
        "/rest/v1/platform_settings?select=website_name_en,website_name_ar,coach_name_en,coach_name_ar&id=eq.1",
    )
    if not settings:
        raise SystemExit("platform_settings row 1 is missing. Run seed.sql.")
    print(f"  OK  platform settings: {settings[0]['website_name_en']} / {settings[0]['website_name_ar']}")

    categories = api_request(base_url, key, "/rest/v1/categories?select=id&limit=100")
    exercises = api_request(base_url, key, "/rest/v1/exercises?select=id&limit=100")
    users = api_request(base_url, key, "/rest/v1/profiles?select=id,role&limit=1000")
    admins = [user for user in (users or []) if user.get("role") == "admin"]
    print(f"  OK  {len(categories or [])} categories, {len(exercises or [])} exercises")
    print(f"  OK  {len(users or [])} users, {len(admins)} admin account(s)")
    if not admins:
        print("  WARN no admin exists yet. Run --bootstrap-admin once.")

    weeks = api_request(
        base_url,
        key,
        "/rest/v1/leaderboard_weeks?select=id,label_en&is_live=eq.true&limit=1",
    )
    print(f"  OK  live week: {weeks[0]['label_en'] if weeks else 'none (coach starts one in the app)'}")

    try:
        archive = api_request(
            base_url,
            key,
            "/rest/v1/rpc/get_leaderboard_archive",
            method="POST",
            body={},
        )
        count = len(archive) if isinstance(archive, list) else 0
        print(f"  OK  get_leaderboard_archive returned {count} rows")
    except SystemExit as exc:
        print(f"  WARN archive RPC check skipped: {exc}")

    for bucket_name in ("workout-proofs", "exercise-media"):
        try:
            bucket = api_request(base_url, key, f"/storage/v1/bucket/{bucket_name}")
            if isinstance(bucket, dict):
                print(
                    f"  OK  bucket: {bucket.get('name')} public={bucket.get('public')} "
                    f"limit={bucket.get('file_size_limit')}"
                )
        except SystemExit as exc:
            print(f"  WARN storage bucket '{bucket_name}' check skipped: {exc}")

    try:
        auth_settings = api_request(base_url, key, "/auth/v1/settings")
        if isinstance(auth_settings, dict):
            if auth_settings.get("disable_signup"):
                print("  OK  public signup is disabled")
            else:
                print("  WARN public signup is enabled. Disable it in Supabase Auth settings; only admins/coaches create accounts.")
    except SystemExit as exc:
        print(f"  WARN auth settings check skipped: {exc}")

    print("\nDatabase validation completed.")


def bootstrap_admin(email: str, password: str, name_en: str, name_ar: str) -> None:
    base_url = require(os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL"), "SUPABASE_URL")
    service_key = require(os.getenv("SUPABASE_SERVICE_ROLE_KEY"), "SUPABASE_SERVICE_ROLE_KEY")
    email = email.strip().lower()
    if not email or "@" not in email:
        raise SystemExit("A valid admin email is required.")
    if len(password) < 10:
        raise SystemExit("The admin password must be at least 10 characters.")
    if not name_en.strip() or not name_ar.strip():
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
        "/rest/v1/profiles?select=id,email&role=eq.admin&limit=10",
    ) or []
    if admins and not any(str(admin.get("email", "")).lower() == email for admin in admins):
        raise SystemExit(
            "An admin account already exists. Refusing to create a second admin. "
            "Use the existing admin account or remove it deliberately first."
        )

    metadata = {
        "name_en": name_en.strip(),
        "name_ar": name_ar.strip(),
    }

    if existing_user:
        user_id = existing_user["id"]
        print(f"Updating auth user {email} ...")
        api_request(
            base_url,
            service_key,
            f"/auth/v1/admin/users/{user_id}",
            method="PUT",
            body={
                "password": password,
                "email_confirm": True,
                "user_metadata": metadata,
            },
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
            "name_en": name_en.strip(),
            "name_ar": name_ar.strip(),
            "email": email,
            "subscription_active": True,
            "plan_unlocked": True,
            "coach_id": None,
        },
    )

    profile = api_request(
        base_url,
        service_key,
        f"/rest/v1/profiles?select=id,role,email&id=eq.{user_id}",
    )
    if not profile or profile[0].get("role") != "admin":
        raise SystemExit("The auth user was created but the admin profile could not be confirmed.")

    print("\nAdmin account is ready.")
    print(f"  Email: {email}")
    print("  Password: the one supplied to this command")
    print("Sign in at the web app, then create the coach account from the Users screen.")


def apply_sql(seed_only: bool = False) -> None:
    database_url = require(
        os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL"),
        "SUPABASE_DB_URL",
    )

    try:
        import psycopg
    except ImportError as exc:
        raise SystemExit(
            "psycopg is not installed. Run: .venv\\Scripts\\python.exe -m pip install -r backend/requirements.txt"
        ) from exc

    files = ("seed.sql",) if seed_only else SQL_FILES
    with psycopg.connect(database_url, connect_timeout=20) as connection:
        for filename in files:
            path = SUPABASE_DIR / filename
            if not path.exists():
                raise SystemExit(f"Missing SQL file: {path}")
            print(f"Applying {filename} ...")
            with connection.cursor() as cursor:
                cursor.execute(path.read_text(encoding="utf-8"))
        connection.commit()

    print("\nSQL applied successfully.")


def main() -> None:
    load_environment()
    parser = argparse.ArgumentParser(description="Validate, apply, or bootstrap R&R Fit's Supabase backend.")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--validate", action="store_true", help="Validate tables, RPCs and storage buckets.")
    action.add_argument("--apply", action="store_true", help="Apply schema, RLS, RPC and seed SQL via Postgres.")
    action.add_argument("--seed", action="store_true", help="Apply only seed.sql via Postgres.")
    action.add_argument(
        "--bootstrap-admin",
        action="store_true",
        help="Create or promote exactly one admin account via the Supabase Admin API.",
    )
    parser.add_argument("--email", help="Admin email for --bootstrap-admin.")
    parser.add_argument("--password", help="Admin password for --bootstrap-admin.")
    parser.add_argument("--name-en", default="Studio Admin", help="English admin name.")
    parser.add_argument("--name-ar", default="مديرة الاستوديو", help="Arabic admin name.")
    args = parser.parse_args()

    try:
        if args.validate:
            validate_rest()
        elif args.apply:
            apply_sql(seed_only=False)
        elif args.seed:
            apply_sql(seed_only=True)
        else:
            if not args.email or not args.password:
                parser.error("--bootstrap-admin requires --email and --password")
            bootstrap_admin(args.email, args.password, args.name_en, args.name_ar)
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
