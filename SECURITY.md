# Security Policy

R&R Fit is a live application. If you find a security issue, please report it
privately so it can be fixed before details are made public.

## Reporting a vulnerability

Email **ayhamshahada03@gmail.com** with:

- A description of the issue and the affected URL, table, bucket, or endpoint.
- Steps to reproduce (a minimal example is ideal).
- The potential impact (e.g. can another user's data be read or changed?).

Please do **not** open a public GitHub issue for security reports. You should
receive an acknowledgement within a few days. Once the issue is resolved,
I'll let you know and, if you'd like, credit you in the release notes.

## Scope

- The live app at https://r-r-fit.pages.dev/
- This repository, including the Supabase schema, migrations, RLS policies,
  Edge Functions, and the frontend/API code.

## Please avoid

- Testing against real trainee accounts or personal data. Use your own demo
  accounts only.
- Denial-of-service, brute-force, or automated mass scanning.
- Reporting issues in third-party services (Supabase, Cloudflare) here — those
  should go to the vendor's own security program.
