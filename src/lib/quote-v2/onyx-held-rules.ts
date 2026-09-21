import { onyxWovenProfile, onyxWovenOptions, ONYX_WOVEN_SOURCE } from '@/lib/quote/onyx-woven-options';
import { onyxBaselineProfile, parseOnyxBaselineRecord, onyxBaselineSelectionErrors, ONYX_BASELINE_KEY, ONYX_BASELINE_SOURCE } from '@/lib/quote/onyx-baseline-options';
import { onyxPortalFrameSides, ONYX_FRAME_SIDE_SOURCE, onyxImportedHingeColors, onyxCanonicalHinge } from '@/lib/quote/onyx-current-assortment';
import { isOnyxHeldProduct, onyxHeldColors, onyxHeldProducts, onyxHeldControlChoices, onyxAshAssortment, ONYX_SHADE_SOURCE, ONYX_HELD_REASON } from '@/lib/quote/onyx-held-catalog';
import type { SelectionContext, ValidationIssue } from './core';
import { sourceProvenance } from './source-manifest';

export function validateOnyxHeldSelection(s:SelectionContext):ValidationIssue[]{
  if(!isOnyxHeldProduct(s.productId))return [];
  const c=s.configuration,issues:ValidationIssue[]=[];
  const add=(rule:string,explanation:string)=>issues.push({severity:'hard_block',ruleId:`onyx.current.${rule}`,source:sourceProvenance(rule==='frame_sides'?ONYX_FRAME_SIDE_SOURCE:rule.startsWith('woven_')?ONYX_WOVEN_SOURCE:rule==='hinge'?'onyx-hinge-assortment-2026-09-20':s.productId==='onyx_ash_shutters'?'onyx-portal-assortment-2026-09-20':ONYX_SHADE_SOURCE),selectedValues:{productId:s.productId,programId:s.programId,...c},explanation});
  // Assortment observations never authorize arbitrary prices or customer delivery.
  add('price_grid_required',ONYX_HELD_REASON);
  if(c[ONYX_BASELINE_KEY]!==null&&c[ONYX_BASELINE_KEY]!==undefined){
    const profile=onyxBaselineProfile({productId:s.productId,programId:s.programId,colorCode:c.fabric_color_code,control:c.lift_system,mount:c.mount_type,controlSide:c.control_side,width:s.widthInches,height:s.heightInches,quantity:s.quantity});
    const record=parseOnyxBaselineRecord(c[ONYX_BASELINE_KEY]);
    const error=!profile||!record||record.profileId!==profile.id?'The saved Onyx option profile requires its exact observed fabric/control, 30 × 60 inside-mount, right-control, quantity-one configuration. Clear or reselect the observed profile.':onyxBaselineSelectionErrors(profile,record).length?'Choose only option identities recorded for this exact Onyx source profile.':null;
    if(error)issues.push({severity:'hard_block',ruleId:'onyx.current.baseline_options',source:sourceProvenance(ONYX_BASELINE_SOURCE),selectedValues:{productId:s.productId,programId:s.programId,...c},explanation:error});
  }
  if(s.catalogAsOf<'2026-09-20')add('observation_date','This assortment was first observed September 20, 2026; an earlier effective schedule is not established.');
  if(!['onyx','onyx shutters'].includes(s.manufacturerId.toLowerCase()))add('manufacturer','This assortment belongs to Onyx.');
  const product=onyxHeldProducts.find(p=>p.id===s.productId)!;
  if(!product.programs.some(p=>p.id===s.programId))add('program','Choose an exact Onyx collection for this product.');
  const color=onyxHeldColors.find(r=>r.productId===s.productId&&r.id===c.fabric_color_id);
  if(!color||color.programId!==s.programId||color.colorCode!==c.fabric_color_code||color.collection!==c.fabric_color_collection||color.colorName!==c.fabric_color_name)add('color_program','Choose a current color from the selected Onyx product and collection.');
  if(c.mount_type&&!['Inside Mount','Outside Mount'].includes(String(c.mount_type)))add('mount','Choose inside or outside mount.');
  if(s.productId==='onyx_ash_shutters'){
    if(c.onyx_frame_sides&&!onyxPortalFrameSides('painted_basswood')?.some(choice=>choice.value===c.onyx_frame_sides))add('frame_sides','Choose a documented Ash frame-side construction.');
    if(c.hinge_color&&!onyxImportedHingeColors.includes(onyxCanonicalHinge(String(c.hinge_color))))add('hinge','Choose an enabled current Ash hinge finish.');
    for(const [field,values] of [['onyx_frame',onyxAshAssortment.frames],['onyx_shape',onyxAshAssortment.shapes],['onyx_tilt_code',onyxAshAssortment.tiltCodes],['louver_size',onyxAshAssortment.louverSizes.map(String)]] as const){if(c[field]&&!values.includes(String(c[field])))add(field,'Choose a documented Ash menu option; construction and charge approval remain required.');}
  }else{
    if(c.lift_system&&!onyxHeldControlChoices(s.productId).includes(String(c.lift_system)))add('control','Choose a control listed for this Onyx product.');
    if(c.control_side&&!['Left','Right'].includes(String(c.control_side)))add('control_side','Choose left or right control.');
  }
  if(s.productId==='onyx_woven'){
    const profile=onyxWovenProfile(s.programId??'');
    for(const [field,choices] of [['onyx_woven_liner_id',profile?.liners],['onyx_woven_binding_id',profile?.bindings],['onyx_woven_assembly',onyxWovenOptions.assemblies]] as const){
      if(c[field] && !choices?.some(choice=>choice.id===c[field]))add('woven_accessory','Choose the exact liner, binding or assembly listed for this Woven collection.');
    }
    const valance=c.onyx_woven_custom_valance_inches;
    if(valance!==null&&valance!==undefined&&valance!==''){
      const width=Number(valance);
      if(!Number.isFinite(width)||width<=0||width>onyxWovenOptions.customValanceMaxWidthInches)add('woven_valance_size','Custom Woven valance width must be greater than zero and at most120 inches.');
    }
  }
  return issues;
}
