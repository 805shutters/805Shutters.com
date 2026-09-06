-- Only for the isolated 805-quote-hub-test-db container.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table public.crm_jobs(id uuid primary key,customer_name text,email text);
create table public.crm_quotes(
 id uuid primary key default gen_random_uuid(),job_id uuid references crm_jobs(id),
 quote_number text,status text,quote_total numeric,materials_cost numeric,labor_cost numeric,discount numeric,tax numeric,deposit_required numeric,balance_due numeric,
 created_at timestamptz default now(),updated_at timestamptz default now(),external_source text,external_id text,
 customer_name text,customer_email text,customer_phone text,customer_address text,customer_signature text,customer_printed_name text,
 share_token text,quote_group_id uuid,quote_label text,meta jsonb default '{}',
 sent_at timestamptz,signed_at timestamptz,approved_at timestamptz,sold_at timestamptz,ordered_at timestamptz,received_at timestamptz,installed_at timestamptz,archived_at timestamptz,
 unique(external_source,external_id),unique(quote_group_id,quote_label)
);
create table public.crm_quote_line_items(id uuid primary key default gen_random_uuid(),quote_id uuid references crm_quotes(id),selected_design_id uuid,room text,quantity int,sort_order int,discount_percent numeric,width_in numeric,height_in numeric,notes text,created_at timestamptz default now(),updated_at timestamptz default now(),external_source text,external_id text);
create table public.crm_quote_designs(id uuid primary key default gen_random_uuid(),line_item_id uuid references crm_quote_line_items(id),label text,sort_order int,product_id text,unit_price numeric,wholesale_unit_price numeric,price_breakdown jsonb,price_status text,priced_at timestamptz,surcharges jsonb,details jsonb,created_at timestamptz default now(),updated_at timestamptz default now(),external_source text,external_id text);
alter table crm_quote_line_items add constraint crm_quote_line_items_selected_design_id_fkey foreign key(selected_design_id) references crm_quote_designs(id);
grant usage on schema public to anon,authenticated,service_role;
grant all on all tables in schema public to service_role;
