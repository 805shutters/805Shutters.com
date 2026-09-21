import {ROLLER_CHAIN_KEY,emptyRollerChain,parseRollerChain} from '../quote/norman-roller-chain';
import type {SelectionContext,SelectionRecord,ValidationIssue} from './core';
import {sourceProvenance} from './source-manifest';
const norm=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function defaultRollerChainLength(height:number,smartRelease:boolean):number|null{
 if(!Number.isFinite(height)||height<12||height>144)return null;
 if(!smartRelease)return height<=25.5?height-2:2*height/3+6;
 return height<=18?height-2:height<=30?16:height<=42?24:height<=54?36:height<=66?48:height<=90?60:84;
}
export function rollerChain(s:SelectionContext):{issues:ValidationIssue[];record:SelectionRecord}|null{
 if(s.productId!=='roller'||s.catalogAsOf<'2026-09-20'||!/-chain-2026-09-20-r9$|-poles-2026-09-20-r10$/.test(s.catalogVersion))return null;
 const c=s.configuration,lift=norm(c.lift_system),active=/cord.*loop|smart ?release/.test(lift),raw=c[ROLLER_CHAIN_KEY],r=raw==null?emptyRollerChain():parseRollerChain(raw),issues:ValidationIssue[]=[];
 const add=(id:string,explanation:string)=>issues.push({severity:'hard_block',ruleId:`roller.chain.${id}`,source:sourceProvenance('norman-roller-guide-2026-09-16',{page:44}),selectedValues:{...c},explanation});
 if(!active){if(raw!=null)add('application','Clear the Roller chain record when selecting a non-chain operating system.');return {issues,record:{version:1,type:'roller_chain',status:'not_applicable'}};}
 if(!r){add('record','Save the listed chain material, color, length and safety-device measurements.');return {issues,record:{version:1,type:'roller_chain',status:'invalid'}};}
 const smartRelease=/smart ?release/.test(lift),standard=defaultRollerChainLength(s.heightInches,smartRelease),length=r.lengthMode==='Default'?standard:r.customLength;
 if(standard===null)add('height','The published chain schedule covers shade heights from 12 through 144 inches.');
 if(r.lengthMode==='Custom'){
  if(length===null||length<=0)add('custom_length','Specify a positive custom chain length measured from the top of the brackets or raceway installation bracket to the bottom of the tension device.');
  else{
   if(smartRelease&&length<10)add('minimum','SmartRelease custom chain length is at least 10 inches.');
   if(!smartRelease&&standard!==null&&length<=standard)add('minimum','Continuous Cord Loop custom chain must be strictly longer than its default length.');
   if(length>280)add('maximum','Custom chain length cannot exceed 280 inches.');
   if(length>s.heightInches-2&&!r.unobstructedBelow)add('obstruction','A custom chain longer than shade height minus 2 inches requires confirmation that no sill or obstruction is below the tension device.');
  }
 }else if(r.customLength!==null)add('stale_custom','Clear custom chain length when selecting the default length.');
 if(r.deviceClearance===null||r.deviceClearance<2)add('device_clearance','Leave at least 2 inches below the tension device for access and removal; record the measured clearance.');
 if(!r.safetyDeviceConfirmed)add('safety_device','Confirm that the bead chain will be installed with the safety tension device maintaining tension.');
 return {issues,record:{version:1,type:'roller_chain',sourceId:'norman-roller-guide-2026-09-16',sourcePage:44,material:r.material,color:r.material==='Plastic'?r.color:null,lengthMode:r.lengthMode,defaultLength:standard,orderedLength:length,measurementDatum:'bracket_top_to_tension_device_bottom',smartReleaseTolerance:smartRelease?'0 to 1.18 inches':null,unobstructedBelow:r.unobstructedBelow,deviceClearance:r.deviceClearance,safetyDeviceConfirmed:r.safetyDeviceConfirmed,commonValanceBasis:'per_member_shade_height_or_custom_request',pricingStatus:'standard_and_stainless_chain_no_extra_charge_retail_p20'}};
}
