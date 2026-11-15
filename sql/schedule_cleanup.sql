-- Schedule the daily proof-cleanup Edge Function.
--
-- Retention enforced by the function:
--   * verified / rejected proof images -> deleted 3 days after the decision
--   * unreviewed proof images          -> deleted 14 days after completion
--
-- Prerequisites
--   1. Deploy the function:  supabase functions deploy cleanup-proofs
--   2. Run this script once in the Supabase SQL editor as the postgres role.
--
-- Replace <PROJECT_REF> below with your Supabase project reference.
--
-- The service role key is read from Supabase Vault. Store it once with:
--
--   select vault.create_secret(btrim('<SERVICE_ROLE_KEY>'), 'service_role_key');
--
-- If it already exists, overwrite it with the trimmed value:
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'service_role_key'),
--     btrim('<SERVICE_ROLE_KEY>')
--   );
--
-- btrim matters: a trailing newline in the vault value makes pg_net reject
-- the Authorization header and the request never leaves the database.
--
-- The script replaces any existing 'cleanup-workout-proofs' job, so it is
-- safe to run again after changing the URL, key, or timeout.

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
      -- apikey supports both legacy JWT keys and new sb_secret_... keys
      'apikey', (select btrim(decrypted_secret) from vault.decrypted_secrets where name = 'service_role_key'),
      'Authorization', 'Bearer ' || (select btrim(decrypted_secret) from vault.decrypted_secrets where name = 'service_role_key')
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
--       'apikey', (select btrim(decrypted_secret) from vault.decrypted_secrets where name = 'service_role_key'),
--       'Authorization', 'Bearer ' || (select btrim(decrypted_secret) from vault.decrypted_secrets where name = 'service_role_key')
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
--
-- If pg_cron is not available on your plan, create the same daily schedule in
-- the Supabase Dashboard under Integrations -> Cron and point it at:
--   https://<PROJECT_REF>.supabase.co/functions/v1/cleanup-proofs
-- with an Authorization: Bearer <SERVICE_ROLE_KEY> header and a 30s timeout.
