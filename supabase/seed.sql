insert into public.leads (
  source,
  status,
  name,
  phone,
  email,
  city,
  interest,
  notes,
  page_path,
  meta
) values (
  'seed',
  'new',
  'Preview Lead',
  '805-806-9344',
  '805shutters@gmail.com',
  'Camarillo',
  'consultation',
  'Seed row for local Supabase verification only.',
  '/free-window-treatment-consultation/',
  '{"environment":"local"}'::jsonb
) on conflict do nothing;
