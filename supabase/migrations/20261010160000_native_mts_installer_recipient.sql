-- Preserve historical provider evidence; new deliveries target native MTS.
alter table public.crm_installer_delivery_outbox drop constraint crm_installer_delivery_outbox_recipient_check;
alter table public.crm_installer_delivery_outbox add constraint crm_installer_delivery_outbox_recipient_check check(recipient in ('mtsagent101@gmail.com','mtsinstallations@gmail.com'));
alter table public.crm_installer_delivery_outbox alter column recipient set default 'mtsinstallations@gmail.com';
-- Only a never-attempted, unleased packet may be regenerated. Never rewrite a
-- provider-attempted payload or its idempotency key across recipient identities.
update public.crm_installer_delivery_outbox set recipient='mtsinstallations@gmail.com',payload=null,idempotency_key=null,updated_at=now()
where recipient='mtsagent101@gmail.com' and status in ('pending','retry') and first_send_attempt_at is null and provider_message_id is null and lease_token is null;
notify pgrst,'reload schema';
