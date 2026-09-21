import { productColorOptions } from '../quote/product-color-options';
import { isNormanValanceOnly, SMARTPRIVACY_VALANCE, VALANCE_ONLY_KEY as KEY, VALANCE_ONLY_HOLD, parseValanceOnly, valanceSourceProduct, valanceSource, valanceStyles } from '../quote/norman-valance-only';
import type { SelectionContext, ValidationIssue } from './core';
import { sourceProvenance } from './source-manifest';

export function hasValanceOnlyUnits(id:string,c:Record<string,unknown>):boolean {
  return isNormanValanceOnly(id) && parseValanceOnly(c[KEY])?.sourceProductId === valanceSourceProduct(id);
}
export function validateValanceOnly(s:SelectionContext):ValidationIssue[] {
  if (!isNormanValanceOnly(s.productId)) return [];
  const r=parseValanceOnly(s.configuration[KEY]),smart=s.productId===SMARTPRIVACY_VALANCE,issues:ValidationIssue[]=[];
  const add=(id:string,explanation:string)=>issues.push({severity:'hard_block',ruleId:`norman.valance_only.${id}`,source:sourceProvenance(valanceSource(s.productId),{page:['returns','return_length'].includes(id)?smart?11:10:smart?10:11}),selectedValues:{productId:s.productId,record:s.configuration[KEY]??null},explanation});
  add('price_approval',VALANCE_ONLY_HOLD);
  if(s.catalogAsOf<'2026-09-20')add('effective_date','This standalone valance destination was introduced September 20, 2026.');
  if(s.manufacturerId.toLowerCase()!=='norman'||s.programId!==`${s.productId}_source`)add('program','Select the exact Norman standalone valance program.');
  if(s.widthInches!==0||s.heightInches!==0)add('natural_units','Use explicit valance inner length; window opening dimensions do not apply.');
  if(!Number.isSafeInteger(s.quantity)||s.quantity<1)add('quantity','Quantity must be a positive whole number of complete valances.');
  if(!r||r.sourceProductId!==valanceSourceProduct(s.productId)){add('record','Save the complete typed selection for this exact valance family.');return issues;}
  const color=productColorOptions.find(c=>c.id===r.sourceColorId&&c.productId===r.sourceProductId&&c.available);
  if(!color)add('color','Select a current finish from this valance’s original product family. Historical or other-family identities cannot be substituted.');
  if(!valanceStyles(s.productId).includes(r.style as never))add('style','Select a documented valance style for this family.');
  const length=r.innerLengthInches;
  if(length===null||length<=0||length>384)add('length','Record a positive valance inner length no greater than 384 inches.');
  if(!(smart?['None','Both']:['None','Left','Right','Both']).includes(r.returns))add('returns',smart?'Choose no returns or both returns.':'Choose no returns, a left return, a right return or both returns.');
  if(r.returns==='None'&&r.returnLengthInches!==null||r.returns!==''&&r.returns!=='None'&&(r.returnLengthInches===null||r.returnLengthInches<.5||r.returnLengthInches>5))add('return_length','Returns require an explicit length of ½–5 inches. With no returns, clear the return length.');
  if(smart&&(r.joinery!=='Connector'||r.layout!=='Equally Spaced'||r.keystoneCount!==0||r.keystoneLocations.length))add('smartprivacy_joinery','SmartPrivacy uses equal splits and standard connectors; keystones and custom splits are unavailable.');
  if(r.joinery==='Connector'&&(r.layout!=='Equally Spaced'||r.keystoneCount!==0||r.keystoneLocations.length))add('connector_joinery','Standard connectors use equal splits; clear keystone and custom-location selections.');
  let locations:number[]=[];
  if(r.joinery==='Keystone'){
    if(!Number.isInteger(r.keystoneCount)||r.keystoneCount<1||r.keystoneCount>3)add('keystone_count','Select one to three keystones.');
    if(length!==null&&length<13)add('keystone_minimum','Keystones require an inner length of at least 13 inches.');
    const count=Math.max(0,Math.min(3,Math.floor(r.keystoneCount)));
    if(r.layout==='Custom'&&(r.keystoneLocations.length!==count||r.keystoneLocations.some(v=>v===null)))add('keystone_locations','Record every keystone center from the left end of the inner valance width.');
    if(r.layout==='Equally Spaced'&&r.keystoneLocations.length)add('stale_locations','Clear custom positions when selecting equal spacing.');
    locations=Array.from({length:count},(_,i)=>r.layout==='Custom'?r.keystoneLocations[i]??NaN:(length??NaN)*(i+1)/(count+1));
    if(locations.some((n,i)=>!Number.isFinite(n)||n<6.5||n>(length??0)-6.5||i>0&&n-locations[i-1]<18))add('keystone_spacing','Keystone centers require 6½ inches from each end and 18 inches between centers.');
  }
  const splitLocations=length!==null&&length>96?(r.joinery==='Keystone'?locations:Array.from({length:Math.ceil(length/96)-1},(_,i)=>length*(i+1)/Math.ceil(length/96))):[];
  const pieces=length===null?[]:[...splitLocations,length].map((n,i)=>n-(i?splitLocations[i-1]:0));
  if(pieces.some(n=>!Number.isFinite(n)||n<=0||n>96))add('piece_length','Every split valance piece must be positive and no longer than 96 inches; adjust keystone count or custom positions.');
  const c={...s.configuration};
  c[KEY]=r;
  c.norman_valance_only_source_v1={version:1,sourceId:valanceSource(s.productId),sourcePages:[10,11],sourceProductId:r.sourceProductId,sourceColorId:r.sourceColorId,innerLengthInches:length,splitLocations:splitLocations.map(v=>Number.isFinite(v)?v:null),pieceLengths:pieces.map(v=>Number.isFinite(v)?v:null),keystoneLocations:locations.map(v=>Number.isFinite(v)?v:null),quantity:s.quantity,pricingStatus:'standalone_price_unverified'};
  c.valance=r.style;c.fabric_color_code=color?.colorCode??null;c.fabric_color_name=color?.colorName??null;c.fabric_color_type=color?.fabricType??null;
  c.standalone_valance_inner_length=length;c.standalone_valance_returns=r.returns;c.standalone_valance_return_length=r.returnLengthInches;c.standalone_valance_joinery=r.joinery;c.standalone_valance_layout=r.layout;
  c.standalone_valance_keystone_positions=locations.filter(Number.isFinite).join(', ');c.standalone_valance_piece_lengths=pieces.filter(Number.isFinite).join(', ');
  s.configuration=c;return issues;
}
