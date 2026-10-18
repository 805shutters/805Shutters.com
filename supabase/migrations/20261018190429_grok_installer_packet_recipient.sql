-- Route new installer packets to the approved inbox. Keep historical receipts
-- and provider-attempted payloads immutable to prevent duplicate delivery.
alter table public.crm_installer_delivery_outbox
  drop constraint crm_installer_delivery_outbox_recipient_check;
alter table public.crm_installer_delivery_outbox
  add constraint crm_installer_delivery_outbox_recipient_check
  check (recipient in ('mtsagent101@gmail.com', 'mtsinstallations@gmail.com', 'wcbot@mail.grokbot.com'));
alter table public.crm_installer_delivery_outbox
  alter column recipient set default 'wcbot@mail.grokbot.com';

update public.crm_installer_delivery_outbox
set recipient = 'wcbot@mail.grokbot.com', payload = null, idempotency_key = null, updated_at = now()
where recipient in ('mtsagent101@gmail.com', 'mtsinstallations@gmail.com')
  and status in ('pending', 'retry')
  and first_send_attempt_at is null
  and provider_message_id is null
  and lease_token is null;

notify pgrst, 'reload schema';
