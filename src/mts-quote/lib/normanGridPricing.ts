import type { SalesQuote, SalesQuoteDesign, SalesQuoteLineItem } from '@mts/types/quote';
import { automaticPricingInputSignature } from '@/lib/quote/automatic-price-state';
import { resolveQuoteTotalDesign } from './quoteTotals';
import { isQuotePriceLocked } from './quotePriceLock';

/** Norman quotes use the server grid path without enabling additional ordering controls. */
export function isNormanGridDesign(design: Pick<SalesQuoteDesign,'supplier'|'options_json'> | undefined): boolean {
  const supplier=String(design?.supplier??'').trim().toLowerCase();
  return supplier==='norman'||supplier==='sundance';
}

/** Price refreshes must not retrigger themselves; only persisted pricing selections belong here. */
export function legacyNormanPricingSignature(
  quote: SalesQuote | null | undefined,
  lines: readonly SalesQuoteLineItem[],
  designs: readonly SalesQuoteDesign[],
): string | null {
  if(!quote||quote.quote_v2_backend||isQuotePriceLocked(quote))return null;
  let automaticCount=0;
  const selections=lines.slice().sort((a,b)=>a.id.localeCompare(b.id)).flatMap(line=>{
    const candidates=designs.filter(design=>design.line_item_id===line.id);
    const design=line.selected_design_id?candidates.find(row=>row.id===line.selected_design_id):resolveQuoteTotalDesign(candidates);
    if(!design||!isNormanGridDesign(design))return [];
    const options={...(design.options_json??{})};
    const manual=options.manual_price_override===true;
    if(!manual&&!options.sent_price_snapshot&&options.custom_mode!==true&&options.custom_pricing_mode!==true)automaticCount++;
    for(const key of ['norman_grid_pricing','quote_v2_backend','quote_v2_catalog_version','quote_v2_catalog_as_of'])delete options[key];
    return [{lineId:line.id,designId:design.id,signature:automaticPricingInputSignature({
      productType:line.product_type,widthWhole:line.width_whole,widthFraction:line.width_fraction,
      heightWhole:line.height_whole,heightFraction:line.height_fraction,quantity:line.quantity,
      variant:design.variant,supplier:design.supplier,
      selections:{material:design.material,louverSize:design.louver_size,tiltType:design.tilt_type,
        hingeColor:design.hinge_color,panelConfig:design.panel_config,mountType:design.mount_type,
        shadeType:design.shade_type,liftSystem:design.lift_system,valance:design.valance,fabric:design.fabric,
        motorType:design.motor_type,remoteType:design.remote_type},options,
    })}];
  });
  return automaticCount?JSON.stringify({quoteId:quote.id,selections}):null;
}
