# Customer Payments in Payment Hub

Customer Payments shares the Customer Info / Payments queue and exact quote/job linkage. The default list shows sold, unarchived orders with money outstanding. All customers also allows review of paid, archived, and unsold records; payment links are disabled for those without an eligible linked sale. Payment History retains the existing transactions, ledger corrections, reconciliation, requests, and payout views.

Staff can request the remaining deposit, remaining balance, entire amount owed, or an exact amount from $0.01 through the total outstanding. The panel shows the recipient, chosen channel, amount and actual message copy before the explicit send action. Full/custom requests retain the existing balance payment classification; the shared ledger still allocates received money against the deposit first. Creating a link does not record a receipt.

## Payment safety review

- Existing CRM authentication, exact quote/job checks, contact preferences, server ledger checks, and Square integration remain authoritative.
- Received payments and transferred credits reduce the amount available to request. The server rejects changed full amounts, malformed currency, and custom amounts above the current outstanding amount before provider calls.
- One durable request key freezes customer, amount and channel for an attempted send. Rechecking the same attempt cannot silently resend or switch providers. Acceptance and delivery remain distinct.
- No migration, credential, pricing, refund, ledger allocation, or webhook changes are required.
- Local browser fixtures use synthetic customers and mocked providers. Production verification reviews the interface and amount choices without sending customer messages.

Validation includes amount and API tests, existing mobile and payment-history regression tests, duplicate/uncertain-send browser coverage, and layouts at 1440, 1024 and 390 pixels, plus repository typecheck, full tests and production build.
