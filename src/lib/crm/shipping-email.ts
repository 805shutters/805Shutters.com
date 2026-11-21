import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmAuthError } from './auth';
import { normalizedProductLabel } from './product-workflow-groups';
import { buildOperationsItems, productCompletionSourceLinks, type OperationsItem } from './operations-overview';
import { orderCostKey, productOrderCosts } from './product-order-cost';
import { completeProductMilestone } from './product-completion';
import type { CrmDashboardData } from './types';
import type { ShipmentEvidence } from './shipment-evidence';
export { extractShippingNotice, shippingOrderReferences, type ShippingNotice } from './shipping-notice';
import type { ShippingNotice } from './shipping-notice';

function parentMeta(item: OperationsItem) { return item.source.row?.costMeta || item.source.quote?.meta || item.source.job?.meta; }
/** Exact vendor order to exact product allocation. A customer name cannot ship a whole mixed job. */
export function selectShipmentProduct(items: OperationsItem[], notice: ShippingNotice, reference: string) {
  const matches = items.flatMap(item => {
    if (!item.sold || item.archived) return [];
    const costs = productOrderCosts(parentMeta(item));
    return item.products.filter(product => {
      if (product.manufacturer && product.manufacturer.toLowerCase() !== notice.manufacturer.toLowerCase()) return false;
      const allocation = costs[orderCostKey(product.records)];
      if (allocation?.reference.trim().toLowerCase() === reference.toLowerCase()) return true;
      // Older imports allocated one signed product under a generated job key.
      // This identifies shipment only; conflicting manual costs are not replaced.
      const jobId = item.source.job?.id || item.source.row?.jobId || item.source.quote?.job_id;
      const legacy = jobId ? costs[`job-product-${jobId}`] : undefined;
      if (item.products.length === 1 && item.headerProducts?.length === 1
        && normalizedProductLabel(item.headerProducts[0].name) === normalizedProductLabel(product.name)
        && legacy?.reference.trim().toLowerCase() === reference.toLowerCase()) return true;
      // A sale-level reference is sufficient only for one explicitly labelled supplier/product.
      return item.products.length === 1 && product.manufacturer?.toLowerCase() === notice.manufacturer.toLowerCase()
        && item.source.orderReference?.trim().toLowerCase() === reference.toLowerCase();
    }).map(product => ({item,product}));
  });
  if (matches.length !== 1) throw new CrmAuthError(409, 'Shipment order reference must identify one exact product allocation.');
  return matches[0];
}

export async function applyShippingNotice(db: SupabaseClient, notice: ShippingNotice, source: {mailbox: string; messageId: string; sentAt: string | null}, actor: {email:string}, loadDashboard?:()=>Promise<CrmDashboardData>) {
  if (!notice.references.length) return [{reference:'',status:'needs_review' as const,reason:'Shipping notice has no recognized manufacturer order references; identify the exact order before applying it.'}];
  if (!['805@805shutters.com','805shutters@gmail.com'].includes(source.mailbox) || !source.sentAt) throw new CrmAuthError(409, 'A verified shipping mailbox and notification timestamp are required.');
  const load = loadDashboard || (async()=> (await import('./backend')).loadCrmDashboardData(db));
  const outcomes: {reference:string;status:'matched'|'needs_review'|'error';reason:string}[]=[];
  for (const reference of notice.references) {
    try {
      const {item,product} = selectShipmentProduct(buildOperationsItems(await load()),notice,reference);
      const shipment:ShipmentEvidence = {shippedOn:notice.shippedOn,notifiedOn:source.sentAt.slice(0,10),mailbox:source.mailbox as ShipmentEvidence['mailbox'],messageId:source.messageId,orderReference:reference,...(notice.carrier?{carrier:notice.carrier}:{}),...(notice.trackingNumber?{trackingNumber:notice.trackingNumber}:{})};
      await completeProductMilestone(db,{step:'shipped',records:product.records,...productCompletionSourceLinks(item,product),shipment},actor);
      const after = selectShipmentProduct(buildOperationsItems(await load()),notice,reference);
      if (!after.product.shipped || !after.product.shipments?.some(saved=>saved.orderReference===reference && (!notice.shippedOn || saved.shippedOn===notice.shippedOn))) throw new CrmAuthError(502,'Saved shipment could not be verified in Job status.');
      outcomes.push({reference,status:'matched',reason:notice.shippedOn?'Shipment and vendor dispatch date verified.':'Shipment confirmed; vendor did not supply a dispatch date.'});
    } catch(error) {
      outcomes.push({reference,status:error instanceof CrmAuthError && error.status<500?'needs_review':'error',reason:error instanceof Error?error.message:'Shipment processing failed.'});
    }
  }
  return outcomes;
}
