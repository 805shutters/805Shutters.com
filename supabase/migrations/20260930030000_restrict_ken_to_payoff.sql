-- Ken reads payoff through the server-only API; no direct quote access.
create or replace function public.is_805_crm_user()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.crm_profiles profile
    where profile.id = auth.uid() and profile.active = true
      and lower(profile.email) in ('805shutters@gmail.com', 'jessica@805shutters.com')
  );
$$;
revoke all on function public.is_805_crm_user() from anon;
grant execute on function public.is_805_crm_user() to authenticated, service_role;
