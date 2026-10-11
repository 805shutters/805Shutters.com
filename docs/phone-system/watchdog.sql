-- Apply only after pg_cron, pg_net and Vault are enabled in the dedicated 805 project.
-- Provision these two Vault secrets privately first; no credentials belong in SQL source.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'voice_805_origin')
     or not exists (select 1 from vault.secrets where name = 'voice_805_worker_key') then
    raise exception '805 watchdog Vault secrets are not configured';
  end if;
end $$;
select cron.schedule('voice-805-watchdog', '5 seconds', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'voice_805_origin') || '/worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'voice_805_worker_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
$job$);
