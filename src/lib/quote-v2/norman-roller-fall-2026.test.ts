import { describe, expect, it } from 'vitest';
import { normanRollerFabricColors } from '@/lib/quote/norman-roller-fabrics';
import { NORMAN_ROLLER_FALL_2026 } from '@/lib/quote/norman-roller-fall-2026';
import { resolveRollerOffering, resolveRollerMatrixProfile, validateRollerMatrix } from './roller-matrix';
import { quoteV2CatalogVersionFor } from './catalog';
import { priceQuoteV2Selection } from './engine';
import type { SelectionContext } from './core';
import { normanRollerFall2026Source } from './generated/norman-roller-fall-2026.generated';
import { getRollerPrice as getV1Price } from '@/mts-quote-v1/lib/pricingEngine';
import { getRollerPrice } from '@/mts-quote/lib/pricingEngine';

describe('Fall colors in the current protected quote pipeline', () => {
 it('resolves all 90 exact identities, profiles and prices while rejecting out-of-limit configurations', () => {
  for (const row of NORMAN_ROLLER_FALL_2026.colors) {
   const color=normanRollerFabricColors.find(c=>c.colorCode===row.colorCode)!;
   const context: SelectionContext={ manufacturerId:'norman',productId:'roller',programId:color.programId,
    catalogAsOf:'2026-09-12',catalogVersion:quoteV2CatalogVersionFor('roller','2026-09-12'),
    widthInches:36,heightInches:60,quantity:1,options:{},configuration:{
     mount_type:'Inside Mount',roller_application:'Single Shade',lift_system:'Cordless',
     fabric_collection:row.collection,fabric_color_code:row.colorCode,roller_top_treatment:'No Top Treatment',roller_tube:'All Tubes',
    }};
   expect(resolveRollerOffering(context),row.colorCode).toMatchObject({ok:true,offering:{collection:row.collection,colorCode:row.colorCode}});
   expect(resolveRollerOffering({...context,catalogAsOf:'2026-08-31'}).ok).toBe(false);
   const profile=resolveRollerMatrixProfile(context);
   expect(profile.ok,row.colorCode).toBe(true);
   expect(validateRollerMatrix(context).filter(x=>x.severity==='hard_block'),row.colorCode).toEqual([]);
   if(profile.ok) {
    expect(validateRollerMatrix({...context,widthInches:profile.profile.limits.maxWidth!+.125}).some(x=>x.severity==='hard_block')).toBe(true);
    expect(validateRollerMatrix({...context,heightInches:11.875}).some(x=>x.severity==='hard_block')).toBe(true);
   }
   const price=priceQuoteV2Selection({selection:context,priceInput:{productId:'roller',programId:color.programId!,fabric:row.collection,widthInches:36,heightInches:60}});
   expect(price.ok,`${row.colorCode}: ${JSON.stringify(price)}`).toBe(true);
   const options={fabric:row.collection,catalogProgramId:color.programId!,width:36,height:60};
   expect(getV1Price(options),row.colorCode).toBe(getRollerPrice(options));
  }
 });
 it('retains exact source references and only complete assignments from all twelve application sheets',()=>{
  expect(normanRollerFall2026Source.offerings).toHaveLength(76);
  expect(normanRollerFall2026Source.limitRows).toHaveLength(192);
  expect(normanRollerFall2026Source.profileAssignments).toHaveLength(2304);
  expect(new Set(normanRollerFall2026Source.limitRows.map(r=>r.sheet)).size).toBe(12);
  for(const assignment of normanRollerFall2026Source.profileAssignments){
   const profile=normanRollerFall2026Source.limitProfiles.find(p=>p.id===assignment.profileId)!;
   const definition=normanRollerFall2026Source.profileDefinitions.find(d=>d.id===assignment.profileDefinitionId)!;
   expect(definition.usable).toBe(true);
   for(const metric of ['minWidth','maxWidth','minHeight','maxHeight']) {
    expect(profile.limits[metric]).toBeTypeOf('number');
    expect(assignment.sourceCells[metric]).toMatch(/^[A-Z]+\d+$/);
   }
  }
 });
});
