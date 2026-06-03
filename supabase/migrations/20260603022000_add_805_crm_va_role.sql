alter table public.crm_profiles drop constraint if exists crm_profiles_role_check;

alter table public.crm_profiles
  add constraint crm_profiles_role_check check (
    role in ('owner', 'admin', 'sales', 'bookkeeping', 'va')
  );
