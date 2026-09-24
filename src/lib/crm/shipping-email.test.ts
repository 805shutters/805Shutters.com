import {describe,it,expect} from 'vitest';
import {extractShippingNotice,selectShipmentProduct} from './shipping-email';
import type {OperationsItem} from './operations-overview';
const notice={manufacturer:'Norman' as const,references:['8880986311'],shippedOn:null};
describe('vendor shipment evidence',()=>{
 it('records Norman shipment without inventing a date from PO date',()=>{
  expect(extractShippingNotice('Shipping Notification: WO#8880986311 has shipped!','WO# : 8880986311\rPO Date: 09/13/2026\rCarrier: FDX IPD\rTracking Number: 544325051407 https://www.fedex.com/','Norman <NoReply@normanusa.com>')).toEqual({...notice,carrier:'FDX IPD',trackingNumber:'544325051407'});
 });
 it('extracts each Onyx order and its explicit dispatch date',()=>{
  expect(extractShippingNotice('Onyx Shipping Notice','Order No. 52608011093 Customer A 52608031094 Customer B SHIP OUT AT 09/22/2026 BY UCFS TRACKING NO. Fhf1imuS Please log in','orders@onyxshutters.com')).toEqual({manufacturer:'Onyx',references:['52608011093','52608031094'],shippedOn:'2026-09-22',carrier:'UCFS',trackingNumber:'Fhf1imuS'});
 });
 it('does not process orders, estimates or spoofed shipping templates',()=>{
  expect(extractShippingNotice('Online Order Confirmation','Ship Via: Air Freight','NoReply@normanusa.com')).toBeNull();
  expect(extractShippingNotice('Re: shipping issues','will redeliver today','cs01@onyxshutters.com')).toBeNull();
  expect(extractShippingNotice('Onyx Shipping Notice','52608011093','orders@onyxshutters.com.evil.test')).toBeNull();
 });
 it('selects the exact product allocation within a mixed job and rejects duplicate references',()=>{
  const product={id:'roller',name:'Roller Shades',manufacturer:'Norman',records:[{id:'p1',updatedAt:'now'}]};
  const item={sold:true,archived:false,source:{row:{costMeta:{product_order_costs:{p1:{amount:100,reference:'8880986311',records:['p1']}}}}},products:[product,{...product,id:'shutters',manufacturer:'Onyx',records:[{id:'p2',updatedAt:'now'}]}]} as unknown as OperationsItem;
  expect(selectShipmentProduct([item],notice,'8880986311').product.id).toBe('roller');
  expect(()=>selectShipmentProduct([item,item],notice,'8880986311')).toThrow('one exact product');
  expect(()=>selectShipmentProduct([item],notice,'unknown')).toThrow();
 });
});
