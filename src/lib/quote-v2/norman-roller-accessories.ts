import {ROLLER_ACCESSORY_KEY,emptyRollerAccessories,parseRollerAccessories} from '../quote/norman-roller-accessories';
import {MAGNET_CLEARANCE_FIELDS} from './norman-magnet-clearance';
import {rollerComponentOrderWidthsForPricing} from './roller-matrix';
import type {SelectionContext,SelectionRecord,ValidationIssue} from './core';
import type {SurchargeSelection} from '../quote/pricing';
import {sourceProvenance} from './source-manifest';
export const currentRollerAccessories=(s:SelectionContext)=>s.productId==='roller'&&s.catalogAsOf>='2026-09-20'&&/-accessories-2026-09-20-r8$|-chain-2026-09-20-r9$|-poles-2026-09-20-r10$/.test(s.catalogVersion);
const norm=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function rollerAccessories(s:SelectionContext):{issues:ValidationIssue[];selections:SurchargeSelection[];record:SelectionRecord}|null{
 if(!currentRollerAccessories(s))return null;
 const c=s.configuration,raw=c[ROLLER_ACCESSORY_KEY],r=raw==null?emptyRollerAccessories():parseRollerAccessories(raw),issues:ValidationIssue[]=[],selections:SurchargeSelection[]=[];
 const add=(id:string,explanation:string,page=43)=>issues.push({severity:'hard_block',ruleId:`roller.accessories.${id}`,source:sourceProvenance('norman-roller-guide-2026-09-16',{page}),selectedValues:{...c},explanation});
 if(!r){add('record','Save the listed Roller hold-down, catch color and measured clearances.');return {issues,selections,record:{version:1,status:'invalid'}};}
 const app=norm(c.roller_application??c.shade_type),valance=norm(c.valance),cassette=/cassette/.test(valance+' '+norm(c.roller_top_treatment??c.top_treatment_class));
 const lg360=/light ?guard ?360/.test(app+' '+valance),legacy=norm(c.hold_downs??c.hold_down??c.magnetic_hold_down);
 const active=cassette?'Magnetic':r.holdDown;
 if(raw==null&&legacy&&!['none','no','false','0'].includes(legacy))add('legacy_hold_down','Record the hold-down and its required clearances in Roller accessories before pricing.');
 if(cassette&&raw!=null&&r.holdDown==='Traditional')add('cassette_hold_down','Cassette retail includes magnetic hold-downs; Traditional is not a replacement for its included hardware.');
 if(lg360&&active!=='None')add('lightguard360','Traditional and magnetic hold-downs are unavailable with LightGuard360.');
 let count=1;
 if(/coupled/.test(app)){const widths=rollerComponentOrderWidthsForPricing(s);if(!widths)add('component_count','Record coupled component widths before calculating hold-downs.');count=widths?.length??0;}
 if(active==='Magnetic'){
  [r.leftClearance,r.rightClearance,r.bottomClearance].forEach((v,i)=>{const [,label,min]=MAGNET_CLEARANCE_FIELDS[i];if(v==null||v<min)add(`magnet_${['left','right','bottom'][i]}`,`${label} must be measured and at least ${min} inches. Measure from the finished shade side edges and below the shade bottom or sill; use the smaller bottom measurement at both catches.`);});
  if(!cassette&&count)selections.push({id:'magnetic_hold_down',units:count});
 }
 if(active==='Traditional')add('traditional_price','Traditional hold-down availability is documented, but the current retail guide does not specify its charge or inclusion. Obtain Norman pricing confirmation.');
 return {issues,selections,record:{version:1,type:'roller_accessories',sourceId:'norman-roller-guide-2026-09-16',sourcePages:[43],retailSourceId:'norman-retail-guide-2026-09',retailSourcePage:20,holdDown:active,magnetCatchColor:active==='Magnetic'?r.magnetColor:null,holdDownPairs:active==='None'?0:count,quantityBasis:'per_assembly',magnetLocation:active==='Magnetic'?/dual/.test(app)?'factory_back_of_rear_shade_hem_bar':'factory_back_of_each_shade_hem_bar':null,catchInstallation:active==='Magnetic'?'job_site':null,includedWithCassette:cassette,clearance:active==='Magnetic'?{left:r.leftClearance,right:r.rightClearance,bottom:r.bottomClearance,requiredEachSide:.5625,requiredBottom:.6875,sideDatum:'finished_shade_side_edge',bottomDatum:'shade_bottom_or_sill'}:null,pricingStatus:active==='Traditional'?'traditional_hold_down_price_unconfirmed':'existing_other_pricing_requirements_retained'}};
}
