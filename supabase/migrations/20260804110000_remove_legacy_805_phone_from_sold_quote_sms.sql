-- Retire the former 805 business number from delivery-state metadata.
-- Quote, customer, and payment records are intentionally untouched.
delete from public.crm_sold_quote_sms_notifications
where recipient_e164 = '+18056300848'
   or recipient = '+18056300848';
