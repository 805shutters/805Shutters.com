-- Stripe's existing clearance and payout functions write these audit entity types.
-- Preserve the installed allowlist (including provider-specific additions).
-- No payment, ledger, permission, or row-level security changes.
DO $migration$
DECLARE existing_check text;
BEGIN
  SELECT pg_get_expr(conbin, conrelid) INTO existing_check
  FROM pg_constraint
  WHERE conrelid = 'public.crm_activity_events'::regclass
    AND conname = 'crm_activity_events_entity_type_check' AND contype = 'c';
  IF existing_check IS NULL THEN
    RAISE EXCEPTION 'Expected CRM activity entity constraint is missing; review before applying.';
  END IF;
  EXECUTE format(
    'ALTER TABLE public.crm_activity_events DROP CONSTRAINT crm_activity_events_entity_type_check, ADD CONSTRAINT crm_activity_events_entity_type_check CHECK ((%s) OR entity_type IN (''card_migration'', ''stripe_payout''))',
    existing_check
  );
END
$migration$;
