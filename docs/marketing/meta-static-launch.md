# 805 Shutters Meta launch preparation

Status: assets exported; browser/booking changes locally tested and deployed to preview. Previous PageView evidence targeted the wrong dataset and is superseded. Corrected-dataset PageView remains unverified on preview. Hashed-email/phone-only CAPI is now implemented locally; successful preview booking verification remains blocked by environment configuration. No production release, migration, ad publication, or spend.

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

## Implementation and release gates

Dataset correction is implemented locally, not deployed. The existing hosted preview still uses the earlier dataset and is not launch verification.

Confirmed dataset: **549342503537516 (805 pixel)**. Browser pixel, Schedule CAPI and existing Lead CAPI share the same constant. Legacy META_PIXEL_ID / NEXT_PUBLIC_META_PIXEL_ID values cannot override it. The Meta token and test code must belong to this corrected dataset.

- Browser event: Schedule, eventID = saved CRM lead ID. Public PageView uses a synchronous queue, including the booking route. Private CRM/API paths are excluded.
- Booking UTM parameters take precedence over older session attribution.
- Existing atomic booking_commit writes the lead, job, calendar entry, quote, request result, and notification outbox together. Missing lead ID fails closed; transaction failures emit sanitized codes.
- 24-hour duplicate guard compares normalized name + phone + address under the existing schedule row lock. Same-key retries return the original booking; new-key refreshes cannot create another lead.
- Apply `20260927194921_meta_booking_launch.sql` only to an isolated preview database. It has been exercised locally, not applied remotely.
- Preview requests targeting production Supabase evuxqsaucmvgyuvjpqlo are blocked.
- The user approved SHA-256 hashed email and phone only. Schedule CAPI sends only em/ph in user_data, a fixed clean booking URL, event name/time/ID and test code. It excludes IP, user agent, cookies, names, addresses and query strings. The existing non-booking Lead helper has not been repurposed.
- Schedule is saved in the atomic booking outbox with the same saved lead ID used by the browser. Provider acceptance is persisted; failures remain pending with sanitized errors and retry the original event ID/time. Preview requires a Meta test event code. Customer notifications remain paused.
- Configure META_CAPI_ACCESS_TOKEN and META_CAPI_TEST_EVENT_CODE securely in Vercel Preview; do not put secret values in this document or source files.
- Connected Supabase branch access returns 403. An authorized account must provide the isolated preview branch and its Vercel preview configuration.

## Required hosted verification (not yet completed)

Load `/book-consultation/?utm_source=test&utm_medium=cpc&utm_campaign=verify&utm_content=meta-preview`, complete an unmistakably labeled test booking on an isolated preview database with all notifications disabled, and retain:

1. Browser PageView network evidence for dataset 549342503537516 (805 pixel).
2. Browser Schedule eventID and accepted CAPI Schedule event_id, both equal to the saved lead ID.
3. Supabase lead row with four expected UTM values.
4. Duplicate request within 24 hours returning 409 and unchanged lead/job/calendar counts.
5. Same-key replay returning the same lead ID after an interrupted response.

Local automated tests are not a substitute for this hosted verification.

## Verification results — September 27, 2026

Preview deployment: https://805-qt1d57lb4-805-shutters.vercel.app

Booking URL tested: https://805-qt1d57lb4-805-shutters.vercel.app/book-consultation/?utm_source=test&utm_medium=cpc&utm_campaign=verify&utm_content=meta-preview

Deployed commit: 10ea167c (`codex/meta-static-launch`). Vercel deployment dpl_4mKapdo9zNdH66oT4CmGS1DXMAcY is READY, target preview. No push/merge to main and no production deployment or remote migration.

| Required check | Result | Evidence |
|---|---|---|
| Booking PageView | NOT VERIFIED FOR CORRECTED DATASET | Prior HTTP 200 targeted 117872572252906; this evidence is superseded. Repeat against 549342503537516. |
| Browser + CAPI Schedule, matching IDs | BLOCKED / NOT VERIFIED | No successful booking. CAPI fields are now approved and implemented locally; staging credentials and visible Meta Preview configuration remain pending. |
| Saved Supabase lead with UTMs | BLOCKED / NOT VERIFIED | Form submitted all four expected UTMs, but preview is still configured for production Supabase. The preview guard returned 503 before any database write. |
| 24-hour duplicate protection on preview | BLOCKED / NOT VERIFIED | No completed preview booking exists to replay. Local transaction and real Postgres race tests passed. |

Actual browser walkthrough: selected September 30 at 1 PM, entered synthetic test contact details and a public test address, selected Roman Shades, clicked Book appointment / No follow-up necessary. The visible result was “Preview booking requires an isolated preview database.” No success or conversion is claimed.

Local verification: 160 booking/tracking tests passed across 13 files; 8 opt-in concurrent tests ran separately and all passed in a temporary Postgres container. TypeScript check and local/Vercel builds passed. The shared SQL transaction, rollback on failed lead write, UTM persistence, same-key replay, different-key 24-hour protection, and simultaneous submissions were exercised locally.

Remaining intervention: provide the isolated Supabase preview project reference and securely configured staging URL/keys, with authorized staging migration/read access. The user reports that META_CAPI_ACCESS_TOKEN and META_CAPI_TEST_EVENT_CODE are configured, but fresh Vercel CLI listings for 805-shutters/805 Preview and codex/meta-static-launch do not expose either variable name. The logged-in Vercel settings UI confirms META_CAPI_ACCESS_TOKEN is Production only and no META_CAPI_TEST_EVENT_CODE is listed. Correct Preview scope before hosted booking verification. No secret values were read or stored.

The earlier CAPI approval rejection is resolved by explicit user approval for hashed email/phone only; the broader rejected payload was not implemented. Production-secret export remains prohibited and was not retried.

Latest local checks: focused booking/tracking suite 148 passed; eight real PostgreSQL concurrency tests passed separately; typecheck/build passed. The central preview guard passed its four tests. The full repository run passed 9,431 tests with two quote-pricing timeouts; both affected files then passed all 110 tests with one worker. Final typecheck passed. These do not establish a successful hosted booking.

Dataset correction checks: 34 focused browser/CAPI/delivery/isolation tests passed, including stale environment override tests; typecheck passed. Corrected-dataset hosted checks remain unverified pending staging configuration and preview deployment.
