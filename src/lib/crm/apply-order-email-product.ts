import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmAuthError } from './auth';
import { objectMeta } from './measure-needed-state';
import { buildOperationsItems, productCompletionSourceLinks, type OperationsItem, type ProductProgress } from './operations-overview';
import { orderCostKey, productOrderCosts } from './product-order-cost';
import { saveProductOrderCost } from './save-product-order-cost';
import type { CrmDashboardData, CrmOrderCogsEmail } from './types';

/** Never infer an allocation across a mixed-product order from the invoice total. */
export function selectOrderEmailProduct(items: OperationsItem[], email: CrmOrderCogsEmail, manufacturer: string | null | undefined) {
  const matches = items.filter(item => {
    if (!item.sold || item.archived) return false;
    const { row, quote, job } = item.source;
    const quoteId = quote?.id || row?.quoteId;
    const jobId = job?.id || row?.jobId || quote?.job_id;
    if (email.matched_quote_id && email.matched_quote_id !== quoteId) return false;
    if (email.matched_job_id && email.matched_job_id !== jobId) return false;
    if (email.matched_bookkeeping_entry_id && email.matched_bookkeeping_entry_id !== row?.costRecordId && email.matched_bookkeeping_entry_id !== row?.id) return false;
    return Boolean(email.matched_quote_id || email.matched_bookkeeping_entry_id || email.matched_job_id);
  });
  if (matches.length !== 1) throw new CrmAuthError(409, 'Order email needs one exact active sale before COGS can be applied.');
  const item = matches[0];
  const products = item.products;
  const simple = (product: ProductProgress) => !/[,/&+]|\band\b/i.test(product.name);
  let product: ProductProgress | undefined;
  if (manufacturer === 'Onyx') {
    const shutters = products.filter(p => simple(p) && /\bshutters?\b/i.test(p.name));
    if (shutters.length === 1) product = shutters[0];
  } else if (products.length === 1 && simple(products[0])) {
    product = products[0];
  }
  if (!product) throw new CrmAuthError(409, 'Allocate this invoice to its product in Job status; the email does not identify one unambiguous product group.');
  // A generated job product must not hide multiple product types in the signed contract.
  if (product.records.some(r => r.id.startsWith('job-product-')) && item.headerProducts.length > 1) {
    throw new CrmAuthError(409, 'The signed contract contains multiple products. Allocate the invoice in Job status.');
  }
  return { item, product };
}

function costParent(item: OperationsItem) {
  const { row, quote, job } = item.source;
  if (row?.costRecordId) return { meta: row.costMeta, updatedAt: row.costRecordUpdatedAt };
  if (quote) return { meta: quote.meta, updatedAt: quote.updated_at };
  if (row) return { meta: row.costMeta, updatedAt: row.costRecordUpdatedAt };
  return { meta: job?.meta, updatedAt: job?.updated_at };
}

export function orderEmailRequestId(mailbox: string, vendor: string, reference: string, saleId: string) {
  const hex = createHash('sha256').update(JSON.stringify([mailbox.toLowerCase(), vendor.toLowerCase(), reference.toLowerCase(), saleId])).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

export async function applyOrderEmailProduct(
  db: SupabaseClient, email: CrmOrderCogsEmail, manufacturer: string | null | undefined,
  actor: { email: string; userId?: string },
  loadDashboard?: () => Promise<CrmDashboardData>,
) {
  // Use the same source and grouping rules as the visible Job status screen.
  const load = loadDashboard || (async () => (await import('./backend')).loadCrmDashboardData(db));
  const before = selectOrderEmailProduct(buildOperationsItems(await load()), email, manufacturer);
  const parent = costParent(before.item);
  const amount = Number(email.extracted_order_amount);
  const reference = email.extracted_order_number?.trim();
  if (!manufacturer || !reference || !Number.isFinite(amount) || amount <= 0 || !parent.updatedAt) throw new CrmAuthError(409, 'A verified vendor, order number, amount, and current sale are required.');
  const key = orderCostKey(before.product.records);
  const costs = productOrderCosts(parent.meta);
  const previous = costs[key];
  const sameInvoice = previous && previous.reference.toLowerCase() === reference.toLowerCase() && Math.abs(previous.amount - amount) < .005;
  if (previous && !sameInvoice) throw new CrmAuthError(409, 'This product already has another invoice or amount. Review it before adding or replacing COGS.');
  if (previous && !previous.emailId) throw new CrmAuthError(409, 'This order already has a manual product cost. Reconcile its invoice in Job status.');
  if (!previous && Object.entries(costs).some(([otherKey, cost]) => otherKey !== key && (cost.emailId === email.id || cost.reference.toLowerCase() === reference.toLowerCase()))) {
    throw new CrmAuthError(409, 'This invoice is already allocated to another product. Review the remaining allocation.');
  }
  const meta = objectMeta(parent.meta);
  const included = Boolean(email.applied_at || objectMeta(email.raw).duplicateApplied ||
    (Array.isArray(meta.orderCogsMessageIds) && meta.orderCogsMessageIds.includes(email.gmail_message_id)) ||
    (Array.isArray(meta.orderCogsOrderRefs) && meta.orderCogsOrderRefs.includes(reference)));
  await saveProductOrderCost(db, {
    step: 'ordered', records: before.product.records.map(record => ({ ...record })),
    ...productCompletionSourceLinks(before.item, before.product),
    costEntryId: before.item.source.row?.costRecordId,
    invoice: { amount, reference, emailId: previous?.emailId || email.id, includedInCogs: included,
      expectedUpdatedAt: parent.updatedAt,
      requestId: previous?.requestId || orderEmailRequestId(email.mailbox_email, manufacturer, reference, before.item.source.id) },
  }, actor);
  const after = selectOrderEmailProduct(buildOperationsItems(await load()), email, manufacturer);
  const saved = productOrderCosts(costParent(after.item).meta)[key];
  if (!after.product.ordered || !saved || Math.abs(saved.amount - amount) > .005 || saved.reference !== reference) {
    throw new CrmAuthError(502, 'Invoice saved, but COGS and the Ordered check could not both be verified. It will be retried.');
  }
  return { addedCogs: previous || included ? 0 : amount, totalCogs: after.item.source.cogs || 0 };
}
