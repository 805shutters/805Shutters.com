-- Match customer contract rounding at each monetary adjustment. No record updates.
create or replace function public.quote_customer_adjusted_total(p_subtotal numeric,p_fixed_charges numeric,p_installer_notes text)
returns numeric language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_controls jsonb;
  v_extras numeric := 0;
  v_discount numeric := 0;
  v_total numeric;
begin
  begin v_controls := p_installer_notes::jsonb->'__adminControls';
  exception when invalid_text_representation then v_controls := null; end;
  if v_controls->'showExtras' = 'true'::jsonb and jsonb_typeof(v_controls->'extraFees')='array' then
    select coalesce(sum(public.quote_control_number(fee->'amount')),0) into v_extras
    from jsonb_array_elements(v_controls->'extraFees') fee;
  end if;
  v_extras := round(v_extras,2);
  p_subtotal := round(p_subtotal+v_extras,2);
  if v_controls->'showDiscount' = 'true'::jsonb then
    v_discount := round(greatest(0,p_subtotal-coalesce(p_fixed_charges,0))
      * public.quote_control_number(v_controls->'discountPercent')/100,2);
  end if;
  v_total := round(p_subtotal-v_discount,2);
  if v_controls->'showTax' = 'true'::jsonb then
    v_total := v_total+round(v_total*public.quote_control_number(v_controls->'taxPercent')/100,2);
  end if;
  return round(v_total,2);
end $$;
revoke all on function public.quote_customer_adjusted_total(numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.quote_customer_adjusted_total(numeric,numeric,text) to service_role;

