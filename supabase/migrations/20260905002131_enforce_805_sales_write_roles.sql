-- Verified against evuxqsaucmvgyuvjpqlo on 2026-09-05: existing ALL policies
-- include the read-only account. Preserve their exact scope and SELECT behavior;
-- restrictive write policies also constrain any overlapping permissive policy.
create or replace function public.is_805_crm_writer()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.crm_profiles
    where id = auth.uid() and active
      and lower(email) in ('805shutters@gmail.com', 'jessica@805shutters.com')
  );
$$;
revoke all on function public.is_805_crm_writer() from public, anon;
grant execute on function public.is_805_crm_writer() to authenticated, service_role;

do $$
declare target text;
begin
  foreach target in array array['sales_quotes','sales_quote_line_items','sales_quote_designs','sales_quote_media','sales_805_appointments','quote_order_agent_queue'] loop
    execute format('drop policy if exists "805 writers insert" on public.%I', target);
    execute format('create policy "805 writers insert" on public.%I as restrictive for insert to authenticated with check ((select public.is_805_crm_writer()))', target);
    execute format('drop policy if exists "805 writers update" on public.%I', target);
    execute format('create policy "805 writers update" on public.%I as restrictive for update to authenticated using ((select public.is_805_crm_writer())) with check ((select public.is_805_crm_writer()))', target);
    execute format('drop policy if exists "805 writers delete" on public.%I', target);
    execute format('create policy "805 writers delete" on public.%I as restrictive for delete to authenticated using ((select public.is_805_crm_writer()))', target);
  end loop;
end;
$$;
