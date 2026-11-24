-- pgcrypto lives in extensions on dedicated805. Preserve the allocator
-- search_path, authorization, collision handling, ID format and existing grants.
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
      body := body || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
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

