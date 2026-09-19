import { expect, it } from 'vitest';
import { normalizeSquareObject, squareFinanceTotals, squareListPath } from './square-reporting';
const ctx = { environment: 'production', merchantId: 'm1', locationId: 'l1' };
const base = { id: 'payment1', location_id: 'l1', status: 'COMPLETED', total_money: { amount: 10000, currency: 'USD' }, created_at: '2026-09-18T12:00:00Z', card_details: { sensitive: 'must not persist' } };
it('keeps gross credit, unknown fees and refunds distinct, and strips card information', () => {
 const payment = normalizeSquareObject('payment', base, ctx);
 expect(payment.amount_cents).toBe(10000); expect(payment.fee_cents).toBeNull();
 expect(JSON.stringify(payment)).not.toContain('card_details');
 const updated = normalizeSquareObject('payment', { ...base, processing_fee: [{ amount_money: { amount: 290, currency: 'USD' } }], refunded_money: { amount: 2500, currency: 'USD' } }, ctx);
 expect(updated.amount_cents).toBe(10000); expect(updated.fee_cents).toBe(290); expect(updated.details.refunded_cents).toBe(2500);
 const payout = normalizeSquareObject('payout', { ...base, id: 'po1', status: 'PAID', amount_money: { amount: 9710, currency_code: 'USD' } }, ctx);
 const totals = squareFinanceTotals([updated, payout], [{ square_payment_id: base.id, amount_cents: 10000 }]);
 expect(totals.completedGrossCents).toBe(10000); expect(totals.knownFeeCents).toBe(290); expect(totals.assignedGrossCents).toBe(10000);
});
it('preserves signed payout entry net and rejects wrong locations or invalid money', () => {
 const entry = normalizeSquareObject('payout_entry', { id: 'pe1', type: 'REFUND', created_at: base.created_at, net_amount_money: { amount: -48, currency_code: 'USD' }, gross_amount_money: { amount: -50, currency_code: 'USD' }, fee_amount_money: { amount: -2, currency_code: 'USD' }, type_refund_details: { payment_id: base.id } }, { ...ctx, payoutId: 'po1' });
 expect(entry.amount_cents).toBe(-48); expect(entry.payment_id).toBe(base.id);
 expect(() => normalizeSquareObject('payment', { ...base, location_id: 'other-company' }, ctx)).toThrow('location');
 expect(() => normalizeSquareObject('payment', { ...base, total_money: { amount: 0.1, currency: 'USD' } }, ctx)).toThrow('invalid money');
});
it('filters every reporting list to the configured location and retains history/cursor', () => {
 const u = new URL(squareListPath('payment', 'loc', '2020-01-01T00:00:00Z', base.created_at, 'page2'), 'https://example.test');
 expect(u.searchParams.get('location_id')).toBe('loc'); expect(u.searchParams.get('cursor')).toBe('page2'); expect(u.searchParams.get('begin_time')).toBe('2020-01-01T00:00:00Z');
});
