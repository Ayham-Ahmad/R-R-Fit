-- Schedule the daily proof-cleanup Edge Function.
--
-- Retention enforced by the function:
--   * verified / rejected proof images -> deleted 3 days after the decision
--   * unreviewed proof images          -> deleted 14 days after completion
--
-- Prerequisites
--   1. Deploy the function:  supabase functions deploy cleanup-proofs
--   2. Run this script in the Supabase SQL editor as the postgres role.
--
-- Replace <PROJECT_REF> below with your Supabase project reference.
-- The service role key is read from Supabase Vault. Store it once with:
--
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--
-- (If you already stored it under another name, update the query below.)

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
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cleanup-proofs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify the schedule:
--   select jobid, jobname, schedule, active from cron.job;
--
-- If pg_cron is not available on your plan, create the same daily schedule in
-- the Supabase Dashboard under Integrations -> Cron and point it at:
--   https://<PROJECT_REF>.supabase.co/functions/v1/cleanup-proofs
-- with the header  Authorization: Bearer <SERVICE_ROLE_KEY>.
