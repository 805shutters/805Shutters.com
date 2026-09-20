import { isRomanAncillary, ROMAN_YARDAGE, ROMAN_ANCILLARY_RECORD, ROMAN_ANCILLARY_HOLD, parseRomanAncillary, romanAncillaryFabrics, romanAncillaryRetailReference } from '../quote/norman-roman-ancillary';
import { sourceProvenance } from './source-manifest';
import type { SelectionContext, ValidationIssue } from './core';

export function hasRomanAncillaryUnits(productId:string, configuration:Record<string,unknown>):boolean {
  const r=parseRomanAncillary(configuration[ROMAN_ANCILLARY_RECORD]);
  return isRomanAncillary(productId) && !!r && (productId===ROMAN_YARDAGE ? r.kind==='yardage' : r.kind==='pillow_cover');
}
export function validateRomanAncillary(s:SelectionContext):ValidationIssue[]{
  if(!isRomanAncillary(s.productId))return [];
  const c={...s.configuration},r=parseRomanAncillary(c[ROMAN_ANCILLARY_RECORD]),issues:ValidationIssue[]=[];
  const add=(rule:string,explanation:string)=>issues.push({severity:'hard_block',ruleId:`norman.roman.ancillary.${rule}`,source:sourceProvenance('norman-roman-guide-2026-09',{pages:[34,46,50]}),selectedValues:{productId:s.productId,programId:s.programId,record:c[ROMAN_ANCILLARY_RECORD]??null},explanation});
  add('price_approval',ROMAN_ANCILLARY_HOLD);
  if(s.catalogAsOf<'2026-09-20')add('effective_date','These ancillary destinations were introduced September 20, 2026.');
  if(s.manufacturerId.toLowerCase()!=='norman'||s.programId!==`${s.productId}_source`)add('program','Select the exact Norman ancillary product and program.');
  if(!r||!hasRomanAncillaryUnits(s.productId,c)){add('record','Choose a typed yardage or pillow-cover configuration.');return issues;}
  if(s.widthInches!==0||s.heightInches!==0)add('natural_units','Ancillary products use explicit yardage or cover size, not opening dimensions.');
  const row=romanAncillaryFabrics(s.productId).find(row=>row.colorCode===r.colorCode);
  if(!row)add('fabric','Choose an available fabric for this ancillary product. Excluded pillow cloth codes and discontinued fabrics cannot be ordered.');
  if(r.kind==='yardage'){
    if(r.yards===null||r.yards<=0||r.yards>10)add('yards','Record the requested yardage greater than zero and no more than 10 yards.');
    if(r.yards!==null&&!Number.isInteger(r.yards))add('yard_increment','The guide does not specify fractional-yard ordering increments. The exact requested amount is saved and requires dealer confirmation.');
    if(s.quantity!==1)add('yard_line_quantity','Use one fabric-cut line with its explicit yard quantity; duplicate-cut order limits require dealer confirmation.');
    if(row?.priceGroup===2)add('yard_group2_rate','September does not provide a Group 2 fabric-by-yard rate. The older $150 rate is not verified for this order.');
  }else if(!r.size||!r.edge)add('cover_options','Choose one of the 11 documented cover sizes and knife edge or piping. Reverse Patterns/Impressions are not available.');
  // Derive display fields from the typed record; never accept a conflicting browser summary.
  delete c.ancillary_yards;delete c.ancillary_cover_size;delete c.ancillary_edge;
  c.ancillary_unit=r.kind==='yardage'?'yards per cut':'pillow covers (insert not included)';
  if(r.kind==='yardage')c.ancillary_yards=r.yards;
  else {c.ancillary_cover_size=r.size;c.ancillary_edge=r.edge;c.ancillary_pattern='standard';}
  if(row){c.fabric_color_code=row.colorCode;c.fabric_color_name=row.colorName;c.fabric_color_collection=row.collection;}
  c.norman_ancillary_suggested_retail_reference=romanAncillaryRetailReference(r);
  s.configuration=c;
  return issues;
}
