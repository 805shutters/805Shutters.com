import { officialContactLine } from '@/lib/brand-identity';

export type CustomerPaymentChoice = 'deposit' | 'balance' | 'full' | 'custom';
export const paymentMoney = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
export function validPaymentAmount(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0.01
    && Number.isSafeInteger(Math.round(amount * 100))
    && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;
}

/** Shared by the email renderer and staff review; only the real URL is substituted on send. */
export function squarePaymentMessage(customerName: string, url: string, details: {
  paymentType: 'deposit' | 'balance'; amount: number; customAmount?: boolean; fullAmount?: boolean;
}) {
  const name = customerName && customerName !== 'Valued customer' ? customerName : 'there';
  const isDeposit = details.paymentType === 'deposit';
  const isCustom = details.customAmount === true || details.fullAmount === true;
  const label = isCustom ? 'Payment' : isDeposit ? 'Deposit' : 'Balance';
  const amount = paymentMoney(details.amount);
  const subject = `Your 805 Shutters ${isCustom ? 'payment' : isDeposit ? 'deposit' : 'balance'} link - ${amount}`;
  const intro = details.fullAmount
    ? 'Thank you for your order. Please use the secure Square link below to pay the entire amount remaining on your order.'
    : isCustom ? 'Thank you for your order. Please use the secure Square link below to make your scheduled payment.'
    : isDeposit ? 'Here is your deposit information to start your order. Please use the secure Square link below to pay your deposit.'
    : 'Thank you so much for your order. Please use the secure Square link below to pay your remaining balance.';
  const action = isCustom ? 'Make payment through Square' : isDeposit ? 'Pay deposit through Square' : 'Pay balance through Square';
  const text = `Hello ${name},\n\n${intro}\n\n${label} due: ${amount}\n\n${action}: ${url}\n\nThank you,\n805 Shutters\n\n${officialContactLine}`;
  const smsLabel = details.fullAmount ? 'full order' : isCustom ? 'order' : isDeposit ? 'deposit' : 'order balance';
  const sms = `805 Shutters ${smsLabel} payment link (${amount}): ${url}`;
  return { name, isCustom, label, amount, subject, intro, action, text, sms };
}
