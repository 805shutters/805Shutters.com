# Mobile Square payment links

The CRM mobile Customer Info / Payments screen uses the same exact quote/job balance calculation and Square link generator as the desktop Command Center. It adds a mobile-specific governed send ledger so a repeated tap cannot create another customer message.

## Send contract

1. The user selects a specific customer order and either deposit or balance.
2. The confirmation displays the exact amount, an order-ID suffix, and privacy-masked text and email destinations.
3. The user explicitly chooses one eligible channel and confirms one send. There is no fallback and the system never sends both channels.
4. The server re-verifies exact quote/job identity, current ledger balance, exact agreement between quote and job contact values, and SMS/email opt-out state.
5. A unique request is durably reserved before Square or a delivery provider is called.

The UI distinguishes link creation and provider acceptance from delivery. `accepted` means Resend or Twilio returned a provider identifier/accepted state; it does not mean the recipient received the message. Network ambiguity is stored as `unknown`, deterministic rejection as `failed`, and neither state is automatically retried. An accepted request replay returns its existing result without creating another link or customer message. A mismatched request key always fails closed.

The request ledger is internal audit data. It does not schedule sends, expose a public write policy, charge a card, record a payment, or change an order balance.

## Operations

- Review `crm_payment_link_send_requests` and the matching `crm_activity_events` record before any reviewed resend after `failed` or `unknown`.
- Never interpret provider acceptance as delivery. Twilio terminal delivery callbacks are a separate observability path; email delivery remains provider-side unless a webhook is added later.
- Live verification must stop at the confirmation dialog and must not use a real customer send.
