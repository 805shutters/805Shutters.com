import { expect, it } from 'vitest';
import { SQUARE_OWNER_ALERT_TO, squarePaymentAlertBody } from './square-payment-alerts';
it('sends the authorized concise alert to the exact owner number', () => {
 expect(SQUARE_OWNER_ALERT_TO).toBe('+18052985555');
 expect(squarePaymentAlertBody(12345, ['Jane Smith', 'Jane Smith'])).toBe('805 Shutters: Square received $123.45 from Jane Smith.');
 expect(squarePaymentAlertBody(5000, [])).toBe('805 Shutters: Square received $50.00. Customer/job needs review.');
});
