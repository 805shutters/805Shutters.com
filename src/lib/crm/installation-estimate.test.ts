import { describe, expect, it } from "vitest";
import { installationCost, installationEstimate } from "./installation-estimate";
import { ownerPayableFinancials } from "./owner-payables";
import type { CrmQuote, CrmQuoteLineItem, CrmBookkeepingRow } from "./types";
const line = (id: string, product: string, quantity = 1, details = {}) => ({ id, room: id, quantity, width_in: 48, height_in: 60, selected_design_id: id, designs: [{id, product_id: product === 'Shutters' ? 'norman_shutters' : 'roller', productName: product, details}] }) as unknown as CrmQuoteLineItem;
const quote = (lines: CrmQuoteLineItem[], meta = {}) => ({ id: 'q', lineItems: lines, meta }) as CrmQuote;

describe('installation estimates', () => {
 it('uses measured area, quantity, $50 per tracked opening and $25 per blind/shade', () => {
  const result=installationEstimate(quote([line('shutters','Shutters',2,{track_type:'bifold'}),line('shade','Roller shades',3),line('blind','Wood blinds',2)]));
  expect(result.amount).toBe(405); // 40 sf * 4.50 + 2 tracks * 50 + 5 * 25
  expect(result.lines[0]).toMatchObject({squareFeet:40,trackFee:100,amount:280});
 });
 it.each(['Bypass','open_bypass','bifold_180','Floating 90 Bifold'])('charges a single track fee per opening for %s', track => {
  expect(installationEstimate(quote([line('a','Shutters',1,{track_system:track,track_type:track})])).amount).toBe(140);
 });
 it('reads mirrored legacy and V2 track selections',()=>{
  const legacy=line('a','Shutters'); legacy.designs[0].price_breakdown={optionsJson:{track_type:'Bypass'}};
  const v2=line('b','Shutters',1,{quote_v2_customer_configuration:{track_type:'Bifold'}});
  expect(installationEstimate(quote([legacy,v2])).amount).toBe(280);
 });
 it('does not charge tracks for hinged panel pairs or shade side tracks',()=>{
  expect(installationEstimate(quote([line('a','Shutters',1,{panel_config:'LLRR'}),line('b','Roller shades',1,{track_type:'bypass'})])).amount).toBe(115);
 });
 it('counts accepted units only and avoids applying selections twice after splitting',()=>{
  const lines=[line('a','Shutters',3),line('b','Roller shades',2)];
  expect(installationEstimate(quote(lines,{signed_selection:{lineItemIds:['a#2','b#1']}})).amount).toBe(115);
  expect(installationEstimate(quote([line('a','Shutters')],{signed_selection:{lineItemIds:['old#2']},partial_acceptance:{role:'current'}})).amount).toBe(90);
 });
 it('rejects missing dimensions, ambiguous products, duplicate IDs, invalid selection and missing quantities',()=>{
  const missing=line('a','Shutters');missing.width_in=null;
  for(const q of [quote([missing]),quote([line('a','Roller shades, shutters')]),quote([line('a','Shutters'),line('a','Shutters')]),quote([line('a','Shutters',0)]),quote([line('a','Shutters')],{signed_selection:{lineItemIds:['missing']}})]) expect(installationEstimate(q).amount).toBeNull();
 });
 it('does not use unselected design alternatives',()=>{
  const opening=line('a','Roller shades');opening.designs.push({...opening.designs[0],id:'unused',product_id:'norman_shutters'});
  expect(installationEstimate(quote([opening])).amount).toBe(25);
 });
 it('uses actual invoice instead of estimate and recalculates profit without adding them',()=>{
  const estimate=installationEstimate(quote([line('a','Shutters')]));
  const row={total:1000,cogs:400,installationInvoiceAmount:0,installationEstimate:estimate} as CrmBookkeepingRow;
  expect(installationCost(row)).toMatchObject({amount:90,source:'estimate'});
  expect(ownerPayableFinancials(row)).toMatchObject({profit:410,mike:205,jessica:205});
  const actual={...row,installationInvoiceAmount:120,installationInvoiceDocumentId:'mail-id',installationMatchStatus:'matched' as const};
  expect(installationCost(actual)).toMatchObject({amount:120,source:'invoice'});
  expect(ownerPayableFinancials(actual)).toMatchObject({profit:380,mike:190,jessica:190});
  expect(row.installationInvoiceAmount).toBe(0);
  expect(installationCost({...actual,installationInvoiceAmount:0})).toMatchObject({amount:0,source:'invoice'});
 });
});
