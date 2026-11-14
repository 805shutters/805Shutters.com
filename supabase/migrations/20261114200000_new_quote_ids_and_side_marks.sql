-- New 805 quote IDs and side marks.
-- Additive only: nullable columns, a new registry, and replacement allocators.
-- Does not update, renumber, or backfill existing quote rows.
-- Does not add a unique constraint on crm_quotes.quote_number (production has duplicates).
-- quote_label is left unchanged. New CRM inserts omit it so it stays null.
--
-- Keep the alphabet, length, retry count, and lock name aligned with
-- src/lib/crm/quote-id.ts (QUOTE_ID_CONFIG).

alter table public.crm_quotes
  add column if not exists customer_name text,
  add column if not exists side_mark text,
  add column if not exists side_mark_overridden boolean;

alter table public.sales_quotes
  add column if not exists side_mark text,
  add column if not exists side_mark_overridden boolean;

comment on column public.crm_quotes.customer_name is
  'Customer name stored on the quote. Null on quotes created before this column.';
comment on column public.crm_quotes.side_mark is
  'Last name plus the full quote ID. Null until a person or a new quote sets it.';
comment on column public.crm_quotes.side_mark_overridden is
  'True when a person typed the side mark. Automatic updates must not replace it.';
comment on column public.sales_quotes.side_mark is
  'Last name plus the full quote ID. Null until a person or a new quote sets it.';
comment on column public.sales_quotes.side_mark_overridden is
  'True when a person typed the side mark. Automatic updates must not replace it.';

create table if not exists public.crm_issued_quote_ids (
  quote_number text primary key,
  issued_at timestamptz not null default now(),
  source text
);

comment on table public.crm_issued_quote_ids is
  'Every issued new-format 805 quote ID. Rows stay after a quote is deleted so the ID is never reused.';

alter table public.crm_issued_quote_ids enable row level security;
revoke all on table public.crm_issued_quote_ids from public, anon, authenticated;
grant select, insert on table public.crm_issued_quote_ids to service_role;

