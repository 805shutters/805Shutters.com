import type { SelectionContext, ValidationIssue } from '@/lib/quote-v2/core';
import { sourceProvenance } from '@/lib/quote-v2/source-manifest';
import { sundanceShadeColors } from './shade-fabrics';
export const sundanceZebraSourceId = 'sundance-g-zebra-shades-v2-2e3b46c6b809';
export const sundanceZebraControls = [
  { name: 'Beaded Chain', minWidth: 10, net: 0, page: 9 },
  { name: 'Cordless', minWidth: 10, net: 45, page: 9 },
  { name: 'Somfy Sonesse Ultra 30 WireFree RTS Li-ion', minWidth: 22, net: 220, page: 10 },
  { name: 'Somfy Sonesse 30 RTS 24V DC', minWidth: 21, net: 293, page: 10 },
  { name: 'Alpha Motor 30 2Nm Li-ion', minWidth: 23, net: 165, page: 12 },
  { name: 'Alpha Motor 30 3Nm Li-ion', minWidth: 23, net: 200, page: 12 },
  { name: 'Alpha Motor 40 5Nm Li-ion', minWidth: 29, net: 250, page: 12 },
  { name: 'Simphony Motor 2Nm Li-ion', minWidth: 17, net: 150, page: 13 },
  { name: 'Quiet Touch Wand', minWidth: 21, net: 100, page: 14 },
] as const;
export const sundanceZebraCassettes = ['3-inch Small Rounded with Fabric Insert', '3-inch Square Aluminum'] as const;
export const sundanceZebraCassetteColors = ['White', 'Ivory', 'Silver', 'Bronze', 'Black'] as const;
export const sundanceZebraChains = ['White', 'Ivory', 'Gray', 'Bronze', 'Black', 'Nickel Plated', 'Stainless Steel'] as const;
export function sundanceZebraControlPatch(options: Record<string, unknown>, control: string) {
  return { ...options, sundance_zebra_control: control || null, sundance_zebra_chain: null };
}
export function validateSundanceZebraConfiguration(s: Pick<SelectionContext,'widthInches'|'heightInches'|'programId'|'configuration'>): ValidationIssue[] {
  const c=s.configuration, issues:ValidationIssue[]=[];
  const add=(key:string,page:number,explanation:string)=>issues.push({severity:'hard_block',ruleId:`sundance.zebra.${key}`,source:sourceProvenance(sundanceZebraSourceId,{page}),selectedValues:{...c,widthInches:s.widthInches,heightInches:s.heightInches},explanation});
  const row=sundanceShadeColors.find(row=>row.productId==='sundance_zebra'&&row.id===c.fabric_color_id);
  if(!row||row.programId!==s.programId||row.colorName!==c.fabric_color_name||row.automaticDetails.catalog_sundance_shade_collection_id!==c.catalog_sundance_shade_collection_id)add('material',3,'Select the exact Zebra dealer fabric and its matching collection price group.');
  const control=sundanceZebraControls.find(control=>control.name===c.sundance_zebra_control);
  if(!control)add('control',9,'Choose a documented Zebra operating system.');
  const minWidth=control?.minWidth??10;
  if(!Number.isFinite(s.widthInches)||!Number.isFinite(s.heightInches)||s.widthInches<minWidth||s.widthInches>96||s.heightInches<16||s.heightInches>96)add('size',control?.page??9,`Zebra shades require width${minWidth}–96 inches and height16–96 inches. Larger motor capability tables do not override the product limit.`);
  if(!sundanceZebraCassettes.includes(String(c.sundance_zebra_cassette) as never))add('cassette',4,'Choose the included3-inch rounded cassette with fabric insert or3-inch square aluminum cassette.');
  if(!sundanceZebraCassetteColors.includes(String(c.sundance_zebra_cassette_color) as never))add('cassette_color',4,'Choose White, Ivory, Silver, Bronze or Black cassette finish.');
  if(c.sundance_zebra_control==='Beaded Chain'&&!sundanceZebraChains.includes(String(c.sundance_zebra_chain) as never))add('chain',9,'Choose the exact chain color or Stainless Steel; stainless adds10 net.');
  if(c.sundance_zebra_control!=='Beaded Chain'&&c.sundance_zebra_chain)add('stale_chain',9,'Clear the beaded-chain choice for cordless or motorized control.');
  if(!['Inside','Outside'].includes(String(c.mount_type)))add('mount',9,'Choose inside or outside mount. Factory inside width deduction is1/8 inch; do not subtract it twice.');
  if(c.sundance_zebra_assembly==='Two on one')add('components',9,'Two-on-one requires both component dimensions and verified alignment. The35 net surcharge does not replace individual shade pricing.');
  else if(c.sundance_zebra_assembly!=='Single')add('assembly',9,'Choose single shade or identify a two-on-one assembly.');
  if(c.sundance_zebra_cutouts||Number(c.sundance_cellular_cutout_qty)>0)add('cutouts',5,'Tile cut-outs are not available for Zebra shades.');
  if(c.sundance_zebra_alignment_group)add('alignment',5,'Side-by-side alignment requires shades ordered together in identical fabric and size. The source only guarantees alignment within3/8 inch; verify the entire group.');
  return issues;
}
export function sundanceZebraOptionEvidence(options:Record<string,unknown>) {
  const entries:{label:string;net:number;page:number}[]=[];
  const control=sundanceZebraControls.find(c=>c.name===options.sundance_zebra_control);
  if(control&&control.net)entries.push({label:control.name,net:control.net,page:control.page});
  if(control?.name==='Beaded Chain'&&options.sundance_zebra_chain==='Stainless Steel')entries.push({label:'Stainless Steel Bead Chain',net:10,page:9});
  if(options.sundance_zebra_assembly==='Two on one')entries.push({label:'Two-on-one side-by-side alignment',net:35,page:9});
  return {sourceId:sundanceZebraSourceId,entries,netSubtotal:entries.reduce((sum,e)=>sum+e.net,0),customerPriceEligible:false as const};
}
