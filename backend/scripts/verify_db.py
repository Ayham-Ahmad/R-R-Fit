#!/usr/bin/env python3
"""Validate or apply the NoorFit Studio Supabase database.

Examples (always run with the isolated .venv interpreter):
  .venv\\Scripts\\python.exe backend/scripts/verify_db.py --validate
  .venv\\Scripts\\python.exe backend/scripts/verify_db.py --apply
  .venv\\Scripts\\python.exe backend/scripts/verify_db.py --seed

--apply requires SUPABASE_DB_URL (the direct Postgres connection string).
--validate uses the Supabase REST/Storage APIs and requires SUPABASE_URL plus
SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY for read-only table checks).
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
            "Prefer": "return=representation",
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
    print(f"  OK  {len(categories or [])} categories, {len(exercises or [])} exercises")

    weeks = api_request(
        base_url,
        key,
        "/rest/v1/leaderboard_weeks?select=id,label_en&is_live=eq.true&limit=1",
    )
    print(f"  OK  live week: {weeks[0]['label_en'] if weeks else 'none (seed will create one)'}")

    try:
        leaderboard = api_request(
            base_url,
            key,
            "/rest/v1/rpc/get_weekly_leaderboard",
            method="POST",
            body={},
        )
        count = len(leaderboard) if isinstance(leaderboard, list) else 0
        print(f"  OK  get_weekly_leaderboard returned {count} public rows")
    except SystemExit as exc:
        print(f"  WARN leaderboard RPC check skipped: {exc}")

    try:
        bucket = api_request(base_url, key, "/storage/v1/bucket/workout-proofs")
        if isinstance(bucket, dict):
            print(
                "  OK  private bucket: "
                f"{bucket.get('name')} public={bucket.get('public')} "
                f"limit={bucket.get('file_size_limit')}"
            )
    except SystemExit as exc:
        print(f"  WARN storage bucket check skipped: {exc}")

    print("\nDatabase validation completed.")


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
    parser = argparse.ArgumentParser(description="Validate or apply NoorFit's Supabase backend.")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--validate", action="store_true", help="Validate tables, seed data, RPC and storage bucket.")
    action.add_argument("--apply", action="store_true", help="Apply schema, RLS, RPC and seed SQL via Postgres.")
    action.add_argument("--seed", action="store_true", help="Apply only seed.sql via Postgres.")
    args = parser.parse_args()

    try:
        if args.validate:
            validate_rest()
        elif args.apply:
            apply_sql(seed_only=False)
        else:
            apply_sql(seed_only=True)
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
