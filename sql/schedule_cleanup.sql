-- Schedule the daily proof-cleanup Edge Function.
--
-- Retention enforced by the function:
--   * verified / rejected proof images -> deleted 3 days after the decision
--   * unreviewed proof images          -> deleted 14 days after completion
--
-- Auth model: a dedicated shared secret, not a Supabase API key.
-- This avoids legacy/new key differences and gateway JWT checks.
--
-- Prerequisites
--   1. Deploy the function:  supabase functions deploy cleanup-proofs --no-verify-jwt
--      (or disable "Enforce JWT verification" for cleanup-proofs in the Dashboard)
--   2. Add the Edge Function secret CLEANUP_SECRET with the same value used below.
--   3. Run this script once in the Supabase SQL editor as the postgres role.
--
-- Generate a secret (PowerShell):
--   $b = New-Object byte[] 32
--   [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
--   ($b | ForEach-Object { $_.ToString('x2') }) -join ''
--
-- Store it in Vault:
--   select vault.create_secret('<CLEANUP_SECRET>', 'cleanup_secret', 'cleanup-proofs cron');
--
-- This script replaces any existing 'cleanup-workout-proofs' job, so it is
-- safe to re-run.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-workout-proofs') then
    perform cron.unschedule('cleanup-workout-proofs');
  end if;
end $$;

select cron.schedule(
  'cleanup-workout-proofs',
  '15 3 * * *', -- every day at 03:15 UTC
  $job$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cleanup-proofs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret')
    ),
    body := '{}'::jsonb,
    -- 30s covers Edge Function cold starts. pg_net's default is only 5s.
    timeout_milliseconds := 30000
  );
  $job$
);

-- Verify the schedule:
--   select jobid, jobname, schedule, active
--   from cron.job
--   where jobname = 'cleanup-workout-proofs';
--
-- Run once by hand and inspect the response:
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cleanup-proofs',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-cleanup-secret',
--         (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret')
--     ),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 30000
--   ) as request_id;
--
--   -- wait ~5 seconds, then:
--   select status_code, timed_out, error_msg, left(content, 300) as content, created
--   from net._http_response
--   order by created desc
--   limit 3;
