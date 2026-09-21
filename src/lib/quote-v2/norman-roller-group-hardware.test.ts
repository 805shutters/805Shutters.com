import { describe, expect, it } from 'vitest';
import { deriveRollerGroupHardware, rollerMinimumFasciaSize, rollerTubeDiameter } from './norman-roller-group-hardware';
import { deriveRollerCommonValances } from './norman-roller-common';
import { deriveRollerSeparateValances } from './norman-roller-valance-only';
import { quoteV2CatalogVersionFor, isRecognizedQuoteV2Catalog, QUOTE_V2_ROLLER_PREVIEW_VERSION } from './catalog';
import { ROLLER_COMMON_CHOICE_KEY as KEY, ROLLER_COMMON_RECORD_KEY as RECORD, emptyRollerCommon } from '../quote/norman-roller-common';
import { ROLLER_SEPARATE_VALANCE, ROLLER_VALANCE_KEY, ROLLER_VALANCE_DERIVED, emptyRollerValance } from '../quote/norman-roller-valance-only';
import type { SelectionContext, SelectionRecord } from './core';
const shade = (width=36,height=60,lift='Cordless',config:SelectionRecord={}):SelectionContext => ({
 manufacturerId:'Norman',productId:'roller',programId:'roller_cordless_fabric_price_group_1_pg1',catalogAsOf:'2026-09-20',catalogVersion:quoteV2CatalogVersionFor('roller','2026-09-20'),widthInches:width,heightInches:height,quantity:1,options:{},configuration:{roller_application:'Common Valance',lift_system:lift,fabric_collection:'Amelia',fabric_color_code:'F1484',roller_top_treatment:'Square Fascia',valance:'4.5 Square Fascia',mount_type:'Outside Mount',roller_tube:'2" (52mm) Tube',...config}
});
const rows=(a=shade(),b=shade())=>[{lineId:'a',selection:a},{lineId:'b',selection:b}];
const ids=(r:ReturnType<typeof rows>)=>deriveRollerGroupHardware(r,'common').issues.map(i=>i.ruleId);
describe('Roller exact shared hardware requirements',()=>{
 it.each([[24,72,3.5],[24,72.001,4.5],[24.001,96,3.5],[96,96,3.5],[96,96.001,4.5],[96.001,72,3.5],[96.001,72.001,4.5]])('checks cordless individual fascia boundary %s x %s',(w,h,min)=>expect(rollerMinimumFasciaSize(shade(w,h))).toBe(min));
 it('keeps SmartRelease and CCL ratio exceptions exact',()=>{
  expect(rollerMinimumFasciaSize(shade(96,60,'Smart Release'))).toBe(3.5);expect(rollerMinimumFasciaSize(shade(96.001,60,'Smart Release'))).toBe(4.5);
  expect(rollerMinimumFasciaSize(shade(15,75,'Continuous Cord Loop'))).toBe(3.5);expect(rollerMinimumFasciaSize(shade(14.999,75,'Continuous Cord Loop'))).toBe(4.5);
  expect(rollerMinimumFasciaSize(shade(10,72,'Continuous Cord Loop'))).toBe(3.5);
 });
 it('uses each coupled component rather than the aggregate width for fascia size',()=>{
  const s=shade(120,90,'Continuous Cord Loop',{roller_application:'Coupled Shades',coupling_arrangement:'Standard',roller_coupling_count:2,roller_component_order_widths:[60,60]});
  expect(rollerMinimumFasciaSize(s)).toBe(3.5);
 });
 it('enforces cross-member 96-inch/72-inch common rule and keeps separate applicability distinct',()=>{
  const r=rows(shade(97,60),shade(36,73));
  expect(deriveRollerGroupHardware(r,'common').record).toMatchObject({minimumFasciaInches:4.5,crossMemberFasciaRestriction:true});
  expect(deriveRollerGroupHardware(r,'separate').record).toMatchObject({minimumFasciaInches:3.5,crossMemberFasciaRestriction:false,associatedMountingBracketSize:'large',valanceBracketSize:'large'});
  r[1].selection.heightInches=72;expect(deriveRollerGroupHardware(r,'common').record.crossMemberFasciaRestriction).toBe(false);
  r[0].selection=shade(10,60,'Continuous Cord Loop');r[1].selection.heightInches=73;expect(deriveRollerGroupHardware(r,'common').record.crossMemberFasciaRestriction).toBe(true);
  r[0].selection.widthInches=12;expect(deriveRollerGroupHardware(r,'common').record.crossMemberFasciaRestriction).toBe(false);
 });
 it('rejects explicit small fascia, identifies largest tube, validates exact appendix and never silently changes saved tube',()=>{
  const r=rows(shade(97,60,'Cordless',{valance:'3.5 Square Fascia',roller_tube:'1 3/4" (43mm) Tube'}),shade(36,73));const before=JSON.stringify(r);
  const result=deriveRollerGroupHardware(r,'common');expect(result.record.requiredTubeInches).toBe(2);expect(result.issues.map(i=>i.ruleId)).toContain('roller.group_hardware.tube_matching');expect(result.issues.map(i=>i.ruleId)).toContain('roller.group_hardware.fascia_size');expect(JSON.stringify(r)).toBe(before);
  const good=deriveRollerGroupHardware(rows(),'common');expect(good.issues).toEqual([]);expect(good.record.members).toEqual(expect.arrayContaining([expect.objectContaining({lineId:'a',tubeStatus:'source_dimension_profile_compatible',requiredTubeInches:2})]));
  const bad=rows(shade(36,1000),shade());expect(ids(bad)).toContain('roller.group_hardware.tube_compatibility');
 });
 it('holds unknown/ambiguous diameter, narrow cordless upgrade and unavailable fabric matrix',()=>{
  expect(rollerTubeDiameter('Large')).toBeNull();expect(rollerTubeDiameter('All Tubes')).toBeNull();expect(rollerTubeDiameter('1 1/8" Tube')).toBe(1.125);
  expect(ids(rows(shade(36,60,'Cordless',{roller_tube:'All Tubes'})))).toContain('roller.group_hardware.tube_identity');
  expect(ids(rows(shade(20,60)))).toContain('roller.group_hardware.cordless_upgrade');
  expect(ids(rows(shade(36,60,'Cordless',{fabric_color_code:'F0000'})))).toContain('roller.group_hardware.tube_compatibility');
 });
 it('records documented CCL raceway clutch independently from tube diameter, leaves p70 factory decision explicit',()=>{
  const r=deriveRollerGroupHardware(rows(shade(36,60,'Continuous Cord Loop'),shade(40,60,'Continuous Cord Loop')),'common');
  expect(r.record.members).toEqual(expect.arrayContaining([expect.objectContaining({requiredTubeInches:2,clutchInches:1.75,clutchStatus:'documented_raceway_ccl'})]));
  expect(r.record.factoryConfirmationRequired).toEqual(expect.arrayContaining([expect.stringContaining('p70')]));expect(r.record.mountingBracketChartStatus).toBe('p73_reference_only_not_factory_selection');
 });
 it('rebuilds saved common hardware, preserves old r6 snapshots until repricing',()=>{
  const r=rows();r.forEach((row,i)=>row.selection.configuration={...row.selection.configuration,[KEY]:{...emptyRollerCommon(),groupId:'G',position:i+1},[RECORD]:{groupHardware:{requiredTubeInches:999}}});
  expect(deriveRollerCommonValances(r)).toEqual([]);expect(r[0].selection.configuration[RECORD]).toMatchObject({groupHardware:{requiredTubeInches:2,minimumFasciaInches:3.5}});
  const reopened=JSON.parse(JSON.stringify(r));deriveRollerCommonValances(reopened);expect(reopened).toEqual(r);
  r.forEach(row=>row.selection.catalogVersion=`${QUOTE_V2_ROLLER_PREVIEW_VERSION}-material-2026-09-20-r6`);expect(isRecognizedQuoteV2Catalog('roller','2026-09-20',r[0].selection.catalogVersion)).toBe(true);deriveRollerCommonValances(r);expect(r[0].selection.configuration[RECORD]).toMatchObject({groupHardware:null});
 });
 it('rebuilds separate-valance hardware from selected members and retains historical r1',()=>{
  const v:SelectionContext={...shade(),productId:ROLLER_SEPARATE_VALANCE,programId:`${ROLLER_SEPARATE_VALANCE}_source`,catalogVersion:quoteV2CatalogVersionFor(ROLLER_SEPARATE_VALANCE,'2026-09-20'),widthInches:0,heightInches:0,configuration:{[ROLLER_VALANCE_KEY]:{...emptyRollerValance(),style:'4.5-inch Square Fascia',width:72,fasciaColor:'White',mount:'Outside',returnLength:3,associatedLineIds:['a','b']}}};
  const members=rows();members.forEach(row=>row.selection.configuration={...row.selection.configuration,roller_application:'Single Shade'});
  deriveRollerSeparateValances([{lineId:'v',selection:v},...members]);expect(v.configuration[ROLLER_VALANCE_DERIVED]).toMatchObject({groupHardware:{requiredTubeInches:2,associatedMountingBracketSize:'large'}});
  v.catalogVersion='805-v2-norman-roller-valance-2026-09-20-r1';expect(isRecognizedQuoteV2Catalog(v.productId,v.catalogAsOf,v.catalogVersion)).toBe(true);deriveRollerSeparateValances([{lineId:'v',selection:v},...members]);expect(v.configuration[ROLLER_VALANCE_DERIVED]).toMatchObject({groupHardware:null});
 });
});
