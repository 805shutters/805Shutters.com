create table if not exists public.crm_commercial_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_name text not null,
  account_type text not null default 'other',
  status text not null default 'new',
  priority text not null default 'normal',
  assigned_to text not null default 'Jessica',
  contact_name text,
  contact_title text,
  email text,
  phone text,
  website text,
  address text,
  city text,
  state text not null default 'CA',
  postal_code text,
  license_number text,
  license_classifications text[] not null default '{}'::text[],
  license_status text not null default 'not_applicable',
  license_verified_at timestamptz,
  source_type text not null default 'manual',
  source_name text,
  source_url text,
  source_checked_at timestamptz,
  external_id text,
  next_action text,
  next_action_due date,
  last_contacted_at timestamptz,
  last_replied_at timestamptz,
  estimated_value numeric(14, 2) not null default 0,
  notes text,
  tags text[] not null default '{}'::text[],
  do_not_email boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  constraint crm_commercial_accounts_type_check check (
    account_type in (
      'general_contractor', 'developer', 'architect_designer', 'school_district',
      'property_management', 'hospitality', 'healthcare', 'government', 'facilities',
      'window_covering_partner', 'commercial_real_estate', 'other'
    )
  ),
  constraint crm_commercial_accounts_status_check check (
    status in (
      'new', 'researching', 'ready', 'contacted', 'replied', 'meeting',
      'bid_invited', 'bidding', 'won', 'nurture', 'not_fit', 'do_not_contact'
    )
  ),
  constraint crm_commercial_accounts_priority_check check (
    priority in ('low', 'normal', 'high', 'strategic')
  ),
  constraint crm_commercial_accounts_license_status_check check (
    license_status in ('not_applicable', 'unverified', 'active', 'inactive', 'expired', 'suspended')
  )
);

create table if not exists public.crm_commercial_activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.crm_commercial_accounts(id) on delete cascade,
  activity_type text not null,
  actor_email text,
  subject text,
  body_preview text,
  external_message_id text,
  gmail_message_id text,
  gmail_thread_id text,
  occurred_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  constraint crm_commercial_activities_type_check check (
    activity_type in (
      'created', 'research', 'note', 'call', 'email_sent', 'reply_received',
      'meeting', 'bid_invite', 'bid_submitted', 'status_change', 'opt_out'
    )
  )
);

create index if not exists crm_commercial_accounts_status_due_idx
on public.crm_commercial_accounts (status, next_action_due);

create index if not exists crm_commercial_accounts_type_city_idx
on public.crm_commercial_accounts (account_type, city);

create index if not exists crm_commercial_accounts_email_lower_idx
on public.crm_commercial_accounts (lower(email))
where email is not null;

create unique index if not exists crm_commercial_accounts_source_external_uidx
on public.crm_commercial_accounts (source_name, external_id)
where source_name is not null and external_id is not null;

create index if not exists crm_commercial_activities_account_time_idx
on public.crm_commercial_activities (account_id, occurred_at desc);

create unique index if not exists crm_commercial_activities_gmail_message_uidx
on public.crm_commercial_activities (gmail_message_id)
where gmail_message_id is not null;

drop trigger if exists crm_commercial_accounts_set_updated_at on public.crm_commercial_accounts;
create trigger crm_commercial_accounts_set_updated_at
before update on public.crm_commercial_accounts
for each row
execute function public.set_updated_at();

alter table public.crm_commercial_accounts enable row level security;
alter table public.crm_commercial_activities enable row level security;

drop policy if exists "service role can manage commercial accounts" on public.crm_commercial_accounts;
create policy "service role can manage commercial accounts"
on public.crm_commercial_accounts
for all
to service_role
using (true)
with check (true);

drop policy if exists "service role can manage commercial activities" on public.crm_commercial_activities;
create policy "service role can manage commercial activities"
on public.crm_commercial_activities
for all
to service_role
using (true)
with check (true);