create or replace function public.quote_customer_last_name(p_name text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  cleaned text;
  left_part text;
  right_part text;
  tokens text[];
  surname text[];
  token text;
  bare text;
  index integer;
  explicit_last boolean := false;
  suffixes text[] := array['jr','sr','ii','iii','iv','v','vi','esq','esquire','junior','senior','2nd','3rd','4th'];
  particles text[] := array['de','da','del','della','di','van','von','der','den','la','le','st','ste','ten','ter','du','dos','das','bin','ibn','al','el'];
  companies text[] := array['llc','inc','incorporated','corp','corporation','co','company','ltd','limited','llp','pllc','pc','trust','associates','holdings','group','enterprises','services','solutions'];
begin
  cleaned := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if cleaned = '' then return null; end if;
  if position(',' in cleaned) > 0 then
    left_part := btrim(split_part(cleaned, ',', 1));
    right_part := btrim(substr(cleaned, position(',' in cleaned) + 1));
    tokens := regexp_split_to_array(right_part, ' ');
    while coalesce(array_length(tokens, 1), 0) > 0
      and regexp_replace(lower(tokens[array_length(tokens, 1)]), '[^a-z0-9]', '', 'g') = any (suffixes)
    loop
      tokens := tokens[1:array_length(tokens, 1) - 1];
    end loop;
    if coalesce(array_length(tokens, 1), 0) = 0 then
      cleaned := left_part;
    else
      cleaned := left_part;
      explicit_last := true;
    end if;
  end if;
  if cleaned = '' or position('&' in cleaned) > 0 then return null; end if;
  tokens := regexp_split_to_array(cleaned, ' ');
  while coalesce(array_length(tokens, 1), 0) > 1
    and regexp_replace(lower(tokens[array_length(tokens, 1)]), '[^a-z0-9]', '', 'g') = any (suffixes)
  loop
    tokens := tokens[1:array_length(tokens, 1) - 1];
  end loop;
  if coalesce(array_length(tokens, 1), 0) = 0 then return null; end if;
  foreach token in array tokens loop
    bare := regexp_replace(lower(token), '[^a-z0-9]', '', 'g');
    if bare = any (companies) then return null; end if;
  end loop;
  if explicit_last then
    token := array_to_string(tokens, ' ');
  else
    if array_length(tokens, 1) < 2 then return null; end if;
    surname := array[tokens[array_length(tokens, 1)]];
    index := array_length(tokens, 1) - 1;
    while index >= 2 loop
      bare := regexp_replace(lower(tokens[index]), '[^a-z0-9]', '', 'g');
      exit when not (bare = any (particles));
      surname := array[tokens[index]] || surname;
      index := index - 1;
    end loop;
    token := array_to_string(surname, ' ');
  end if;
  if token !~ '[A-Za-z]' or token ~ '^[A-Za-z]\.?$' then return null; end if;
  return token;
end;
$$;

create or replace function public.quote_side_mark(p_customer_name text, p_quote_number text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when public.quote_customer_last_name(p_customer_name) is null then null
    when nullif(btrim(p_quote_number), '') is null then null
    else public.quote_customer_last_name(p_customer_name) || ' ' || upper(btrim(p_quote_number))
  end;
$$;

create or replace function public.allocate_805_quote_id(p_source text default 'quote')
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ123456789';
  max_attempts constant integer := 64;
  attempt integer;
  body text;
  candidate text;
  draw integer;
begin
  if auth.role() is distinct from 'service_role' and not public.is_805_crm_user() then
    raise exception '805 CRM authentication is required.' using errcode = '42501';
  end if;
  if p_source is not null and length(p_source) > 80 then
    raise exception 'Quote ID source is too long.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('quote-v2-number-allocation:805', 0));

  for attempt in 1..max_attempts loop
    body := '';
    for draw in 1..3 loop
      -- 256 divides evenly by 32, so one random byte is an unbiased alphabet index.
      body := body || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
    end loop;
    candidate := '805-' || body;
    if exists (
      select 1
      from (
        select quote_number from public.sales_quotes where quote_number is not null
        union all
        select quote_number from public.crm_quotes where quote_number is not null
        union all
        select quote_number from public.crm_issued_quote_ids
      ) issued
      where issued.quote_number = candidate
         or (
           issued.quote_number ~ '^805-'
           and issued.quote_number !~ '^805-[ABCDEFGHJKMNPQRSTUVWXYZ123456789]{3}$'
           and left(split_part(upper(issued.quote_number), '-', 2), 3) = body
         )
    ) then
      continue;
    end if;
    begin
      insert into public.crm_issued_quote_ids (quote_number, source)
      values (candidate, nullif(btrim(p_source), ''));
      return candidate;
    exception
      when unique_violation then
        continue;
    end;
  end loop;

  raise exception
    'No unused 805 quote ID could be issued after % attempts. The 32-character alphabet has 32768 IDs. Refusing to roll into a 4-digit number.',
    max_attempts
    using errcode = '55000';
end;
$$;

create or replace function public.claim_805_quote_id(p_quote_number text, p_source text default 'quote')
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized text := upper(regexp_replace(btrim(coalesce(p_quote_number, '')), '\s+', '', 'g'));
begin
  if auth.role() is distinct from 'service_role' and not public.is_805_crm_user() then
    raise exception '805 CRM authentication is required.' using errcode = '42501';
  end if;
  if normalized !~ '^805-[ABCDEFGHJKMNPQRSTUVWXYZ123456789]{3}$' then
    raise exception 'Only a new-format 805 quote ID can be claimed.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('quote-v2-number-allocation:805', 0));
  if exists (
    select 1 from public.sales_quotes where quote_number = normalized
    union all
    select 1 from public.crm_quotes where quote_number = normalized
    union all
    select 1 from public.crm_issued_quote_ids where quote_number = normalized
  ) then
    raise exception 'Quote ID % is already issued.', normalized using errcode = '23505';
  end if;
  insert into public.crm_issued_quote_ids (quote_number, source)
  values (normalized, nullif(btrim(p_source), ''));
  return normalized;
end;
$$;

revoke all on function public.quote_customer_last_name(text) from public, anon, authenticated;
revoke all on function public.quote_side_mark(text, text) from public, anon, authenticated;
revoke all on function public.allocate_805_quote_id(text) from public, anon;
revoke all on function public.claim_805_quote_id(text, text) from public, anon;
grant execute on function public.quote_customer_last_name(text) to service_role;
grant execute on function public.quote_side_mark(text, text) to service_role;
grant execute on function public.allocate_805_quote_id(text) to authenticated, service_role;
grant execute on function public.claim_805_quote_id(text, text) to authenticated, service_role;

create or replace function public.next_quote_number(account_prefix text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if account_prefix <> '805' then
    raise exception 'Only the 805 quote prefix is available in this CRM.';
  end if;
  if not public.is_805_crm_user() then
    raise exception '805 CRM authentication is required.';
  end if;
  return public.allocate_805_quote_id('next_quote_number');
end;
$$;

revoke all on function public.next_quote_number(text) from anon;
grant execute on function public.next_quote_number(text) to authenticated, service_role;

do $$
declare
  definition text;
  allocation text := $old$
  -- The legacy browser number allocator relies on auth.uid(), which is
  -- unavailable to the service-role client. Allocate the number here while
  -- holding one dedicated transaction lock so concurrent drafts cannot collide.
  perform pg_advisory_xact_lock(
    hashtextextended('quote-v2-number-allocation:805', 0)
  );
  select coalesce(
    max(
      nullif(
        regexp_replace(split_part(quotes.quote_number, '-', 2), '[^0-9]', '', 'g'),
        ''
      )::integer
    ),
    0
  ) + 1
    into v_next_number
    from public.sales_quotes quotes
   where quotes.account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
     and quotes.quote_number like '805-%';
  v_quote_number := '805-' || lpad(v_next_number::text, 4, '0');$old$;
begin
  select pg_get_functiondef('public.create_quote_v2_draft(text,uuid,jsonb)'::regprocedure)
    into definition;
  if position(allocation in definition) = 0 then
    raise exception 'create_quote_v2_draft does not contain the 4-digit allocator.';
  end if;
  definition := replace(definition, allocation, $new$
  -- Random 805-XXX id. allocate_805_quote_id holds quote-v2-number-allocation:805.
  v_quote_number := public.allocate_805_quote_id('sales_quote_v2');$new$);
  definition := replace(
    definition,
    $old$    id,
    quote_number,
    account_id,$old$,
    $new$    id,
    quote_number,
    side_mark,
    side_mark_overridden,
    account_id,$new$
  );
  definition := replace(
    definition,
    $old$    v_quote_id,
    v_quote_number,
    '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid,$old$,
    $new$    v_quote_id,
    v_quote_number,
    case
      when nullif(btrim(p_quote_patch ->> 'sideMark'), '') is not null
        then btrim(p_quote_patch ->> 'sideMark')
      else public.quote_side_mark(v_customer_name, v_quote_number)
    end,
    nullif(btrim(p_quote_patch ->> 'sideMark'), '') is not null,
    '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid,$new$
  );
  if position('allocate_805_quote_id' in definition) = 0
     or position('side_mark' in definition) = 0 then
    raise exception 'create_quote_v2_draft was not switched to the new quote ID.';
  end if;
  execute definition;
end $$;

do $$
declare
  definition text;
  padded text := $old$  perform pg_advisory_xact_lock(hashtextextended('quote-v2-number-allocation:805',0));
  select coalesce(max(nullif(regexp_replace(split_part(quote_number,'-',2),'[^0-9]','','g'),'')::integer),0)+1
    into next_number from public.sales_quotes
    where account_id='72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid and quote_number like '805-%';
  revision_quote_number:='805-'||lpad(next_number::text,4,'0');$old$;
begin
  select pg_get_functiondef('public.create_sales_quote_revision(uuid,uuid,uuid,bigint,text,uuid,text,numeric)'::regprocedure)
    into definition;
  if position(padded in definition) = 0 and position('public.next_quote_number(''805'')' in definition) = 0 then
    raise exception 'create_sales_quote_revision does not contain the 4-digit allocator.';
  end if;
  definition := replace(
    definition,
    padded,
    '  revision_quote_number := public.allocate_805_quote_id(''sales_quote_revision'');'
  );
  definition := replace(
    definition,
    'public.next_quote_number(''805'')',
    'public.allocate_805_quote_id(''sales_quote_revision'')'
  );
  definition := replace(
    definition,
    'insert into public.sales_quotes(id,quote_number,account_id,status,customer_name,',
    'insert into public.sales_quotes(id,quote_number,side_mark,side_mark_overridden,account_id,status,customer_name,'
  );
  if position('values(new_quote_id,revision_quote_number,source.account_id,''draft'',source.customer_name,' in definition) = 0 then
    raise exception 'create_sales_quote_revision insert does not use revision_quote_number.';
  end if;
  definition := replace(
    definition,
    'values(new_quote_id,revision_quote_number,source.account_id,''draft'',source.customer_name,',
    'values(new_quote_id,revision_quote_number,public.quote_side_mark(source.customer_name,revision_quote_number),false,source.account_id,''draft'',source.customer_name,'
  );
  if position('allocate_805_quote_id' in definition) = 0
     or position('lpad(next_number' in definition) > 0 then
    raise exception 'create_sales_quote_revision was not switched to the new quote ID.';
  end if;
  execute definition;
end $$;

do $$
declare
  definition text;
  old_name text := $old$set customer_name = case
                 when v_patch ? 'customerName'
                   then btrim(v_patch ->> 'customerName')
                 else customer_name
               end,$old$;
  new_name text := $new$set customer_name = case
                 when v_patch ? 'customerName'
                   then btrim(v_patch ->> 'customerName')
                 else customer_name
               end,
               side_mark = case
                 when v_patch ? 'sideMark' then nullif(btrim(v_patch ->> 'sideMark'), '')
                 when coalesce(side_mark_overridden, false) then side_mark
                 when status in ('sold', 'ordered', 'received', 'installed') or signed_at is not null then side_mark
                 when v_patch ? 'customerName'
                   then public.quote_side_mark(btrim(v_patch ->> 'customerName'), quote_number)
                 else side_mark
               end,
               side_mark_overridden = case
                 when v_patch ? 'sideMark' and nullif(btrim(v_patch ->> 'sideMark'), '') is not null then true
                 when v_patch ? 'sideMark' then false
                 else side_mark_overridden
               end,$new$;
begin
  select pg_get_functiondef('public.mutate_quote_v2_structure(uuid,bigint,text,uuid,jsonb)'::regprocedure)
    into definition;
  if position(old_name in definition) = 0 then
    raise exception 'Quote V2 customer updates do not contain the customer name assignment.';
  end if;
  definition := replace(definition, old_name, new_name);
  execute definition;
end $$;
