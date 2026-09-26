import { describe, expect, it } from 'vitest';
import { squarePaymentMessage, validPaymentAmount } from './customer-payment-request';
import { buildSquareOrderPaymentEmail } from '@/lib/notify/email';

describe('customer payment review', () => {
  it.each([0, 0.000000001, -5, NaN, Infinity, 3.001, '50', null])('rejects invalid money %s', value => expect(validPaymentAmount(value)).toBe(false));
  it.each([0.01, 725.5, 6400])('accepts exact cents %s', value => expect(validPaymentAmount(value)).toBe(true));
  it.each([
    { paymentType: 'deposit' as const, amount: 3200 },
    { paymentType: 'balance' as const, amount: 3200 },
    { paymentType: 'balance' as const, amount: 6400, fullAmount: true },
    { paymentType: 'balance' as const, amount: 725.5, customAmount: true },
  ])('previews the exact delivered email text and subject for %j', details => {
    const preview = squarePaymentMessage('Alex Sample', '[Secure payment link]', details);
    const email = buildSquareOrderPaymentEmail('Alex Sample', 'https://square.example/pay', details);
    expect(email.text).toBe(preview.text.replace('[Secure payment link]', 'https://square.example/pay'));
    expect(email.subject).toBe(preview.subject);
  });
});
