-- Quote builder: line items + designs (pick-one alternatives).
--
-- Replaces the dormant, too-thin crm_quote_items stub with a two-level model:
--   crm_quote_line_items  = one row per window/opening (measurements + quantity)
--   crm_quote_designs     = the A/B/C alternatives for that window
--
-- Design decisions (each one fixes a real bug in the legacy MTS quote builder):
--   * PICK-ONE: a window can offer several design alternatives, but only the one
--     referenced by line_item.selected_design_id is billed. The legacy system
--     SUMMED every variant, triple-billing the customer.
--   * SERVER-COMPUTED PRICE: unit_price + price_breakdown are written by the
--     pricing engine on the server; clients never set a price. price_status flags
--     designs whose size/fabric is invalid so they cannot silently contribute a
--     $0 / wrong total.
--   * STRUCTURED OPTIONS: surcharge / motorization selections are stored as
--     catalog ids in dedicated jsonb columns (prices always recomputed), instead
--     of being stuffed into an overloaded notes field.

-- ---------------------------------------------------------------------------
-- Line items (one per window / opening)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_quote_line_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  room text,
  -- Decimal inches (engine-native). Display fraction handled in the UI layer.
  width_in numeric(8, 3),
  height_in numeric(8, 3),
  quantity integer not null default 1,
  sort_order integer not null default 0,
  -- The customer's chosen alternative (FK added after crm_quote_designs exists).
  selected_design_id uuid,
  notes text,
  constraint crm_quote_line_items_quantity_check check (quantity >= 1)
);

create index if not exists crm_quote_line_items_quote_idx
  on public.crm_quote_line_items (quote_id, sort_order);

create trigger crm_quote_line_items_set_updated_at
before update on public.crm_quote_line_items
for each row
execute function public.set_updated_at();

alter table public.crm_quote_line_items enable row level security;

create policy "service role can manage crm quote line items"
on public.crm_quote_line_items
for all
to service_role
using (true)
with check (true);

-- ---------------------------------------------------------------------------
-- Designs (the A/B/C alternatives for a line item)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_quote_designs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  line_item_id uuid not null references public.crm_quote_line_items(id) on delete cascade,
  label text not null default 'A',
  sort_order integer not null default 0,
  -- Catalog references (resolved by the pricing engine).
  product_id text not null,
  program_id text,
  fabric text,
  -- Selected options as catalog ids; prices are NEVER stored here, only recomputed.
  surcharges jsonb not null default '[]'::jsonb,    -- [{ "id": "...", "units"?: n }]
  motorization jsonb not null default '[]'::jsonb,  -- [{ "groupId": "...", "optionId": "...", "units"?: n }]
  -- Engine output: the authoritative per-window price + full breakdown snapshot.
  unit_price numeric(12, 2) not null default 0,
  price_breakdown jsonb not null default '{}'::jsonb,
  price_status text not null default 'ok',
  priced_at timestamptz,
  notes text,
  constraint crm_quote_designs_label_uniq unique (line_item_id, label)
);

create index if not exists crm_quote_designs_line_item_idx
  on public.crm_quote_designs (line_item_id, sort_order);

create trigger crm_quote_designs_set_updated_at
before update on public.crm_quote_designs
for each row
execute function public.set_updated_at();

alter table public.crm_quote_designs enable row level security;

create policy "service role can manage crm quote designs"
on public.crm_quote_designs
for all
to service_role
using (true)
with check (true);

-- Now that designs exist, wire up the "pick-one" selected design pointer.
alter table public.crm_quote_line_items
  add constraint crm_quote_line_items_selected_design_fk
  foreign key (selected_design_id)
  references public.crm_quote_designs(id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- Retire the dormant stub table, but ONLY if it is empty (never destroy data).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crm_quote_items'
  ) and not exists (select 1 from public.crm_quote_items limit 1) then
    drop table public.crm_quote_items;
  end if;
end $$;
