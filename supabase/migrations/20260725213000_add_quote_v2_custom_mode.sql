create table if not exists public.sales_quote_v2_custom_overrides (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete restrict,
  line_item_id uuid not null references public.sales_quote_line_items(id) on delete restrict,
  design_id uuid not null references public.sales_quote_designs(id) on delete restrict,
  original_snapshot_id uuid not null references public.sales_quote_v2_price_snapshots(id) on delete restrict,
  override_snapshot_id uuid references public.sales_quote_v2_price_snapshots(id) on delete restrict,
  original_snapshot jsonb not null,
  override_input jsonb not null,
  override_financials jsonb not null,
  provenance_snapshot jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists sales_quote_v2_custom_overrides_quote_idx
  on public.sales_quote_v2_custom_overrides (quote_id, created_at desc);
alter table public.sales_quote_v2_custom_overrides enable row level security;
revoke all on public.sales_quote_v2_custom_overrides from anon, authenticated;
grant select on public.sales_quote_v2_custom_overrides to authenticated;
grant all on public.sales_quote_v2_custom_overrides to service_role;
create policy "805 CRM users read custom override history"
on public.sales_quote_v2_custom_overrides for select to authenticated
using (public.is_805_crm_user());
create policy "service role manages custom override history"
on public.sales_quote_v2_custom_overrides for all to service_role
using (true) with check (true);

create or replace function public.apply_quote_v2_custom_override(
  p_quote_id uuid, p_line_item_id uuid, p_design_id uuid,
  p_expected_revision bigint, p_idempotency_key text, p_actor_id uuid,
  p_line_patch jsonb, p_design_patch jsonb, p_retail_snapshot jsonb,
  p_internal_snapshot jsonb, p_provenance_snapshot jsonb,
  p_override_input jsonb, p_override_financials jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_quote public.sales_quotes%rowtype;
  v_design public.sales_quote_designs%rowtype;
  v_original public.sales_quote_v2_price_snapshots%rowtype;
  v_override_id uuid;
  v_snapshot_id uuid;
  v_revision bigint;
  v_unit numeric(12,2);
  v_total numeric(12,2);
  v_fingerprint text;
  v_existing_event public.sales_quote_v2_events%rowtype;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' or length(p_idempotency_key) > 200 then
    raise exception 'A non-empty idempotency key of at most 200 characters is required.';
  end if;
  select * into v_quote from public.sales_quotes where id=p_quote_id for update;
  if not found or not v_quote.quote_v2_backend then raise exception 'Custom Mode requires a Quote V2 draft.'; end if;
  if v_quote.status <> 'draft' then raise exception 'Custom Mode is available only on draft quotes.'; end if;
  select * into v_existing_event from public.sales_quote_v2_events
  where quote_id=p_quote_id and idempotency_key=btrim(p_idempotency_key);
  if found then
    if v_existing_event.event_type <> 'custom_override_applied'
      or v_existing_event.event_payload->>'lineItemId' is distinct from p_line_item_id::text
      or v_existing_event.event_payload->>'designId' is distinct from p_design_id::text
    then raise exception 'The Quote V2 idempotency key was already used for a different request.'; end if;
    return v_existing_event.event_payload;
  end if;
  if v_quote.quote_v2_revision <> p_expected_revision then raise exception 'Quote revision changed.'; end if;
  select * into v_design from public.sales_quote_designs where id=p_design_id and line_item_id=p_line_item_id;
  if not found or v_design.current_v2_snapshot_id is null then raise exception 'Price the standard V2 design before enabling Custom Mode.'; end if;
  select * into v_original from public.sales_quote_v2_price_snapshots where id=v_design.current_v2_snapshot_id;
  if v_original.catalog_version = 'custom-override-v1' then
    select * into v_original from public.sales_quote_v2_price_snapshots
    where id=(v_original.provenance_snapshot->>'originalSnapshotId')::uuid;
  end if;
  if not found or v_original.catalog_version = 'custom-override-v1' then
    raise exception 'The immutable standard V2 snapshot is unavailable.';
  end if;
  v_revision := p_expected_revision + 1;
  v_unit := (p_retail_snapshot#>>'{retail,unitPrice}')::numeric;
  v_total := (p_retail_snapshot#>>'{retail,total}')::numeric;
  v_fingerprint := p_provenance_snapshot->>'customFingerprint';

  insert into public.sales_quote_v2_custom_overrides(
    quote_id,line_item_id,design_id,original_snapshot_id,original_snapshot,
    override_input,override_financials,provenance_snapshot,created_by
  ) values (
    p_quote_id,p_line_item_id,p_design_id,v_original.id,
    jsonb_build_object('retail',v_original.retail_snapshot,'internalCost',v_original.internal_cost_snapshot,'validation',v_original.validation_snapshot,'provenance',v_original.provenance_snapshot),
    p_override_input,p_override_financials,p_provenance_snapshot,p_actor_id
  ) returning id into v_override_id;

  insert into public.sales_quote_v2_price_snapshots(
    quote_id,line_item_id,design_id,quote_revision,selection_fingerprint,catalog_version,
    retail_total,internal_landed_cost_total,retail_snapshot,internal_cost_snapshot,
    validation_snapshot,provenance_snapshot,created_by
  ) values (
    p_quote_id,p_line_item_id,p_design_id,v_revision,v_fingerprint,
    'custom-override-v1',v_total,
    (p_override_financials->>'landedCost')::numeric,p_retail_snapshot,p_internal_snapshot,
    jsonb_build_object('status','valid','mode','custom_override'),
    p_provenance_snapshot || jsonb_build_object('mode','custom_override','internalOnly',true,'overrideId',v_override_id),
    p_actor_id
  ) returning id into v_snapshot_id;

  update public.sales_quote_v2_custom_overrides set override_snapshot_id=v_snapshot_id where id=v_override_id;
  update public.sales_quote_line_items set
    room_name=coalesce(nullif(p_line_patch->>'roomName',''),room_name),
    width_whole=coalesce((p_line_patch->>'widthWhole')::int,width_whole),
    width_fraction=coalesce(nullif(p_line_patch->>'widthFraction',''),width_fraction),
    height_whole=coalesce((p_line_patch->>'heightWhole')::int,height_whole),
    height_fraction=coalesce(nullif(p_line_patch->>'heightFraction',''),height_fraction)
  where id=p_line_item_id and quote_id=p_quote_id;
  update public.sales_quote_designs set
    variant=coalesce(nullif(p_design_patch->>'name',''),variant),
    unit_price=v_unit, quote_v2_price_status='authoritative',
    quote_v2_selection_fingerprint=v_fingerprint,
    quote_v2_priced_catalog_version='custom-override-v1',
    quote_v2_priced_at=now(), current_v2_snapshot_id=v_snapshot_id
  where id=p_design_id;
  update public.sales_quotes set quote_v2_revision=v_revision, quote_v2_last_priced_at=now(),
    quote_v2_catalog_version=(
      select string_agg(distinct d.quote_v2_priced_catalog_version, ',' order by d.quote_v2_priced_catalog_version)
      from public.sales_quote_line_items l join public.sales_quote_designs d on d.id=l.selected_design_id
      where l.quote_id=p_quote_id
    ),
    total_amount=(
      select coalesce(sum(d.unit_price*l.quantity),0)
      from public.sales_quote_line_items l join public.sales_quote_designs d on d.id=l.selected_design_id
      where l.quote_id=p_quote_id
    )
  where id=p_quote_id;
  insert into public.sales_quote_v2_events(quote_id,event_type,previous_revision,new_revision,actor_id,idempotency_key,event_payload)
  values(p_quote_id,'custom_override_applied',p_expected_revision,v_revision,p_actor_id,btrim(p_idempotency_key),
    jsonb_build_object('overrideId',v_override_id,'snapshotId',v_snapshot_id,'revision',v_revision,
      'unitPrice',v_unit,'total',v_total,'lineItemId',p_line_item_id,'designId',p_design_id,'internalOnly',true));
  return jsonb_build_object('overrideId',v_override_id,'snapshotId',v_snapshot_id,'revision',v_revision,
    'unitPrice',v_unit,'total',v_total,'lineItemId',p_line_item_id,'designId',p_design_id,'internalOnly',true);
end $$;
revoke all on function public.apply_quote_v2_custom_override(uuid,uuid,uuid,bigint,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.apply_quote_v2_custom_override(uuid,uuid,uuid,bigint,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;
