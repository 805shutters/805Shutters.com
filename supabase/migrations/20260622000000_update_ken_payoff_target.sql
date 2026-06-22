-- Update the Ken business purchase payoff ledger to the revised $450,000 sale price.
-- Existing Ken payments and opening balance remain intact; they continue to
-- subtract from this target in the CRM payoff summary.
insert into public.crm_settings (key, value)
values ('payoff_target', 450000)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
