# 805 Shutters Meta launch preparation

Status: creative exports prepared, tracking implemented and deployed to isolated Preview, real bookings completed. Browser/CAPI transport, matching event IDs, staging UTMs, and 24-hour duplicate protection pass. Meta Events Manager confirms processed PageView plus Browser and Server Schedule with matching event IDs. Preview verification is complete; production and ads remain unchanged.

## Creative exports

Six selected originals are unchanged. JPG quality 85, embedded sRGB. Flattened source artwork has edge-to-edge text: exports preserve the full design with ivory padding instead of destructive square crops.

| File | Dimensions | Bytes |
|---|---|---:|
| ad-layered-shades-1x1.jpg | 1080 × 1080 | 210,531 |
| ad-layered-shades-4x5.jpg | 1080 × 1350 | 290,009 |
| ad-exterior-shades-1x1.jpg | 1080 × 1080 | 232,153 |
| ad-exterior-shades-4x5.jpg | 1080 × 1350 | 319,783 |
| ad-shutters-1x1.jpg | 1080 × 1080 | 153,992 |
| ad-shutters-4x5.jpg | 1080 × 1350 | 209,725 |
| ad-roman-shades-1x1.jpg | 1080 × 1080 | 203,838 |
| ad-roman-shades-4x5.jpg | 1080 × 1350 | 285,935 |
| ad-drapery-1x1.jpg | 1080 × 1080 | 200,724 |
| ad-drapery-4x5.jpg | 1080 × 1350 | 273,459 |
| ad-woven-shades-1x1.jpg | 1080 × 1080 | 236,805 |
| ad-woven-shades-4x5.jpg | 1080 × 1350 | 324,716 |

The same asset pair supports both Meta button variants. Book Now goes to `/book-consultation/` with UTMs. Call Now uses +1 805-806-9344 and does not produce a website Schedule conversion until a booking is actually completed.

## Preview verification — September 27, 2026

Tested Preview: https://805-lixbqrwgh-805-shutters.vercel.app

Booking URL: https://805-lixbqrwgh-805-shutters.vercel.app/book-consultation/?utm_source=test&utm_medium=cpc&utm_campaign=verify

Deployed code: `c6ca2ec8`, branch `codex/meta-static-launch`, deployment `dpl_EhmDydHTqJSScqr62PiLbN6mWyfo` (Ready, Preview). Production and main remain untouched; no ads launched.

| Check | Result | Evidence |
|---|---|---|
| Runtime configuration | PASS | Dataset 549342503537516; both Meta secrets and database keys present; isolated database; customer notifications disabled. Presence-only endpoint exposes no credentials. |
| Booking PageView | PASS | Correct-dataset request recorded in browser resource timing. |
| Automatic browser Schedule | PASS | Real form booking produced POST to facebook.com/tr/, HTTP 200; payload ev=Schedule, id=549342503537516, eid=529ac641-7fde-4368-9339-e4c8a1c156d4. |
| CAPI Schedule and matching ID | PASS | Staging outbox sent, eventsReceived=1, testEvent=true, accepted 2026-09-27T21:32:08.910Z; same event ID as browser and CRM lead. |
| Staging lead and UTMs | PASS | Lead 529ac641-7fde-4368-9339-e4c8a1c156d4 has utm_source=test, utm_medium=cpc, utm_campaign=verify. utm_content is null because the requested URL omitted it. |
| 24-hour duplicate protection | PASS | Fresh second submission for the original contact at a different available time returned HTTP 409 and the 24-hour warning. Original lead and CAPI outbox counts both remained 1. Form controls locked while submitting. |
| Events Manager receipt verification | PASS | Dataset 549342503537516 displays PageView Processed, Browser Schedule Processed and Server Schedule Processed. Both Schedule IDs are a0200beb-d347-4521-afc8-f9ad702bbc8f; server user-data keys are Email and Phone only. |

## Configuration and safeguards

- Correct dataset is **549342503537516 (805 pixel)**. Legacy environment IDs cannot override it.
- CAPI-only token generated with the user's approval, without Dataset Quality API permissions. Token and test code saved only as Vercel Preview secrets; values excluded from files and reports.
- Existing isolated Supabase branch `lead-stage-events-preview` (`uivuqlrrgyjjbvcuhstr`) supplies branch-specific Preview overrides. Production project `evuxqsaucmvgyuvjpqlo` is blocked by Preview guards.
- Migration `20260927194921_meta_booking_launch.sql` applied to staging only; installed guard and migration ledger verified.
- `BOOKING_DELIVERY_ENABLED=false` and `NEXT_PUBLIC_TELEGRAM_VISITOR_ALERTS_ENABLED=false` in this Preview branch. CAPI delivery remains independent of paused customer notifications.
- CAPI customer matching includes SHA-256 email and phone only. No IP, user agent, cookies, name, address, or URL query parameters in its customer payload.
- Atomic booking transaction writes lead, job, calendar, quote, idempotency result, and outbox. Failure logging uses sanitized identifiers/codes.
- Three clearly labeled synthetic bookings remain in staging for review. One diagnostic retry used the second booking's existing event ID; final proof uses the third booking's automatic browser event.
- Existing staging rows were preserved. Supabase dashboard labels the pre-existing branch Unhealthy, but SQL, REST, migration, and real booking writes worked; this does not certify unrelated branch services.

## Validation and release state

Focused dataset suite: 34 passed. Earlier focused booking/tracking suite: 148 passed. Real PostgreSQL concurrency suite: 8 passed. Preview isolation: 4 passed. New Preview presence route: 2 passed. Typecheck and Vercel build passed. Full-suite history and detailed hosted evidence are in `meta-static-launch-verification.json`.

All requested Preview checks passed with real browser bookings. The initial Meta dashboard HTTP 500/stale test view resolved after opening a fresh Test Events tab. The original booking shown in Events Manager was independently verified in staging with the expected UTMs and one accepted CAPI outbox row. Matching IDs were verified; no aggregate deduplication-rate claim is made. Production deployment and paid-ad launch remain separate, unauthorized actions.
