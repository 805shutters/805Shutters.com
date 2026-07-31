-- The v2 RPC is an internal atomic writer used directly only when the
-- validation-only v3 wrapper is unavailable. Keep both record-only write
-- functions behind the server's service-role boundary.
revoke all on function public.crm_create_ken_payment_batch_v2(date, date, numeric, text, text, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.crm_create_ken_payment_batch_v2(date, date, numeric, text, text, jsonb, jsonb)
to service_role;
