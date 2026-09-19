import type { SelectionContext, ValidationIssue } from "./core";
import { sourceProvenance } from "./source-manifest";

const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const yes=(v:unknown)=>["yes","true","on"].includes(norm(v));
const supplied=(v:unknown)=>v!=null&&v!=="";
const finite=(v:unknown)=>supplied(v)&&Number.isFinite(Number(v))?Number(v):null;
export const SMARTDRAPE_CEILING_ATTACHMENTS=["Pre-Drilled Headrail","C Clips"] as const;
export function smartdrapeJointCount(width:number,motorized:boolean) {
  return width<=(motorized?94.5:94.375)?0:width<=189.625?1:width<=286.75?2:3;
}
export function smartdrapeKeystoneChoices(width:number,motorized:boolean) {
  const count=smartdrapeJointCount(width,motorized);
  return ["None",...Array.from({length:2**count-1},(_,i)=>Array.from({length:count},(_,j)=>j+1).filter(j=>(i+1)&2**(j-1)).join(", "))];
}
export function smartdrapeHardware(s:SelectionContext) {
  if(s.productId!=="smartdrape"||s.catalogAsOf<"2026-09-19")return null;
  const c=s.configuration,w=s.widthInches,motorized=/motor/.test(norm(c.control_type??c.lift_system)),centerOpening=norm(c.stack_option)==="center opening";
  const mount=norm(c.installation_method??c.smartdrape_mount_method),wall=mount==="wall mount",ceiling=mount==="ceiling mount",pocket=mount==="ceiling pocket mount";
  const bracketGap=motorized&&centerOpening&&w>94.25&&w<=94.5;
  const bracketCount=bracketGap?null:w<=72?2:w<=(motorized?centerOpening?94.25:94.5:94.375)?3:w<=144?4:w<=197.875?6:w<=286.75?9:12;
  const long=yes(c.long_l_bracket),shim=yes(c.aluminum_shim),attachment=pocket?"Pre-Drilled Headrail":ceiling?String(c.smartdrape_ceiling_attachment??""):null;
  const clips=wall||ceiling&&attachment==="C Clips";
  const depth=finite(c.pocket_depth_inches),height=finite(c.pocket_height_inches);
  const pocketGap=pocket&&motorized&&depth!==null&&depth>8.875&&depth<9;
  const validPocket=depth!==null&&depth>=(motorized?5.125:4.875)&&height!==null&&height>=0&&height<=4.625&&!pocketGap;
  const hangHeight = !pocket || !validPocket ? null
    : depth! > (motorized ? 8.875 : 8.125) || height! <= 1.75 ? 0
    : height! < 2.75 ? 1 : height! < 3.375 ? 1.5625 : height! < 3.75 ? 2 : height! < 4.125 ? 2.375 : 2.9375;
  const jointCount=bracketGap?null:smartdrapeJointCount(w,motorized);
  const choice=String(c.smartdrape_keystone_joints??"None");
  const selectedJoints=norm(choice)==="none"?[]:choice.split(",").map(v=>Number(v.trim()));
  const validJoints=jointCount!==null&&selectedJoints.every(n=>Number.isInteger(n)&&n>=1&&n<=jointCount)&&new Set(selectedJoints).size===selectedJoints.length;
  return {wall,ceiling,pocket,bracketGap,pocketGap,validPocket,validJoints,jointCount,selectedJoints,
    record:{version:1,sourceId:motorized?"norman-motorization-guide-2026-09-16":"norman-perfectsheer-smartdrape-guide-2026-09",sourcePages:motorized?[50,51,52]:[6,17,18,19,20,21,22],quantityBasis:"per_shade",mount:c.installation_method??c.smartdrape_mount_method??null,
      trackWidth:w,orderHeight:s.heightInches,shadeHeight:pocket?(hangHeight===null?null:s.heightInches-hangHeight):s.heightInches,ceilingAttachment:attachment,
      lBracketCount:wall?bracketCount:0,lBracketLength:wall?(long?5.6875:motorized?4.6875:3.9375):null,motorEndBracketCount:wall&&motorized?1:0,
      cClipCount:clips&&bracketCount!==null?bracketCount+(motorized?1:0):0,screwCount:bracketCount===null?null:wall?2*bracketCount:ceiling&&attachment==="C Clips"?bracketCount+(motorized?1:0):bracketCount,
      shimQuantity:wall&&shim&&!long?bracketCount:0,shimThickness:shim?.5625:0,topBracketOffset:wall?(long?.6875:.5):null,
      pocket:pocket?{innerDepth:depth,innerHeight:height,hangStripHeight:hangHeight}:null,
      smartJointCount:jointCount,trackSectionWidths:jointCount===null?[]:Array.from({length:jointCount+1},()=>w/(jointCount+1)),
      keystoneJoints:validJoints?selectedJoints:[],keystonePositions:validJoints?selectedJoints.map(n=>w*n/(jointCount!+1)):[],
    },
    surchargeDetails:{aluminum_shim:wall&&shim&&!long,aluminum_shim_quantity:wall&&shim&&!long?bracketCount??0:0,long_l_bracket:wall&&long,keystone:validJoints&&selectedJoints.length>0,keystone_quantity:validJoints?selectedJoints.length:0},
  };
}
export function validateSmartdrapeHardware(s:SelectionContext):ValidationIssue[] {
  const h=smartdrapeHardware(s);if(!h)return [];
  const c=s.configuration,issues:ValidationIssue[]=[];
  const add=(id:string,page:number,message:string,motor=false)=>issues.push({severity:"hard_block",ruleId:`norman.smartdrape.${id}`,source:sourceProvenance(motor?"norman-motorization-guide-2026-09-16":"norman-perfectsheer-smartdrape-guide-2026-09",{page}),selectedValues:{...c},explanation:message});
  if(!h.wall&&!h.ceiling&&!h.pocket)add("installation",17,"Choose Wall Mount, Ceiling Mount or Ceiling Pocket Mount.");
  if(h.ceiling&&!SMARTDRAPE_CEILING_ATTACHMENTS.some(v=>v===c.smartdrape_ceiling_attachment))add("ceiling_attachment",18,"Choose a pre-drilled headrail or C clips for ceiling mounting.");
  if(!h.ceiling&&supplied(c.smartdrape_ceiling_attachment))add("stale_ceiling_attachment",18,"A separate ceiling attachment choice applies only to Ceiling Mount.");
  if(h.pocket&&!h.validPocket)add("pocket_dimensions",19,"Enter both ceiling-pocket dimensions within the documented depth and height limits.");
  if(h.pocketGap)add("pocket_table_gap",52,"The motor guide leaves pocket depths above 8⅞ and below 9 inches unspecified. Norman must confirm the mounting arrangement.",true);
  if(!h.pocket&&(supplied(c.pocket_depth_inches)||supplied(c.pocket_height_inches)))add("stale_pocket",19,"Pocket dimensions apply only to Ceiling Pocket Mount.");
  if(!h.validJoints)add("keystone_joints",6,"Select only existing SmartJoint numbers, counted from the left; each selected joint receives one keystone.");
  if(yes(c.keystone)&&!supplied(c.smartdrape_keystone_joints))add("legacy_keystone",22,"Reconfirm which SmartJoint locations receive keystones before repricing.");
  for(const key of ["aluminum_shim","long_l_bracket"])if(supplied(c[key])&&!["yes","no","true","false"].includes(norm(c[key])))add(key,22,"Choose Yes or No for wall-mount bracket accessories.");
  return issues;
}