insert into public.crm_commercial_accounts (
  company_name, account_type, status, priority, contact_name, contact_title,
  email, phone, website, address, city, postal_code, license_number,
  license_classifications, license_status, source_type, source_name, source_url,
  source_checked_at, external_id, next_action, next_action_due, tags, notes
)
values
  (
    'Ventura County Office of Education', 'school_district', 'ready', 'strategic',
    'Misty Key', 'Deputy Superintendent, Fiscal and Administrative Services',
    'mkey@vcoe.org', '805-383-1905', 'https://www.vcoe.org/', '5189 Verdugo Way',
    'Camarillo', '93012', null, '{}', 'not_applicable', 'public_directory',
    'California School Directory', 'https://www.cde.ca.gov/schooldirectory/details?cdscode=56105610000000',
    '2026-07-09T12:00:00-07:00', 'cde-56105610000000', 'Ask how to register for facilities and classroom shade bids', current_date + 2,
    array['schools', 'facilities', 'public-bids'], 'County-level relationship covering 19 districts and 226 schools.'
  ),
  (
    'Ventura Unified School District Facilities Services', 'school_district', 'ready', 'strategic',
    'Marina Verdian', 'Director, Facilities Services', null, '805-289-7981',
    'https://www.venturausd.org/services/facilities', '359 South Victoria Ave', 'Ventura', '93003',
    null, '{}', 'not_applicable', 'public_directory', 'Ventura USD Facilities',
    'https://www.venturausd.org/services/facilities', '2026-07-09T12:00:00-07:00', 'vusd-facilities',
    'Call facilities and request vendor/bid-list process', current_date + 1,
    array['schools', 'facilities', 'modernization'], 'Facilities planning handles modernization, deferred maintenance, and capital outlay.'
  ),
  (
    'Conejo Valley Unified School District Maintenance & Operations', 'school_district', 'ready', 'strategic',
    'Dr. Victor P. Hayek', 'Deputy Superintendent, Business Services', null, '805-498-4557',
    'https://www.conejousd.org/departments-services/maintenance-and-operations', '667 Rancho Conejo Blvd',
    'Newbury Park', '91320', null, '{}', 'not_applicable', 'public_directory', 'CVUSD Maintenance & Operations',
    'https://www.conejousd.org/departments-services/maintenance-and-operations', '2026-07-09T12:00:00-07:00', 'cvusd-maintenance',
    'Ask purchasing how to become an approved window-covering vendor', current_date + 3,
    array['schools', 'facilities', '33-sites'], 'Maintains more than 33 sites and over two million square feet of buildings.'
  ),
  (
    'Simi Valley Unified School District Business & Facilities', 'school_district', 'ready', 'strategic',
    'Pedro Avila', 'Director, Facilities & Planning', 'pedro.avila@simivalleyusd.org', '805-306-4500 ext. 4401',
    'https://www.simivalleyusd.org/district/business-facilities', '101 West Cochran Street', 'Simi Valley', '93065',
    null, '{}', 'not_applicable', 'public_directory', 'SVUSD Business & Facilities',
    'https://www.simivalleyusd.org/district/business-facilities', '2026-07-09T12:00:00-07:00', 'svusd-facilities',
    'Introduce 805 Commercial and ask about Measure X vendor opportunities', current_date + 4,
    array['schools', 'facilities', 'measure-x', 'bids'], 'Facilities page identifies the director and current bid/project responsibilities.'
  ),
  (
    'Oxnard School District Maintenance & Operations', 'school_district', 'ready', 'strategic',
    'Mark Bennett', 'Director of Facilities', 'mbennett@oxnardsd.org', '805-385-1514',
    'https://www.oxnardsd.org/departments/maintenance-operations-center/welcome', '1055 South C Street', 'Oxnard', '93030',
    null, '{}', 'not_applicable', 'public_directory', 'Oxnard SD Maintenance & Operations',
    'https://www.oxnardsd.org/departments/maintenance-operations-center/staff', '2026-07-09T12:00:00-07:00', 'oxnardsd-facilities',
    'Email facilities introduction and request approved-vendor steps', current_date + 2,
    array['schools', 'facilities', '21-sites'], 'Department serves 21 school sites and five administrative locations.'
  ),
  (
    'Oxnard Union High School District Maintenance & Operations', 'school_district', 'ready', 'strategic',
    'Brittany Villasenor', 'Director of Facilities, Maintenance, and Operations',
    'brittany.villasenor@oxnardunion.org', '805-790-4646',
    'https://www.oxnardunion.org/departments/business-services/maintenance-operations', '1800 Solar Dr', 'Oxnard', '93030',
    null, '{}', 'not_applicable', 'public_directory', 'OUHSD Maintenance & Operations',
    'https://www.oxnardunion.org/departments/business-services/maintenance-operations', '2026-07-09T12:00:00-07:00', 'ouhsd-facilities',
    'Ask about Measure A/Measure E bid notifications and vendor registration', current_date + 1,
    array['schools', 'facilities', 'measure-a', 'measure-e'], 'Department manages more than 1.4 million square feet of building space.'
  ),
  (
    'Pleasant Valley School District Facilities, Maintenance & Operations', 'school_district', 'researching', 'high',
    null, 'Facilities, Maintenance & Operations', null, '805-389-2100',
    'https://www.pleasantvalleysd.org/departments/facilities-maintenance-operations', '600 Temple Ave', 'Camarillo', '93010',
    null, '{}', 'not_applicable', 'public_directory', 'PVSD Facilities',
    'https://www.pleasantvalleysd.org/departments/facilities-maintenance-operations', '2026-07-09T12:00:00-07:00', 'pvsd-facilities',
    'Call and identify the facilities purchasing decision-maker', current_date + 5,
    array['schools', 'facilities'], 'Official facilities department contact; named decision-maker still needs confirmation.'
  ),
  (
    'Moorpark Unified School District Maintenance & Operations', 'school_district', 'ready', 'high',
    'Terri Allison', 'Director of Maintenance, Operations & Transportation', null, '805-378-6300 ext. 1431',
    'https://www.mrpk.org/districtoffice/business-services/maintenance-operations-transportation', '5297 Maureen Lane', 'Moorpark', '93021',
    null, '{}', 'not_applicable', 'public_directory', 'MUSD Maintenance & Operations',
    'https://www.mrpk.org/districtoffice/business-services/maintenance-operations-transportation', '2026-07-09T12:00:00-07:00', 'musd-facilities',
    'Call director and ask about CUPCCAA/vendor registration', current_date + 5,
    array['schools', 'facilities', 'cupccaa'], 'Official page includes a notice inviting interested CUPCCAA contractors.'
  ),
  (
    'County of Ventura Procurement Services', 'government', 'researching', 'strategic',
    null, 'Procurement / Vendor Registration', null, null, 'https://ventura.bonfirehub.com/', null, 'Ventura', null,
    null, '{}', 'not_applicable', 'public_directory', 'County of Ventura Vendor Guide',
    'https://www.ventura.org/business-services/become-a-vendor/', '2026-07-09T12:00:00-07:00', 'ventura-county-procurement',
    'Register 805 Shutters in Bonfire and choose window-covering commodity codes', current_date + 1,
    array['government', 'vendor-registration', 'bonfire'], 'County vendor registration and solicitation portal.'
  ),
  (
    'Bodagger Builders', 'general_contractor', 'researching', 'high', null, 'Estimating / Project Management',
    null, '805-647-0349', 'https://bodaggerbuilders.com/', '1686 Lirio Ave', 'Ventura', '93004', '905498',
    array['B'], 'unverified', 'public_directory', 'Company website', 'https://bodaggerbuilders.com/',
    '2026-07-09T12:00:00-07:00', 'bodagger-builders', 'Call and request the estimator responsible for Division 12', current_date + 2,
    array['gc', 'commercial-renovation', 'ventura'], 'Company advertises commercial renovations; verify current CSLB status before relying on license information.'
  ),
  (
    'Villierme Construction & Design', 'general_contractor', 'ready', 'high', 'Frank Villierme', 'General Contractor',
    'frank@villierme.com', '805-798-2099', 'https://villierme.com/', null, 'Ojai', '93023', '593498',
    array['B'], 'unverified', 'public_directory', 'Company website', 'https://villierme.com/',
    '2026-07-09T12:00:00-07:00', 'villierme-construction', 'Send subcontractor introduction and ask about upcoming commercial scopes', current_date + 3,
    array['gc', 'design-build', 'ojai'], 'Company states residential and commercial construction; verify license in CSLB before qualification.'
  ),
  (
    'VenCo Concrete & Pavers', 'general_contractor', 'researching', 'normal', null, 'General Contractor',
    null, '805-890-6189', 'https://www.venturacountyconcrete.com/', null, 'Ventura', null, '781821',
    array['B'], 'unverified', 'public_directory', 'Company website', 'https://www.venturacountyconcrete.com/contact/',
    '2026-07-09T12:00:00-07:00', 'venco-concrete', 'Call to explore referral and subcontractor exchange', current_date + 7,
    array['gc', 'referral-partner'], 'Potential trade/referral partner; verify current CSLB record.'
  ),
  (
    'Simpson Architecture', 'architect_designer', 'ready', 'high', 'Taylor Simpson', 'Principal Architect',
    'taylor@simpsonarchitecture.com', '805-218-2613', 'https://www.simpsonarchitecture.com/', null, 'Ventura', null, 'C38859',
    array['California Architect'], 'unverified', 'public_directory', 'Firm website', 'https://www.simpsonarchitecture.com/',
    '2026-07-09T12:00:00-07:00', 'simpson-architecture', 'Offer product binder and Division 12 specification support', current_date + 4,
    array['architect', 'commercial', 'healthcare', 'hospitality'], 'Firm presents commercial, healthcare, and hospitality project experience.'
  ),
  (
    'Mark Shellnut Architect, Inc.', 'architect_designer', 'ready', 'normal', 'Mark Shellnut', 'Architect',
    'shellnut@sbcglobal.net', '805-649-2056', 'https://www.markshellnutarchitect.com/', null, 'Oak View', '93022', 'C22970',
    array['California Architect'], 'unverified', 'public_directory', 'Firm website', 'https://www.markshellnutarchitect.com/',
    '2026-07-09T12:00:00-07:00', 'mark-shellnut-architect', 'Introduce commercial shade specification support', current_date + 7,
    array['architect', 'commercial'], 'Firm lists commercial-building work; verify architect license if needed.'
  ),
  (
    'GP Architecture, Inc.', 'architect_designer', 'researching', 'high', 'Gonzalo J. Pedroso', 'Founder / Architect',
    null, null, 'https://gparchitecture.com/', null, 'Ventura County', null, null,
    array['California Architect'], 'unverified', 'public_directory', 'Firm website', 'https://gparchitecture.com/about',
    '2026-07-09T12:00:00-07:00', 'gp-architecture', 'Find the commercial project specification contact', current_date + 6,
    array['architect', 'commercial', 'medical', 'multifamily', 'industrial'], 'Commercial-focused firm; contact details need verification from its current contact page.'
  ),
  (
    'PCI Commercial Realty Group', 'commercial_real_estate', 'ready', 'high', 'Paul Forbat', 'President / Broker',
    'Paul@PCIRealty.com', '805-328-6342', 'https://www.pcirealty.com/', null, 'Thousand Oaks', null, null,
    array['CA DRE 01097663'], 'unverified', 'public_directory', 'Company website', 'https://www.pcirealty.com/team',
    '2026-07-09T12:00:00-07:00', 'pci-commercial-realty', 'Ask about tenant-improvement and managed-property shade programs', current_date + 3,
    array['commercial-real-estate', 'property-management', 'tenant-improvement'], 'Ventura County leasing and property-management relationship target.'
  ),
  (
    'Empire Management Company', 'property_management', 'researching', 'high', null, 'Commercial Property Management',
    null, '805-641-9905', 'https://www.empirepmc.com/', '2355-A Portola Rd', 'Ventura', '93003', null,
    array['CA DRE 02025645', 'CA DRE 01837367'], 'unverified', 'public_directory', 'Company website', 'https://www.empirepmc.com/',
    '2026-07-09T12:00:00-07:00', 'empire-management', 'Offer a portfolio-wide shade audit and replacement program', current_date + 2,
    array['property-management', 'commercial', 'industrial'], 'Company states it manages residential, commercial, and industrial real estate.'
  ),
  (
    'Ventura Commercial Property Management', 'property_management', 'ready', 'normal', null, 'Commercial Property Management',
    'info@venturacommercialpropertymanagement.com', '800-540-9525', 'https://venturacommercialpropertymanagement.com/commercial/',
    '58 N Ash St', 'Ventura', '93001', null, '{}', 'not_applicable', 'public_directory', 'Company website',
    'https://venturacommercialpropertymanagement.com/commercial/', '2026-07-09T12:00:00-07:00', 'ventura-commercial-property-management',
    'Offer local property shade audit and phased replacement pricing', current_date + 4,
    array['property-management', 'commercial'], 'Commercial management target with publicly listed business contact information.'
  )
on conflict (source_name, external_id) where source_name is not null and external_id is not null do nothing;
