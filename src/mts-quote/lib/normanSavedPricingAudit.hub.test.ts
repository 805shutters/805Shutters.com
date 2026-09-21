import {describe,it,expect} from 'vitest';
import type {SalesQuoteDesign} from '@mts/types/quote';
import type {SelectionContext} from '@/lib/quote-v2/core';
import {quoteV2CatalogVersionFor} from '@/lib/quote-v2/catalog';
import {deriveNormanOrderRecords} from '@/lib/quote-v2/norman-assemblies';
import {normanSavedPricingAudit} from './normanSavedPricingAudit';
const row=(id:string,quantity=2,network=1,remotes=1)=>({lineId:id,selection:{manufacturerId:'Norman',productId:'perfectsheer',programId:'perfectsheer_perfectsheer_shades_light_filtering',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor('perfectsheer','2026-09-20'),widthInches:36,heightInches:60,quantity,options:{},configuration:{fabric_color_code:'F1179',light_control:'Light Filtering',mount_type:'Outside Mount',valance:'Standard',lift_system:'Motorized',motor_type:'Automate Home ARC Rechargeable Battery',remote_type:'15-Channel Remote',motor_position:'Right',hub_required:true,perfectsheer_tube_diameter:2,perfectsheer_shared_hub_id:'Hub 1',perfectsheer_motor_network:network,perfectsheer_remote_quantity:remotes}} as SelectionContext});
const audit=(s:SelectionContext)=>normanSavedPricingAudit({quote_v2_selection:s,options_json:{authoritative_price_status:'blocked'}} as unknown as SalesQuoteDesign);
describe('server-saved Automate hub and network audit',()=>{
 it('shows source membership, owner and network coverage after serialization',()=>{
  const a=row('a'),b=row('b');deriveNormanOrderRecords([a,b]);
  expect(audit(a.selection)).toContain('Shared Automate hub hub 1: 4 of 30 motors across 2 quote lines; one hub charged on this line.');
  expect(audit(b.selection)).toContain('Shared Automate hub hub 1: 4 of 30 motors across 2 quote lines; hub charged on another connected line.');
  expect(audit(b.selection)).toContain('Saved Automate network 1: 2 remote controls.');
  expect(audit(JSON.parse(JSON.stringify(b.selection)))).toEqual(audit(b.selection));
 });
 it('exposes exact saved over-capacity and separate-network errors beneath a pricing hold',()=>{
  const a=row('a',20,1,1),b=row('b',11,2,0);deriveNormanOrderRecords([a,b]);
  expect(audit(b.selection)).toContain('Shared Automate hub hub 1: 31 of 30 motors across 2 quote lines; invalid allocation — pricing blocked.');
  expect(audit(b.selection)).toContain('One Automate Wi-Fi hub supports at most 30 motors. Split the connected shades between separately identified hubs.');
  expect(audit(b.selection)).toContain('Supply at least one compatible remote on this motor network or identify the previous remote work order for this network. A control assigned to a different network does not satisfy this requirement.');
  b.selection.configuration={...b.selection.configuration,existing_remote_work_order_number:'internal-source-evidence'};deriveNormanOrderRecords([a,b]);
  expect(audit(b.selection)).toContain('Saved Automate network 2: 0 remote controls; previous remote work order recorded.');
  expect(audit(b.selection).some(x=>x.startsWith('Supply at least'))).toBe(false);
 });
});
