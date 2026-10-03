# 805 owner alert sender separation

Scope: existing alerts to Mike only. The destination, message text, trigger, schedule, and delivery/audit behavior remain unchanged. No customer or contractor messaging, public contact information, inbound webhook, phone-call routing, CRM inbox, consent, or database changes.

## Local implementation

`sendSms` accepts an internal `ownerAlert` flag. Only flagged requests explicitly set `From=+18057931853`, including when a Messaging Service is supplied. Unflagged requests retain the exact existing service/from selection. The separate booking-staff and in-house payment-plan HTTP senders apply the same override only to the owner alert.

| Existing alert | Owner-only selection |
| --- | --- |
| Meta completed booking | Existing `MIKE_805_SALES_SMS_NUMBER` destination |
| Consultation time request | Existing Mike recipient |
| Calendar assignment | Only the recipient labeled Mike |
| Weekly sales report | Only the recipient labeled Mike; Jessica remains unchanged |
| Signed-sale notification | Existing primary owner recipient; staff remain unchanged |
| Square payment alert | Existing `SQUARE_OWNER_ALERT_TO` destination |
| Voice-agent owner SMS | Existing owner alert recipient; no phone-call or callback route changes |
| Staff booking, Meta lead, Ask 805 text question | Only list entries matching configured `MIKE_805_SALES_SMS_NUMBER` |
| Appointment reply forwarded as an owner alert | Only if existing forwarding destination matches configured Mike number; inbound handler unchanged |
| Overdue/bookkeeping and legacy payment-plan owner alerts | Only staff-list entries matching configured Mike number |
| New in-house plan notification | Existing `owner` channel; customer `sms` and email channels unchanged |

Mixed-recipient lists do not infer ownership from an old public number. If `MIKE_805_SALES_SMS_NUMBER` is absent/invalid, those lists retain their existing routing; release verification must confirm it resolves to Mike's already-verified personal phone. Existing fallback recipients are not replaced or supplemented.

## Verification and release checklist

- [x] Remove superseded customer/inbox/public-contact/inbound/voice-route edits.
- [x] Add mocked transport checks: exact same To/Body/callback, owner From fixed, customer service-only and direct-From requests unchanged.
- [x] Add mixed-recipient checks for booking/calendar/signed-sale/weekly-sales alerts.
- [x] Complete final typecheck, full tests, production build and diff review. Typecheck/build pass; 779 test files pass (5 skipped), 9,836 tests pass (31 skipped). Final diff contains owner-alert sender selection, its tests, and this note only.
- [ ] Publish only after the coordinated release authorization. This task does not push or deploy.
- [ ] Verify active 805 production credentials, the existing personal recipient, and ownership/SMS capability of +18057931853. If a Messaging Service is configured, verify that number is already in its sender pool. Do not change shared service membership, inbound routing, voice routing, or campaign settings.
- [ ] Coordinate the equivalent MTS owner-only sender patch for the existing owned number ending 3731. No customer sender or inbound cutover is part of this release.
- [ ] Observe naturally occurring owner alerts: provider From must be the business-specific number, To must be the unchanged personal recipient, then verify delivered status and Mike's two separate conversations. No test SMS or calls.

The live 805 health endpoint read on October 3, 2026 identified backend `evuxqsaucmvgyuvjpqlo.supabase.co` and reported SMS configured. Authenticated Vercel reads confirmed project `805` (`prj_9FjieADQHKAnV3vWlhY2tHbZbcuc`) and its READY production deployment `dpl_BZdW33ybi3CFm3CTXXfmUcoLHieM`, also serving `www.805shutters.com`. Vercel listed the production Twilio and Mike-recipient variable names. Both `vercel env run` and the individual environment-variable read returned an empty Mike value; a deployment-specific environment pull failed. These reads do not establish the effective deployed recipient or prove that production configuration is empty. No credentials were retained or printed. No provider setting or production data was changed.

The coordinating MTS task reported provider delivery evidence for its existing personal recipient ending **5555**. Existing 805 source constants for Square-owner alerts and the primary sold-quote fallback also end in **5555**, but those constants are not independent evidence of the effective production environment. A common live recipient remains unverified here; do not change any destination to resolve that uncertainty.

Rollback: revert this local owner-alert commit and redeploy through the normal authorized release flow. No migration or provider rollback is needed because this change modifies neither. Previous shared sender selection would resume, so coordinate with the MTS owner-alert release.
