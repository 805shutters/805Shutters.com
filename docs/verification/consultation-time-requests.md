# Consultation time requests

Approved UI: option 1, request button below standard times. Request view offers
half-hour starts from 8 AM through 6 PM, with conflicts disabled. Standard booking
remains 9 AM–4 PM. Requests require owner confirmation and do not reserve time.

## Plan
- [x] Inspect booking, durable notification queue, and Mike SMS routing.
- [x] Implement request UI, availability, atomic pending request and owner SMS.
- [x] Verify isolated database/API/UI behavior and responsive page/popup paths.
- [x] Run typecheck, full tests, build, and migration safety review.
- [ ] Apply additive migration, push main, deploy and verify live customer path.

## Safety and business behavior
- Request mode bypasses published hours only; existing commitments, same-day
  lead time and daily capacity remain enforced. Travel and final scheduling
  remain subject to owner confirmation. No working hours are changed.
- Save lead + follow-up CRM job + request receipt + one owner-only SMS outbox
  entry in one transaction. No calendar event, quote or customer confirmation.
- Service-only RPC shares the schedule lock and checks revision/conflicts.
- SMS recipient comes from MIKE_805_SALES_SMS_NUMBER, never public input.
- Provider acceptance is recorded separately from customer request receipt;
  ambiguous sends are not automatically retried.

## UI QA inventory
- Page + popup: date selection scrolls to regular 9–4 rows; option 1 sits below.
- Request button opens 21 half-hour starts, 8–6, amber open / gray disabled.
- Back to regular booking restores instant-booking mode.
- Time selection opens contact/project/notes form with request copy.
- Request submit receives pending receipt; retries reuse key, preserve inputs.
- Empty normal month still exposes request button; failed refresh disables starts.
- Desktop, iPad and phone: no horizontal overflow; request controls and notes usable.
- Isolated synthetic request: lead/follow-up job/outbox only, no calendar/quote;
  external delivery mocked or suppressed. No production test customer created.

## Pre-release evidence (2026-09-26)
- Desktop 1440×1000, iPad 820×1180, phone 390×844: reviewed request timeline,
  contact form, optional quantities/coverings/notes and pending receipt.
- Phone homepage popup follows the same request path. No horizontal overflow;
  keyboard Enter selects a time. No browser runtime errors in tested paths.
- Browser submissions were intercepted; no production test lead or text sent.
- Isolated real Postgres: 7 concurrent authority tests passed, including two
  identical requests producing exactly one lead, follow-up job and SMS effect.
- Initial full suite: 9,307 passed / 30 skipped. Final release gate reruns after
  additional configuration/failure coverage. Typecheck passed.
- Vercel production lists MIKE_805_SALES_SMS_NUMBER plus Twilio SID/token/from
  configuration. Sensitive values are unavailable to env pull; delivery itself
  has not been verified. API fails before saving if runtime config is missing.

## Additional migration safety review
Reviewed additive RPC against current production tables/triggers and isolated
Postgres. No existing rows, functions, constraints, working ranges or policies
are changed. Invoker rights, empty search_path, service_role-only EXECUTE,
parameterized JSON, fixed pending status, owner-only effect and the existing
schedule lock prevent privilege escalation or bypass of booking protections.
Retries match a server-generated hash; conflict/revision/lead-time checks execute
inside the transaction. A failed transaction leaves no partial lead/job/outbox.

- Final focused tests: 57 passed; typecheck and production build passed.
- Production preflight: nine upcoming published working ranges in the next
  fourteen days; no change to those ranges.
- Production migration applied before application publication. Confirmed invoker
  rights and empty search path; anon/authenticated cannot execute, service_role can.
- Post-migration security advisor has no finding naming the new function.
