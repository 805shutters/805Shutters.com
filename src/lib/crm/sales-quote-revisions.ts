import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmAuthError } from './auth';

export type QuoteRevisionRequest = {
  action: 'delete' | 'manual-price'; lineItemId: string; variant?: string; unitPrice?: number;
  expectedRevision: number | null; requestId: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseQuoteRevisionBody(value: unknown): QuoteRevisionRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CrmAuthError(400, 'A revision action is required.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['action', 'lineItemId', 'variant', 'unitPrice', 'expectedRevision', 'requestId'].includes(key)) || !['delete', 'manual-price'].includes(String(body.action))) throw new CrmAuthError(400, 'Choose a line deletion or a custom price.');
  for (const key of ['lineItemId', 'requestId']) if (typeof body[key] !== 'string' || !uuid.test(body[key])) throw new CrmAuthError(400, `${key} is invalid.`);
  if (body.expectedRevision != null && (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0)) throw new CrmAuthError(400, 'Quote revision is invalid.');
  if (body.action === 'manual-price') {
    if (typeof body.variant !== 'string' || !body.variant.trim() || body.variant.length > 80) throw new CrmAuthError(400, 'Choose a line design.');
    if (typeof body.unitPrice !== 'number' || !Number.isFinite(body.unitPrice) || body.unitPrice < 0) throw new CrmAuthError(400, 'Enter a price of $0 or more.');
  } else if (body.variant !== undefined || body.unitPrice !== undefined) throw new CrmAuthError(400, 'Deletion cannot include a price.');
  return { action: body.action as QuoteRevisionRequest['action'], lineItemId: body.lineItemId as string, requestId: body.requestId as string,
    expectedRevision: body.expectedRevision as number | null ?? null,
    ...(body.action === 'manual-price' ? { variant: (body.variant as string).trim(), unitPrice: Math.round(((body.unitPrice as number) + Number.EPSILON) * 100) / 100 } : {}) };
}
export async function createSalesQuoteRevision(db: SupabaseClient, actorId: string, quoteId: string, input: QuoteRevisionRequest) {
  if (!uuid.test(quoteId)) throw new CrmAuthError(400, 'A valid source quote is required.');
  const { data, error } = await db.rpc('create_sales_quote_revision', {
    p_source_id: quoteId, p_actor_id: actorId, p_request_id: input.requestId, p_expected_revision: input.expectedRevision,
    p_action: input.action, p_line_item_id: input.lineItemId, p_variant: input.variant ?? null, p_unit_price: input.unitPrice ?? null,
  });
  if (error) throw new CrmAuthError(error.code === '42501' ? 403 : 409, error.message);
  return data;
}
