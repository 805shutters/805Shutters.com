-- Run in the 805 Supabase SQL editor after applying:
--   1. supabase/migrations/20260624093000_port_sales_quote_builder_to_805.sql
--   2. outputs/mts-quote-migration/805-quote-data.sql

select 'sales_quotes' as table_name, count(*)::int as row_count from public.sales_quotes
union all select 'sales_quote_line_items', count(*)::int from public.sales_quote_line_items
union all select 'sales_quote_designs', count(*)::int from public.sales_quote_designs
union all select 'sales_quote_media', count(*)::int from public.sales_quote_media
union all select 'sales_805_appointments', count(*)::int from public.sales_805_appointments
union all select 'quote_order_agent_queue', count(*)::int from public.quote_order_agent_queue
order by table_name;

select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'sales_quotes',
    'sales_quote_line_items',
    'sales_quote_designs',
    'sales_quote_media',
    'sales_805_appointments',
    'quote_order_agent_queue'
  )
order by tablename, policyname;

-- Simulate the active 805 CRM user for RLS/RPC checks.
begin;
select set_config('request.jwt.claim.sub', '8f492bc4-c9c0-4328-8e94-e7cab93c8367', true);
set local role authenticated;

select public.next_quote_number('805') as next_quote_number;

with next_number as (
  select public.next_quote_number('805') as quote_number
),
created as (
  insert into public.sales_quotes (
    quote_number,
    account_id,
    customer_name,
    customer_email,
    customer_phone,
    customer_address,
    installer_notes,
    created_by
  )
  select
    quote_number,
    '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid,
    '805 Migration Test',
    'test@example.com',
    '805-000-0000',
    'Test address',
    'Temporary migration verification row. Rolled back by this script.',
    '8f492bc4-c9c0-4328-8e94-e7cab93c8367'::uuid
  from next_number
  returning id, quote_number
)
select * from created;

rollback;
