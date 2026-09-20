import { expect, it } from "vitest";
import { lookupSundanceOptionSourceGrid, sundanceOptionGrids } from "./option-grids";
import { sundanceCatalog } from "./catalog";

it("keeps seven supplemental grids separate from standalone shade programs", () => {
  expect(sundanceOptionGrids).toHaveLength(7);
  for (const option of sundanceOptionGrids) {
    expect(option.customerPriceEligible).toBe(false);
    expect(sundanceCatalog.products.flatMap(p => p.programs).some(p => p.id === option.id)).toBe(false);
    expect(option.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(lookupSundanceOptionSourceGrid(option.productId, option.id, 96.0625, 108)).toBeNull();
    expect(lookupSundanceOptionSourceGrid(option.productId, option.id, 96, 108.0625)).toBeNull();
    expect(lookupSundanceOptionSourceGrid('sundance_cellular', option.id, 24, 36)).toBeNull();
  }
});

// Read independently from the rendered guides: Premier PDF20/21 and Select PDF19.
it.each([
  ['premier',20,1,34,377], ['premier',20,2,37,396],
  ['premier',21,1,38,113], ['premier',21,2,49,147],
  ['select',19,1,34,377], ['select',19,2,37,396], ['select',19,3,38,113],
] as const)("matches first and last %s option PDF%s table%s", (family,page,table,first,last) => {
  const product = `sundance_walden_${family}`;
  const option = `${product}_option_p${page}_t${table}`;
  expect(lookupSundanceOptionSourceGrid(product, option, 24, 36)?.sourceRetail).toBe(first);
  expect(lookupSundanceOptionSourceGrid(product, option, 96, 108)?.sourceRetail).toBe(last);
});

it("rounds up source axes without authorizing a charge or losing an exception", () => {
  expect(lookupSundanceOptionSourceGrid('sundance_walden_select','sundance_walden_select_option_p19_t3',24.0625,36.0625))
    .toMatchObject({sourceRetail:48,gridWidth:30,gridHeight:48,customerPriceEligible:false});
  expect(sundanceOptionGrids.find(o => o.id==='sundance_walden_select_option_p19_t3')?.notes)
    .toContain('No edge-binding surcharge for fabrics that require edge binding.');
});
